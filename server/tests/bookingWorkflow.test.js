import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initializeDatabase, getDatabase, closeDatabase, withTransaction } from '../database.js';
import { app } from '../server.js';
import { BOOKING_STATES, updateItemStates, deliverStatusNotifications, queueLeaderBookingNotifications } from '../bookingWorkflow.js';
import { buildBookingStatusMessage, buildLeaderBookingMessage } from '../emailService.js';

let directory, server, base, adminToken, leaderToken, db;
const admin = { ruolo: 'admin', branche: [] };
const leader = { ruolo: 'capo_unita', branche: ['Branco'] };
const request = async (url, { token = adminToken, method = 'GET', body } = {}) => {
  const response = await fetch(`${base}${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, headers: response.headers, data: await response.json() };
};

before(async () => {
  if (process.env.DB_HOST && process.env.WORKFLOW_TEST_POSTGRES !== '1') {
    throw new Error('Per i test PostgreSQL usa un database temporaneo e WORKFLOW_TEST_POSTGRES=1');
  }
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  directory = await mkdtemp(path.join(tmpdir(), 'booking-workflow-'));
  await initializeDatabase({ filename: path.join(directory, 'test.db') });
  db = getDatabase();
  await db.run('INSERT INTO prodotti (id, nome, tipologia, branca, taglia, prezzo, quantita_magazzino) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [1, 'Camicia', 'Uniforme', 'Lupetti', 'M', 25, 100]);
  await db.run('INSERT INTO prodotti (id, nome, tipologia, branca, taglia, prezzo) VALUES (?, ?, ?, ?, ?, ?)',
    [2, 'Camicia', 'Uniforme', 'Lupetti', 'L', 25]);
  await db.run('INSERT INTO prodotti (id, nome, tipologia, branca, taglia, prezzo) VALUES (?, ?, ?, ?, ?, ?)',
    [3, 'Camicia', 'Uniforme', 'Rover', 'M', 25]);
  for (const [id, branch, archived] of [['a', 'Branco', 0], ['b', 'Branco', 0], ['c', 'Clan', 0], ['d', 'Branco', 1]]) {
    await db.run('INSERT INTO prenotazioni (id, nome_prenotante, email_prenotante, branca_riferimento, archiviata) VALUES (?, ?, ?, ?, ?)',
      [id, `Persona ${id}`, `${id}@example.test`, branch, archived]);
  }
  for (const [id, booking, product, quantity] of [[1, 'a', 1, 2], [2, 'a', 2, 1], [3, 'b', 1, 3], [4, 'c', 3, 1], [5, 'd', 1, 1]]) {
    await db.run('INSERT INTO dettagli_prenotazioni (id, prenotazione_id, prodotto_id, quantita, prezzo_unitario) VALUES (?, ?, ?, ?, ?)',
      [id, booking, product, quantity, 25]);
  }
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await closeDatabase();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('login, admin account creation, branch-scoped access and expired sessions', async () => {
  assert.equal((await request('/api/admin/prenotazioni', { token: null })).status, 401);
  assert.equal((await request('/api/admin/login', { method: 'POST', token: null, body: { email: 'admin@example.test', password: 'wrong' } })).status, 401);
  const login = await request('/api/admin/login', { method: 'POST', token: null, body: { email: 'admin@example.test', password: 'test-admin-password' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.ruolo, 'admin');
  adminToken = login.data.token;
  assert.match(adminToken, /^[a-f0-9]{64}$/);
  for (const branche of [[], ['Branco', 'Clan'], ['Branco', 'Branco'], ['Non valida']]) {
    const invalid = await request('/api/admin/capi-unita', { method: 'POST',
      body: { nome: 'Capo', email: 'invalid@example.test', password: 'test-leader-password', branche } });
    assert.equal(invalid.status, 400);
  }
  assert.equal((await request('/api/admin/capi-unita', { method: 'POST',
    body: { nome: 'Capo', email: 'capo@example.test', password: 'test-leader-password', branche: ['Branco'] } })).status, 201);
  const account = await db.get('SELECT * FROM admin_users WHERE email = ?', ['capo@example.test']);
  assert.notEqual(account.password_hash, 'test-leader-password');
  const leaderLogin = await request('/api/admin/login', { method: 'POST', token: null,
    body: { email: 'capo@example.test', password: 'test-leader-password' } });
  assert.equal(leaderLogin.status, 200);
  leaderToken = leaderLogin.data.token;
  const list = await request('/api/admin/prenotazioni-capo', { token: leaderToken });
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 3);
  assert.ok(list.data.every(row => row.branca_riferimento === 'Branco'));
  for (const url of ['/api/admin/prenotazioni', '/api/admin/articoli-prenotati', '/api/admin/capi-unita']) {
    assert.equal((await request(url, { token: leaderToken })).status, 403);
  }
  assert.equal((await request('/api/admin/articoli-prenotati/stato', { token: leaderToken, method: 'POST', body: { ids: [1], stato: 'pagato' } })).status, 403);
  assert.equal((await request('/api/admin/prenotazioni-capo/paga', { token: leaderToken, method: 'POST', body: { prenotazioneIds: ['a', 'c'] } })).status, 403);
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 1')).stato, 'prenotato');
  const anotherLogin = await request('/api/admin/login', { method: 'POST', token: null, body: { email: 'admin@example.test', password: 'test-admin-password' } });
  await db.run('UPDATE sessioni SET scadenza = 0 WHERE token_hash = ?',
    [createHash('sha256').update(anotherLogin.data.token).digest('hex')]);
  assert.equal((await request('/api/admin/me', { token: anotherLogin.data.token })).status, 401);
});

test('article sizes, quantities and purchaser detail fields are exposed', async () => {
  const result = await request('/api/admin/articoli-prenotati');
  assert.equal(result.status, 200);
  assert.equal(result.data.length, 4);
  const medium = result.data.filter(item => item.taglia === 'M');
  assert.equal(medium.reduce((total, row) => total + row.quantita, 0), 6);
  for (const item of result.data) {
    for (const field of ['nome_prenotante', 'email_prenotante', 'branca_riferimento', 'data_prenotazione', 'stato']) assert.ok(item[field]);
  }
  assert.equal((await request('/api/admin/articoli-prenotati?archiviate=true')).data.length, 1);
});

test('session restoration preserves roles across admin and leader requests and cannot be cached', async () => {
  for (const [token, role] of [
    [adminToken, 'admin'], [leaderToken, 'capo_unita'],
    [adminToken, 'admin'], [leaderToken, 'capo_unita']
  ]) {
    const restored = await request(`/api/admin/me?sessionCheck=${Date.now()}`, { token });
    assert.equal(restored.status, 200);
    assert.equal(restored.data.ruolo, role);
    assert.equal(restored.headers.get('cache-control'), 'no-store');
    assert.match(restored.headers.get('vary'), /Authorization/i);
    if (role === 'capo_unita') {
      assert.deepEqual(restored.data.branche, ['Branco']);
      assert.equal((await request('/api/admin/capi-unita', { token })).status, 403);
    }
  }
  const anonymous = await request('/api/admin/me', { token: null });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
});

test('bulk states are atomic, valid and scoped; only real transitions enqueue email', async () => {
  await assert.rejects(updateItemStates(admin, [1, 9999], 'ricevuto'), { status: 404 });
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 1')).stato, 'prenotato');
  await assert.rejects(updateItemStates(admin, [1, 5], 'ricevuto'), { status: 400 });
  await assert.rejects(updateItemStates(leader, [1, 4], 'pagato'), { status: 403 });
  await assert.rejects(updateItemStates(leader, [1], 'ordinato'), { status: 403 });
  await assert.rejects(updateItemStates(admin, [1], 'attiva'), { status: 400 });
  await assert.rejects(updateItemStates(admin, [1], 'non_pagato'), { status: 400 });
  await assert.rejects(updateItemStates(admin, [1.5], 'pagato'), { status: 400 });
  for (const state of BOOKING_STATES) {
    const result = await updateItemStates(admin, [1, 2, 3], state);
    const shouldNotify = ['ricevuto', 'non_disponibile'].includes(state);
    assert.equal(result.emailInCoda, shouldNotify ? 2 : 0);
    assert.equal((await updateItemStates(admin, [1, 2, 3], state)).aggiornati, 0);
  }
  const messages = await db.all('SELECT * FROM notifiche_stato');
  assert.equal(messages.length, 4);
  const payload = messages.map(item => JSON.parse(item.payload)).find(item => item.id === 'a');
  assert.equal(payload.items.length, 2);
});

test('leader pays complete bookings while retaining fulfillment states', async () => {
  await updateItemStates(admin, [1], 'ordinato');
  await updateItemStates(admin, [2], 'prenotato');
  await db.run('UPDATE dettagli_prenotazioni SET pagamento_registrato = 0 WHERE id IN (1, 2)');
  const result = await request('/api/admin/prenotazioni-capo/paga', { token: leaderToken, method: 'POST', body: { prenotazioneIds: ['a'] } });
  assert.equal(result.status, 200);
  assert.equal(result.data.aggiornati, 2);
  const items = await db.all("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = 'a' ORDER BY id");
  assert.ok(items.every(item => Number(item.pagamento_registrato) === 1));
  assert.equal(items[0].stato, 'ordinato');
  assert.equal(items[1].stato, 'pagato');
  assert.equal((await request('/api/admin/prenotazioni-capo/paga', { token: leaderToken, method: 'POST', body: { prenotazioneIds: ['a'] } })).status, 400);
});

test('legacy branch names resolve to their assigned unit without broadening access', async () => {
  await db.run('INSERT INTO prenotazioni (id, nome_prenotante, email_prenotante, branca_riferimento) VALUES (?, ?, ?, ?)',
    ['legacybranch', 'Persona legacy', 'legacy@example.test', 'Lupetti']);
  await db.run('INSERT INTO dettagli_prenotazioni (id, prenotazione_id, prodotto_id, quantita, prezzo_unitario) VALUES (?, ?, ?, ?, ?)',
    [6, 'legacybranch', 1, 1, 25]);
  const list = await request('/api/admin/prenotazioni-capo', { token: leaderToken });
  assert.ok(list.data.some(row => row.prenotazione_id === 'legacybranch'));
  assert.ok(!list.data.some(row => row.branca_riferimento === 'Clan'));
  const payment = await request('/api/admin/prenotazioni-capo/paga', {
    token: leaderToken, method: 'POST', body: { prenotazioneIds: ['legacybranch'] }
  });
  assert.equal(payment.status, 200);
  assert.equal((await db.get('SELECT pagamento_registrato FROM dettagli_prenotazioni WHERE id = 6')).pagamento_registrato, 1);
});

test('editing a booking preserves line IDs, states and payment flags; failures roll back', async () => {
  const before = await db.all("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = 'a' ORDER BY id");
  const response = await request('/api/admin/prenotazioni/a', { method: 'PUT', body: {
    nome_prenotante: 'Nome aggiornato', items: before.map(item => ({ ...item, stato: 'prenotato', pagamento_registrato: 0 }))
  } });
  assert.equal(response.status, 200);
  const after = await db.all("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = 'a' ORDER BY id");
  assert.deepEqual(after, before);
  const bad = await request('/api/admin/prenotazioni/a', { method: 'PUT', body: {
    nome_prenotante: 'Non salvare', items: [{ id: 1, prodotto_id: 1, quantita: -1 }]
  } });
  assert.equal(bad.status, 400);
  assert.equal((await db.get("SELECT nome_prenotante FROM prenotazioni WHERE id = 'a'")).nome_prenotante, 'Nome aggiornato');
});

test('leaders can edit and delete only their own active entirely unpaid bookings', async () => {
  if (db.pool) {
    await db.get("SELECT setval(pg_get_serial_sequence('dettagli_prenotazioni', 'id'), (SELECT MAX(id) FROM dettagli_prenotazioni))");
  }
  for (const [id, branch, archived] of [
    ['editable', 'Lupetti', 0], ['other-unit', 'Clan', 0], ['archived', 'Branco', 1],
    ['paid', 'Branco', 0], ['partial', 'Branco', 0]
  ]) {
    await db.run(
      'INSERT INTO prenotazioni (id, nome_prenotante, email_prenotante, branca_riferimento, archiviata) VALUES (?, ?, ?, ?, ?)',
      [id, id, `${id}@example.test`, branch, archived]
    );
    await db.run(
      'INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, pagamento_registrato) VALUES (?, ?, ?, ?, ?)',
      [id, 1, 2, 25, ['paid', 'partial'].includes(id) ? 1 : 0]
    );
  }
  await db.run(
    "INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario) VALUES ('partial', 2, 1, 25)"
  );
  const token = leaderToken;
  assert.equal((await request('/api/admin/prenotazioni/editable', { token })).status, 200);
  for (const id of ['other-unit', 'archived']) {
    assert.equal((await request(`/api/admin/prenotazioni/${id}`, { token })).status, 403);
  }
  for (const id of ['other-unit', 'archived', 'paid', 'partial']) {
    for (const method of ['PUT', 'DELETE']) {
      assert.equal((await request(`/api/admin/prenotazioni/${id}`, {
        token, method, body: method === 'PUT' ? { nome_prenotante: 'Forbidden' } : undefined
      })).status, 403);
    }
    assert.equal((await db.get('SELECT nome_prenotante FROM prenotazioni WHERE id = ?', [id])).nome_prenotante, id);
  }
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await request('/api/admin/prenotazioni/missing', { token, method })).status, 404);
  }
  assert.equal((await request('/api/admin/prenotazioni/editable', {
    token, method: 'PUT', body: { branca_riferimento: 'Clan' }
  })).status, 403);
  assert.equal((await request('/api/admin/prenotazioni/editable', {
    token, method: 'PUT', body: { items: [] }
  })).status, 400);
  const original = await db.get("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = 'editable'");
  const stock = Number((await db.get('SELECT quantita_magazzino FROM prodotti WHERE id = 1')).quantita_magazzino);
  await db.run("UPDATE dettagli_prenotazioni SET stato = 'non_disponibile' WHERE id = ?", [original.id]);
  const result = await request('/api/admin/prenotazioni/editable', { token, method: 'PUT', body: {
    nome_prenotante: 'Aggiornato', note: 'Nuova nota',
    items: [{ ...original, quantita: 3, prezzo_unitario: 0, pagamento_registrato: 1, stato: 'pagato' },
      { prodotto_id: 2, quantita: 1, prezzo_unitario: 0 }]
  } });
  assert.equal(result.status, 200);
  const updated = await db.all("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = 'editable' ORDER BY id");
  assert.equal(updated[0].id, original.id);
  assert.equal(updated[0].quantita, 3);
  assert.equal(updated[0].stato, 'non_disponibile');
  assert.equal(updated[0].pagamento_registrato, 0);
  assert.ok(updated.every(item => Number(item.prezzo_unitario) === 25));
  assert.equal(updated[1].stato, 'prenotato');
  assert.equal(Number((await db.get('SELECT quantita_magazzino FROM prodotti WHERE id = 1')).quantita_magazzino), stock - 1);
  assert.equal((await request('/api/admin/prenotazioni/editable', { token, method: 'DELETE' })).status, 200);
  assert.equal(await db.get("SELECT id FROM prenotazioni WHERE id = 'editable'"), undefined);
  assert.equal((await db.all("SELECT id FROM dettagli_prenotazioni WHERE prenotazione_id = 'editable'")).length, 0);
  assert.equal(Number((await db.get('SELECT quantita_magazzino FROM prodotti WHERE id = 1')).quantita_magazzino), stock + 2);
  assert.equal((await request('/api/admin/prenotazioni/paid', { method: 'PUT', body: { note: 'Admin consentito' } })).status, 200);
  assert.equal((await request('/api/admin/prenotazioni/paid', { method: 'DELETE' })).status, 200);
  for (const id of ['other-unit', 'archived', 'partial']) {
    assert.equal((await request(`/api/admin/prenotazioni/${id}`, { method: 'DELETE' })).status, 200);
  }
});

test('email content is state-specific and escaped, and delivery errors persist for retry', async () => {
  assert.throws(() => buildBookingStatusMessage({ stato: 'non_pagato' }), /Stato email non valido/);
  for (const state of ['ricevuto', 'non_disponibile']) {
    const message = buildBookingStatusMessage({ id: 'a', nome_prenotante: '<script>', email_prenotante: 'a@example.test',
      stato: state, items: [{ nome: '<Camicia>', taglia: 'M', quantita: 2 }] });
    assert.equal(message.to, 'a@example.test');
    assert.match(message.text, /<Camicia> \(M\): 2/);
    assert.match(message.html, /&lt;Camicia&gt;/);
    assert.ok(!message.html.includes('<script>'));
    assert.ok(message.subject.length);
  }
  await deliverStatusNotifications(async () => { throw new Error('SMTP test unavailable'); });
  const pending = await db.all("SELECT * FROM notifiche_stato WHERE stato = 'pending'");
  assert.ok(pending.length > 0);
  assert.ok(pending.every(item => item.ultimo_errore === 'SMTP test unavailable' && Number(item.tentativi) === 1));
  await db.run("UPDATE notifiche_stato SET prossimo_tentativo = 0 WHERE stato = 'pending'");
  const sent = [];
  await deliverStatusNotifications(async payload => { sent.push(payload); });
  assert.equal(sent.length, pending.length);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM notifiche_stato WHERE stato != 'sent'")).n), 0);
  await deliverStatusNotifications(async () => assert.fail('Already-sent email must not be resent'));
});

test('transactions roll back and concurrent state requests do not duplicate notifications', async () => {
  await assert.rejects(withTransaction(async tx => {
    await tx.run("UPDATE dettagli_prenotazioni SET stato = 'pagato' WHERE id = 4");
    throw new Error('rollback test');
  }));
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 4')).stato, 'prenotato');
  const results = await Promise.all([updateItemStates(admin, [4], 'ricevuto'), updateItemStates(admin, [4], 'ricevuto')]);
  assert.equal(results.reduce((sum, result) => sum + result.emailInCoda, 0), 1);
});

test('checkout queues complete notifications only for matching leader accounts and retries delivery', async () => {
  for (const [email, branches] of [
    ['second-leader@example.test', ['Branco']],
    ['other-leader@example.test', ['Clan']],
    ['invalid-leader@example.test', ['Branco', 'Clan']]
  ]) {
    await db.run('INSERT INTO admin_users (nome, email, password_hash, ruolo, branche) VALUES (?, ?, ?, ?, ?)',
      ['Notification test', email, 'unused', 'capo_unita', JSON.stringify(branches)]);
  }
  const notificationCount = Number((await db.get('SELECT COUNT(*) AS n FROM notifiche_stato')).n);
  const body = {
    nome_prenotante: '<Persona>', email_prenotante: 'checkout@example.test', branca_riferimento: 'Lupetti',
    note: '<Nota>', items: [{ prodotto_id: 1, quantita: 2, specialita: '<Specialità>' }, { prodotto_id: 2, quantita: 1 }]
  };
  const invalid = await request('/api/prenotazioni', { method: 'POST', token: null, body: { ...body, email_prenotante: 'invalid' } });
  assert.equal(invalid.status, 400);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM notifiche_stato')).n), notificationCount);
  const created = await request('/api/prenotazioni', { method: 'POST', token: null, body });
  assert.equal(created.status, 201);
  assert.equal(created.data.leaderEmailsQueued, 2);
  const notifications = (await db.all("SELECT * FROM notifiche_stato WHERE stato = 'pending'"))
    .filter(row => JSON.parse(row.payload).id === created.data.id);
  assert.equal(notifications.length, 2);
  const payloads = notifications.map(row => JSON.parse(row.payload));
  assert.deepEqual(payloads.map(payload => payload.destinatario).sort(),
    ['capo@example.test', 'second-leader@example.test']);
  for (const payload of payloads) {
    assert.equal(payload.tipo, 'nuova_prenotazione');
    assert.equal(payload.items.length, 2);
    const message = buildLeaderBookingMessage(payload);
    assert.equal(message.to, payload.destinatario);
    assert.match(message.text, /Camicia \(M\).*Specialità/);
    assert.match(message.text, /Camicia \(L\)/);
    assert.match(message.text, /Totale da pagare: € 75\.00/);
    assert.match(message.html, /&lt;Persona&gt;/);
    assert.match(message.html, /&lt;Nota&gt;/);
    assert.ok(!message.html.includes('<Specialità>'));
    assert.match(message.html, /<html lang="it">/);
    assert.match(message.html, /<thead>/);
    assert.match(message.html, /Articoli prenotati/);
    assert.match(message.html, /DA PAGARE/);
    assert.match(message.html, /€&nbsp;75\.00/);
    assert.match(message.html, /Note del prenotante/);
    assert.ok(!buildLeaderBookingMessage({ ...payload, note: '' }).html.includes('Note del prenotante'));
  }
  await deliverStatusNotifications(async payload => {
    if (payload.tipo === 'nuova_prenotazione') throw new Error('Leader SMTP unavailable');
  });
  for (const notification of notifications) {
    const pending = await db.get('SELECT * FROM notifiche_stato WHERE id = ?', [notification.id]);
    assert.equal(pending.stato, 'pending');
    assert.equal(Number(pending.tentativi), 1);
    assert.equal(pending.ultimo_errore, 'Leader SMTP unavailable');
    await db.run('UPDATE notifiche_stato SET prossimo_tentativo = 0 WHERE id = ?', [notification.id]);
  }
  const sent = [];
  await deliverStatusNotifications(async payload => sent.push(payload));
  assert.equal(sent.length, 2);
  await deliverStatusNotifications(async () => assert.fail('Do not resend delivered leader notifications'));
  const afterDelivery = Number((await db.get('SELECT COUNT(*) AS n FROM notifiche_stato')).n);
  assert.equal((await request(`/api/admin/prenotazioni/${created.data.id}`, {
    token: leaderToken, method: 'PUT', body: { note: 'Aggiornamento' }
  })).status, 200);
  assert.equal((await request('/api/admin/prenotazioni-capo/paga', {
    token: leaderToken, method: 'POST', body: { prenotazioneIds: [created.data.id] }
  })).status, 200);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM notifiche_stato')).n), afterDelivery);
  await assert.rejects(withTransaction(async tx => {
    await queueLeaderBookingNotifications(tx, { ...payloads[0], id: 'rolled-back' });
    throw new Error('Queue rollback');
  }), /Queue rollback/);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM notifiche_stato')).n), afterDelivery);
  await withTransaction(async tx => {
    assert.equal(await queueLeaderBookingNotifications(tx, { ...payloads[0], branca_riferimento: 'Fuoco' }), 0);
  });
  assert.equal((await request(`/api/admin/prenotazioni/${created.data.id}`, { method: 'DELETE' })).status, 200);
  for (const email of ['second-leader@example.test', 'other-leader@example.test', 'invalid-leader@example.test']) {
    await db.run('DELETE FROM admin_users WHERE email = ?', [email]);
  }
});

test('legacy buying action records Ordered and respects unavailable items', async () => {
  await updateItemStates(admin, [1], 'prenotato');
  await updateItemStates(admin, [2], 'non_disponibile');
  const list = await request('/api/admin/da-acquistare?soloRichiesti=true');
  assert.equal(list.status, 200);
  assert.equal(list.data.some(item => item.id === 2), false);
  const result = await request('/api/admin/da-acquistare/acquista', { method: 'POST', body: { productIds: [1, 2] } });
  assert.equal(result.status, 200);
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 1')).stato, 'ordinato');
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 2')).stato, 'non_disponibile');
});

test('bulk deletion is atomic, scoped, restores stock and removes only selected admin lines', async () => {
  const fixtures = [
    ['bulk-own', 'Branco', 0, 0], ['bulk-other', 'Clan', 0, 0],
    ['bulk-paid', 'Branco', 0, 1], ['bulk-archived', 'Branco', 1, 0],
    ['bulk-partial', 'Branco', 0, 0], ['bulk-admin', 'Branco', 0, 0]
  ];
  for (const [id, branch, archived, payment] of fixtures) {
    await db.run('INSERT INTO prenotazioni (id, nome_prenotante, email_prenotante, branca_riferimento, archiviata) VALUES (?, ?, ?, ?, ?)',
      [id, id, `${id}@example.test`, branch, archived]);
    await db.run('INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, pagamento_registrato) VALUES (?, ?, ?, ?, ?)',
      [id, 1, 2, 25, payment]);
  }
  await db.run("INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, pagamento_registrato) VALUES ('bulk-partial', 2, 1, 25, 1)");
  await db.run("INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, acquistato) VALUES ('bulk-admin', 2, 3, 25, 1)");
  const call = (body, token = leaderToken) => request('/api/admin/elimina-selezionati', { method: 'POST', token, body });
  assert.equal((await call({ prenotazioneIds: ['bulk-own'] }, null)).status, 401);
  for (const ids of [[], [''], [1], Array(101).fill('bulk-own')]) {
    assert.equal((await call({ prenotazioneIds: ids })).status, 400);
  }
  const stock = Number((await db.get('SELECT quantita_magazzino FROM prodotti WHERE id = 1')).quantita_magazzino);
  for (const [invalid, status] of [
    ['missing', 404], ['bulk-other', 403], ['bulk-paid', 403], ['bulk-archived', 403], ['bulk-partial', 403]
  ]) {
    assert.equal((await call({ prenotazioneIds: ['bulk-own', invalid] })).status, status);
    assert.ok(await db.get("SELECT id FROM prenotazioni WHERE id = 'bulk-own'"));
    assert.equal(Number((await db.get('SELECT quantita_magazzino FROM prodotti WHERE id = 1')).quantita_magazzino), stock);
  }
  const deleted = await call({ prenotazioneIds: ['bulk-own', 'bulk-own'] });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.data, { righeEliminate: 1, prenotazioniEliminate: 1 });
  assert.equal(Number((await db.get('SELECT quantita_magazzino FROM prodotti WHERE id = 1')).quantita_magazzino), stock + 2);
  const adminItems = await db.all("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = 'bulk-admin' ORDER BY id");
  const archivedItem = await db.get("SELECT id FROM dettagli_prenotazioni WHERE prenotazione_id = 'bulk-archived'");
  for (const ids of [[], ['1'], [0], [1.5], Array(501).fill(adminItems[0].id)]) {
    assert.equal((await call({ ids }, adminToken)).status, 400);
  }
  for (const [id, status] of [[999999, 404], [archivedItem.id, 400]]) {
    assert.equal((await call({ ids: [adminItems[0].id, id] }, adminToken)).status, status);
    assert.ok(await db.get('SELECT id FROM dettagli_prenotazioni WHERE id = ?', [adminItems[0].id]));
  }
  assert.deepEqual((await call({ ids: [adminItems[0].id, adminItems[0].id] }, adminToken)).data,
    { righeEliminate: 1, prenotazioniEliminate: 0 });
  assert.ok(await db.get("SELECT id FROM prenotazioni WHERE id = 'bulk-admin'"));
  assert.ok(await db.get('SELECT id FROM dettagli_prenotazioni WHERE id = ?', [adminItems[1].id]));
  await db.run('UPDATE prodotti SET quantita_magazzino = 10 WHERE id = 2');
  assert.deepEqual((await call({ ids: [adminItems[1].id] }, adminToken)).data,
    { righeEliminate: 1, prenotazioniEliminate: 1 });
  assert.equal(Number((await db.get('SELECT quantita_magazzino FROM prodotti WHERE id = 2')).quantita_magazzino), 10);
  assert.equal(await db.get("SELECT id FROM prenotazioni WHERE id = 'bulk-admin'"), undefined);
  for (const [id] of fixtures) {
    if (await db.get('SELECT id FROM prenotazioni WHERE id = ?', [id])) {
      assert.equal((await request(`/api/admin/prenotazioni/${id}`, { method: 'DELETE' })).status, 200);
    }
  }
});

test('selected booking archival is admin-only, atomic and preserves items, stock and notifications', async () => {
  for (const id of ['archive-first', 'archive-second', 'archive-unselected']) {
    await db.run('INSERT INTO prenotazioni (id, nome_prenotante, email_prenotante, branca_riferimento) VALUES (?, ?, ?, ?)',
      [id, id, `${id}@example.test`, 'Branco']);
    await db.run('INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, stato, pagamento_registrato) VALUES (?, ?, ?, ?, ?, ?)',
      [id, 1, 2, 25, 'ricevuto', 1]);
  }
  const endpoint = '/api/admin/prenotazioni/archivia-selezionate';
  const call = (ids, token = adminToken) => request(endpoint, { token, method: 'POST', body: { prenotazioneIds: ids } });
  assert.equal((await call(['archive-first'], null)).status, 401);
  assert.equal((await call(['archive-first'], leaderToken)).status, 403);
  for (const ids of [undefined, [], [''], [1], Array(101).fill('archive-first')]) {
    assert.equal((await call(ids)).status, 400);
  }
  for (const [id, status] of [['missing-archive', 404], ['d', 400]]) {
    assert.equal((await call(['archive-first', id])).status, status);
    assert.equal(Number((await db.get("SELECT archiviata FROM prenotazioni WHERE id = 'archive-first'")).archiviata), 0);
  }
  const itemsBefore = await db.all("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id IN ('archive-first', 'archive-second') ORDER BY id");
  const stockBefore = await db.all('SELECT id, quantita_magazzino FROM prodotti ORDER BY id');
  const notificationsBefore = await db.all('SELECT * FROM notifiche_stato ORDER BY id');
  const archived = await call(['archive-first', 'archive-second', 'archive-first']);
  assert.equal(archived.status, 200);
  assert.deepEqual(archived.data, { archiviate: 2 });
  for (const id of ['archive-first', 'archive-second']) {
    const booking = await db.get('SELECT * FROM prenotazioni WHERE id = ?', [id]);
    assert.equal(Number(booking.archiviata), 1);
    assert.ok(booking.data_archiviazione);
    assert.ok(!(await request('/api/admin/prenotazioni?archiviate=false')).data.some(row => row.id === id));
    assert.ok((await request('/api/admin/prenotazioni?archiviate=true')).data.some(row => row.id === id));
    assert.ok(!(await request('/api/admin/articoli-prenotati')).data.some(row => row.prenotazione_id === id));
    assert.ok((await request('/api/admin/articoli-prenotati?archiviate=true')).data.some(row => row.prenotazione_id === id));
    assert.ok(!(await request('/api/admin/prenotazioni-capo', { token: leaderToken })).data.some(row => row.prenotazione_id === id));
  }
  assert.equal(Number((await db.get("SELECT archiviata FROM prenotazioni WHERE id = 'archive-unselected'")).archiviata), 0);
  assert.deepEqual(await db.all("SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id IN ('archive-first', 'archive-second') ORDER BY id"), itemsBefore);
  assert.deepEqual(await db.all('SELECT id, quantita_magazzino FROM prodotti ORDER BY id'), stockBefore);
  assert.deepEqual(await db.all('SELECT * FROM notifiche_stato ORDER BY id'), notificationsBefore);
  assert.equal((await call(['archive-unselected', 'archive-first'])).status, 400);
  assert.equal(Number((await db.get("SELECT archiviata FROM prenotazioni WHERE id = 'archive-unselected'")).archiviata), 0);
  for (const id of ['archive-first', 'archive-second', 'archive-unselected']) {
    assert.equal((await request(`/api/admin/prenotazioni/${id}`, { method: 'DELETE' })).status, 200);
  }
});

test('removing an account immediately revokes its sessions', async () => {
  const account = await db.get("SELECT id FROM admin_users WHERE email = 'capo@example.test'");
  await db.run('UPDATE admin_users SET branche = ? WHERE id = ?', ['["Branco","Clan"]', account.id]);
  assert.equal((await request('/api/admin/prenotazioni-capo', { token: leaderToken })).status, 403);
  await db.run('UPDATE admin_users SET branche = ? WHERE id = ?', ['["Branco"]', account.id]);
  const accounts = await request('/api/admin/capi-unita');
  assert.equal(accounts.status, 200);
  assert.equal((await request(`/api/admin/capi-unita/${accounts.data[0].id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await request('/api/admin/me', { token: leaderToken })).status, 401);
});

