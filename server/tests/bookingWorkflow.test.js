import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initializeDatabase, getDatabase, closeDatabase, withTransaction } from '../database.js';
import { app } from '../server.js';
import { BOOKING_STATES, updateItemStates, deliverStatusNotifications } from '../bookingWorkflow.js';
import { buildBookingStatusMessage } from '../emailService.js';

let directory, server, base, adminToken, leaderToken, db;
const admin = { ruolo: 'admin', branche: [] };
const leader = { ruolo: 'capo_unita', branche: ['Branco'] };
const request = async (url, { token = adminToken, method = 'GET', body } = {}) => {
  const response = await fetch(`${base}${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
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

test('bulk states are atomic, valid and scoped; only real transitions enqueue email', async () => {
  await assert.rejects(updateItemStates(admin, [1, 9999], 'ricevuto'), { status: 404 });
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 1')).stato, 'prenotato');
  await assert.rejects(updateItemStates(admin, [1, 5], 'ricevuto'), { status: 400 });
  await assert.rejects(updateItemStates(leader, [1, 4], 'pagato'), { status: 403 });
  await assert.rejects(updateItemStates(leader, [1], 'ordinato'), { status: 403 });
  await assert.rejects(updateItemStates(admin, [1], 'attiva'), { status: 400 });
  await assert.rejects(updateItemStates(admin, [1.5], 'pagato'), { status: 400 });
  for (const state of BOOKING_STATES) {
    const result = await updateItemStates(admin, [1, 2, 3], state);
    const shouldNotify = ['ricevuto', 'non_disponibile', 'non_pagato'].includes(state);
    assert.equal(result.emailInCoda, shouldNotify ? 2 : 0);
    assert.equal((await updateItemStates(admin, [1, 2, 3], state)).aggiornati, 0);
  }
  const messages = await db.all('SELECT * FROM notifiche_stato');
  assert.equal(messages.length, 6);
  const payload = messages.map(item => JSON.parse(item.payload)).find(item => item.id === 'a');
  assert.equal(payload.items.length, 2);
});

test('leader pays complete bookings while retaining fulfillment states', async () => {
  await updateItemStates(admin, [1], 'ordinato');
  await updateItemStates(admin, [2], 'non_pagato');
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

test('email content is state-specific and escaped, and delivery errors persist for retry', async () => {
  for (const state of ['ricevuto', 'non_disponibile', 'non_pagato']) {
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
    await tx.run("UPDATE dettagli_prenotazioni SET stato = 'non_pagato' WHERE id = 4");
    throw new Error('rollback test');
  }));
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 4')).stato, 'prenotato');
  const results = await Promise.all([updateItemStates(admin, [4], 'ricevuto'), updateItemStates(admin, [4], 'ricevuto')]);
  assert.equal(results.reduce((sum, result) => sum + result.emailInCoda, 0), 1);
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

test('removing an account immediately revokes its sessions', async () => {
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
  await closeDatabase();
  await initializeDatabase({ filename });
  db = getDatabase();
  assert.equal((await db.get('SELECT stato FROM dettagli_prenotazioni WHERE id = 1')).stato, 'ricevuto');
});