test('schema upgrades legacy purchased lines and preserves states on reinitialization', async () => {
  await closeDatabase();
  const filename = path.join(directory, 'legacy.db');
  if (!process.env.DB_HOST) {
    const { default: sqlite3 } = await import('sqlite3');
    const { open } = await import('sqlite');
    const legacy = await open({ filename, driver: sqlite3.Database });
    await legacy.exec(`
      CREATE TABLE dettagli_prenotazioni (
        id INTEGER PRIMARY KEY, prenotazione_id TEXT, prodotto_id INTEGER,
        quantita INTEGER, prezzo_unitario REAL, specialita TEXT, acquistato INTEGER DEFAULT 0
      );
      INSERT INTO dettagli_prenotazioni (id, prenotazione_id, prodotto_id, quantita, prezzo_unitario, acquistato)
        VALUES (1, 'legacy', 1, 1, 10, 1), (2, 'legacy', 1, 1, 10, 0);
    `);
    await legacy.close();
  } else {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, ssl: false });
    await pool.query('ALTER TABLE dettagli_prenotazioni DROP COLUMN stato');
    await pool.query('UPDATE dettagli_prenotazioni SET acquistato = CASE WHEN id = 1 THEN 1 ELSE 0 END');
    await pool.end();
  }
  await initializeDatabase({ filename });
  db = getDatabase();
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 1')).stato, 'ordinato');
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 2')).stato, 'prenotato');
  await db.run("UPDATE dettagli_prenotazioni SET stato = 'ricevuto' WHERE id = 1");
  await db.run("UPDATE dettagli_prenotazioni SET stato = 'non_pagato', pagamento_registrato = 1 WHERE id = 2");
  for (const [id, state, status] of [
    ['removed-notification', 'non_pagato', 'pending'],
    ['kept-notification', 'ricevuto', 'pending'],
    ['sent-notification', 'non_pagato', 'sent']
  ]) {
    await db.run('INSERT INTO notifiche_stato (id, payload, stato) VALUES (?, ?, ?)',
      [id, JSON.stringify({ stato: state }), status]);
  }
  await closeDatabase();
  await initializeDatabase({ filename });
  db = getDatabase();
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 1')).stato, 'ricevuto');
  const migrated = await db.get('SELECT * FROM dettagli_prenotazioni WHERE id = 2');
  assert.equal(migrated.stato, 'prenotato');
  assert.equal(migrated.pagamento_registrato, 0);
  assert.equal(await db.get("SELECT id FROM notifiche_stato WHERE id = 'removed-notification'"), undefined);
  assert.ok(await db.get("SELECT id FROM notifiche_stato WHERE id = 'kept-notification'"));
  assert.ok(await db.get("SELECT id FROM notifiche_stato WHERE id = 'sent-notification'"));
  await closeDatabase();
  await initializeDatabase({ filename });
  db = getDatabase();
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 2')).stato, 'prenotato');
});
