import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getDatabase, withTransaction } from './database.js';
import { sendBookingStatusEmail, sendLeaderBookingEmail } from './emailService.js';

const scrypt = promisify(scryptCallback);
export const BOOKING_STATES = ['prenotato', 'pagato', 'non_disponibile', 'ordinato', 'ricevuto'];
export const BRANCHES = ['Cerchio', 'Branco', 'Riparto Ginestra', 'Riparto Sorgente', 'Riparto Atheste', 'Clan', 'Fuoco', 'RS'];
const notifiedStates = new Set(['ricevuto', 'non_disponibile']);
const branchAliases = { coccinelle: 'cerchio', lupetti: 'branco', rover: 'clan', capi: 'rs' };
export function normalizeBranch(value) {
  const normalized = String(value || '').trim().toLocaleLowerCase('it-IT');
  return branchAliases[normalized] || normalized;
}
const ownsBranch = (user, branch) => user.branche.some(assigned => normalizeBranch(assigned) === normalizeBranch(branch));
const digest = value => createHash('sha256').update(value).digest('hex');
const publicUser = user => ({ id: user.id, nome: user.nome, email: user.email, ruolo: user.ruolo, branche: JSON.parse(user.branche) });

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function checkPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

const route = handler => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    console.error('Errore gestione prenotazioni:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore gestione prenotazioni' });
  }
};

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export async function assertBookingAccess(db, user, booking, { editing = false, branch } = {}) {
  if (!booking) fail(404, 'Prenotazione non trovata');
  if (user.ruolo === 'admin') return;
  if (user.ruolo !== 'capo_unita' || !ownsBranch(user, booking.branca_riferimento)) {
    fail(403, 'Puoi gestire soltanto le prenotazioni della tua branca');
  }
  if (Number(booking.archiviata) === 1) fail(403, 'Prenotazione archiviata');
  if (!editing) return;
  if (branch && !ownsBranch(user, branch)) fail(403, 'Non puoi spostare la prenotazione in un’altra branca');
  const paidItem = await db.get(
    'SELECT id FROM dettagli_prenotazioni WHERE prenotazione_id = ? AND pagamento_registrato = 1 LIMIT 1',
    [booking.id]
  );
  if (paidItem) fail(403, 'Puoi modificare o eliminare soltanto prenotazioni interamente da pagare');
}

export async function deleteBookingItems(db, items) {
  for (const item of items) {
    if (Number(item.acquistato) !== 1) {
      await db.run(
        'UPDATE prodotti SET quantita_magazzino = quantita_magazzino + ? WHERE id = ? AND quantita_magazzino IS NOT NULL',
        [item.quantita, item.prodotto_id]
      );
    }
    await db.run('DELETE FROM dettagli_prenotazioni WHERE id = ?', [item.id]);
  }
}

export async function deleteSelectedBookings(user, ids) {
  const isAdmin = user.ruolo === 'admin';
  if (!isAdmin && user.ruolo !== 'capo_unita') fail(403, 'Operazione non consentita');
  const limit = isAdmin ? 500 : 100;
  if (!Array.isArray(ids) || !ids.length || ids.length > limit ||
      ids.some(id => isAdmin ? !Number.isSafeInteger(id) || id <= 0 : typeof id !== 'string' || !id.trim())) {
    fail(400, `Seleziona da 1 a ${limit} ${isAdmin ? 'righe articolo' : 'prenotazioni'} valide`);
  }
  const uniqueIds = [...new Set(ids)];
  const placeholders = uniqueIds.map(() => '?').join(',');
  return withTransaction(async db => {
    const bookings = await db.all(
      `SELECT * FROM prenotazioni WHERE id IN (${isAdmin
        ? `SELECT prenotazione_id FROM dettagli_prenotazioni WHERE id IN (${placeholders})`
        : placeholders}) ORDER BY id ${db.pool ? 'FOR UPDATE' : ''}`, uniqueIds
    );
    if (!isAdmin && bookings.length !== uniqueIds.length) fail(404, 'Una o più prenotazioni non esistono più');
    for (const booking of bookings) {
      await assertBookingAccess(db, user, booking, { editing: true });
      if (Number(booking.archiviata) === 1) fail(400, 'Non puoi eliminare righe archiviate');
    }
    const items = await db.all(
      `SELECT * FROM dettagli_prenotazioni WHERE ${isAdmin ? 'id' : 'prenotazione_id'} IN (${placeholders})
       ORDER BY id ${db.pool ? 'FOR UPDATE' : ''}`, uniqueIds
    );
    if (isAdmin && items.length !== uniqueIds.length) fail(404, 'Una o più righe articolo non esistono più');
    await deleteBookingItems(db, items);
    let deletedBookings = 0;
    for (const booking of bookings) {
      const remaining = await db.get('SELECT id FROM dettagli_prenotazioni WHERE prenotazione_id = ? LIMIT 1', [booking.id]);
      if (!remaining) {
        await db.run('DELETE FROM prenotazioni WHERE id = ?', [booking.id]);
        deletedBookings++;
      } else {
        await db.run('UPDATE prenotazioni SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [booking.id]);
      }
    }
    return { righeEliminate: items.length, prenotazioniEliminate: deletedBookings };
  });
}

export async function updateItemStates(user, ids, state) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 ||
      ids.some(id => !Number.isSafeInteger(id) || id <= 0) || !BOOKING_STATES.includes(state)) {
    fail(400, 'Seleziona da 1 a 500 righe e uno stato valido');
  }
  if (user.ruolo !== 'admin' && state !== 'pagato') fail(403, 'Puoi impostare soltanto lo stato Pagato');
  const uniqueIds = [...new Set(ids)];
  return withTransaction(async db => {
    if (db.pool) {
      await db.all(`SELECT id FROM prenotazioni
        WHERE id IN (SELECT prenotazione_id FROM dettagli_prenotazioni WHERE id IN (${uniqueIds.map(() => '?').join(',')}))
        ORDER BY id FOR UPDATE`, uniqueIds);
    }
    const rows = await db.all(`
      SELECT dp.*, p.nome, p.taglia, pr.nome_prenotante, pr.email_prenotante,
        pr.branca_riferimento, pr.archiviata
      FROM dettagli_prenotazioni dp
      JOIN prenotazioni pr ON pr.id = dp.prenotazione_id
      JOIN prodotti p ON p.id = dp.prodotto_id
      WHERE dp.id IN (${uniqueIds.map(() => '?').join(',')})
      ORDER BY dp.id
      ${db.pool ? 'FOR UPDATE OF dp' : ''}
    `, uniqueIds);
    if (rows.length !== uniqueIds.length) fail(404, 'Uno o più articoli non esistono più');
    if (rows.some(row => Number(row.archiviata) === 1)) fail(400, 'Non puoi modificare articoli archiviati');
    if (user.ruolo !== 'admin' && rows.some(row => !ownsBranch(user, row.branca_riferimento))) {
      fail(403, 'Puoi modificare soltanto le prenotazioni delle tue branche');
    }
    const changed = rows.filter(row => row.stato !== state);
    const bookings = new Map();
    for (const row of changed) {
      await db.run('UPDATE dettagli_prenotazioni SET stato = ? WHERE id = ?', [state, row.id]);
      if (state === 'pagato') {
        await db.run('UPDATE dettagli_prenotazioni SET pagamento_registrato = 1 WHERE id = ?', [row.id]);
      }
      await db.run('UPDATE prenotazioni SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [row.prenotazione_id]);
      if (!bookings.has(row.prenotazione_id)) bookings.set(row.prenotazione_id, { ...row, items: [] });
      bookings.get(row.prenotazione_id).items.push(row);
    }
    if (notifiedStates.has(state)) {
      for (const booking of bookings.values()) {
        await db.run('INSERT INTO notifiche_stato (id, payload) VALUES (?, ?)', [
          randomBytes(16).toString('hex'),
          JSON.stringify({ id: booking.prenotazione_id, nome_prenotante: booking.nome_prenotante,
            email_prenotante: booking.email_prenotante, stato: state, items: booking.items })
        ]);
      }
    }
    return { aggiornati: changed.length, emailInCoda: notifiedStates.has(state) ? bookings.size : 0 };
  });
}

export async function queueLeaderBookingNotifications(db, booking) {
  const accounts = await db.all("SELECT email, branche FROM admin_users WHERE ruolo = 'capo_unita'");
  const recipients = [...new Set(accounts.filter(account => {
    const branches = JSON.parse(account.branche);
    return branches.length === 1 && BRANCHES.includes(branches[0]) &&
      normalizeBranch(branches[0]) === normalizeBranch(booking.branca_riferimento);
  }).map(account => account.email))];
  if (!recipients.length) {
    console.warn('Nessun account capo unità configurato per la branca:', booking.branca_riferimento);
  }
  for (const recipient of recipients) {
    await db.run('INSERT INTO notifiche_stato (id, payload) VALUES (?, ?)', [
      randomBytes(16).toString('hex'),
      JSON.stringify({ ...booking, tipo: 'nuova_prenotazione', destinatario: recipient })
    ]);
  }
  return recipients.length;
}

let delivering = false;
export async function deliverStatusNotifications(send = booking => booking.tipo === 'nuova_prenotazione'
  ? sendLeaderBookingEmail(booking) : sendBookingStatusEmail(booking)) {
  if (delivering) return;
  delivering = true;
  try {
    const db = getDatabase();
    const notifications = await db.all(
      "SELECT * FROM notifiche_stato WHERE stato != 'sent' AND prossimo_tentativo <= ? ORDER BY prossimo_tentativo LIMIT 20",
      [Date.now()]
    );
    for (const notification of notifications) {
      const claimed = await db.run(
        "UPDATE notifiche_stato SET stato = 'sending', prossimo_tentativo = ? WHERE id = ? AND stato != 'sent' AND prossimo_tentativo <= ?",
        [Date.now() + 300000, notification.id, Date.now()]
      );
      if (!claimed.changes) continue;
      try {
        await send(JSON.parse(notification.payload));
        await db.run("UPDATE notifiche_stato SET stato = 'sent', ultimo_errore = NULL WHERE id = ?", [notification.id]);
      } catch (error) {
        console.error('Errore notifica cambio stato:', error);
        await db.run(
          "UPDATE notifiche_stato SET stato = 'pending', tentativi = tentativi + 1, ultimo_errore = ?, prossimo_tentativo = ? WHERE id = ?",
          [error.message, Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(notification.tentativi, 6)), notification.id]
        );
      }
    }
  } finally {
    delivering = false;
  }
}

export function registerBookingWorkflow(app) {
  app.use('/api/admin', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Authorization');
    next();
  });

  app.post('/api/admin/login', route(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024) fail(401, 'Credenziali non valide');
    const db = getDatabase();
    let user;
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD &&
        email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      user = { id: null, nome: 'Admin', email, ruolo: 'admin', branche: [] };
    } else {
      const account = await db.get('SELECT * FROM admin_users WHERE email = ?', [email.trim().toLowerCase()]);
      if (!account || !await checkPassword(password, account.password_hash)) fail(401, 'Credenziali non valide');
      user = publicUser(account);
    }
    const token = randomBytes(32).toString('hex');
    await db.run('DELETE FROM sessioni WHERE scadenza <= ?', [Date.now()]);
    await db.run('INSERT INTO sessioni (token_hash, utente_id, scadenza) VALUES (?, ?, ?)',
      [digest(token), user.id, Date.now() + 12 * 3600000]);
    res.json({ token, user });
  }));

  app.use('/api/admin', route(async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) fail(401, 'Accedi per continuare');
    const db = getDatabase();
    const session = await db.get('SELECT * FROM sessioni WHERE token_hash = ? AND scadenza > ?', [digest(token), Date.now()]);
    if (!session) fail(401, 'Sessione scaduta: accedi nuovamente');
    if (session.utente_id === null) {
      req.user = { id: null, nome: 'Admin', email: process.env.ADMIN_EMAIL, ruolo: 'admin', branche: [] };
    } else {
      const account = await db.get('SELECT * FROM admin_users WHERE id = ?', [session.utente_id]);
      if (!account) fail(401, 'Account non disponibile');
      req.user = publicUser(account);
    }
    if (req.user.ruolo === 'capo_unita' &&
        (req.user.branche.length !== 1 || !BRANCHES.includes(req.user.branche[0]))) {
      fail(403, 'L’account deve avere una sola branca valida. Contatta l’admin per ricrearlo con la branca corretta');
    }
    next();
  }));

  app.get('/api/admin/me', (req, res) => res.json(req.user));
  app.post('/api/admin/elimina-selezionati', route(async (req, res) => {
    res.json(await deleteSelectedBookings(req.user,
      req.user.ruolo === 'admin' ? req.body.ids : req.body.prenotazioneIds));
  }));
  app.post('/api/admin/logout', route(async (req, res) => {
    await getDatabase().run('DELETE FROM sessioni WHERE token_hash = ?', [digest(req.headers.authorization.slice(7))]);
    res.json({ message: 'Sessione terminata' });
  }));

  app.get('/api/admin/prenotazioni-capo', route(async (req, res) => {
    const user = req.user;
    if (user.ruolo !== 'capo_unita') fail(403, 'Accesso riservato ai capi unità');
    if (!user.branche.length) return res.json([]);
    const assigned = user.branche.map(normalizeBranch);
    const scope = [...new Set([...assigned, ...Object.keys(branchAliases).filter(alias => assigned.includes(branchAliases[alias]))])];
    const rows = await getDatabase().all(`
      SELECT dp.*, p.nome, p.taglia, pr.nome_prenotante, pr.email_prenotante,
        pr.branca_riferimento, pr.data_prenotazione
      FROM dettagli_prenotazioni dp
      JOIN prenotazioni pr ON pr.id = dp.prenotazione_id
      JOIN prodotti p ON p.id = dp.prodotto_id
      WHERE (pr.archiviata = 0 OR pr.archiviata IS NULL)
        AND LOWER(TRIM(pr.branca_riferimento)) IN (${scope.map(() => '?').join(',')})
      ORDER BY pr.nome_prenotante, pr.data_prenotazione DESC, dp.id
    `, scope);
    res.json(rows);
  }));

  app.post('/api/admin/prenotazioni-capo/paga', route(async (req, res) => {
    if (req.user.ruolo !== 'capo_unita') fail(403, 'Accesso riservato ai capi unità');
    const ids = req.body.prenotazioneIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
        ids.some(id => typeof id !== 'string' || !id.length)) fail(400, 'Seleziona da 1 a 100 prenotazioni');
    const result = await withTransaction(async db => {
      const bookings = await db.all(
        `SELECT * FROM prenotazioni WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id ${db.pool ? 'FOR UPDATE' : ''}`, ids
      );
      if (bookings.length !== new Set(ids).size) fail(404, 'Prenotazione non trovata');
      if (bookings.some(booking => !ownsBranch(req.user, booking.branca_riferimento))) fail(403, 'Prenotazione di un’altra branca');
      if (bookings.some(booking => Number(booking.archiviata) === 1)) fail(400, 'Prenotazione archiviata');
      const items = await db.all(
        `SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id IN (${ids.map(() => '?').join(',')}) ${db.pool ? 'FOR UPDATE' : ''}`, ids
      );
      const payable = items.filter(item => !Number(item.pagamento_registrato));
      if (!payable.length) fail(400, 'Nessun articolo ancora da segnare pagato');
      for (const booking of bookings) {
        await db.run(
          `UPDATE dettagli_prenotazioni SET pagamento_registrato = 1,
            stato = CASE WHEN stato = 'prenotato' THEN 'pagato' ELSE stato END
           WHERE prenotazione_id = ?`, [booking.id]
        );
        await db.run('UPDATE prenotazioni SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [booking.id]);
      }
      return { aggiornati: payable.length, emailInCoda: 0 };
    });
    res.json(result);
  }));

  app.use('/api/admin', (req, res, next) => {
    if (req.user.ruolo === 'capo_unita' && /^\/prenotazioni\/[^/]+$/.test(req.path) &&
        ['GET', 'PUT', 'DELETE'].includes(req.method)) return next();
    if (req.user.ruolo !== 'admin') return res.status(403).json({ error: 'Operazione riservata all’admin' });
    next();
  });

  app.get('/api/admin/articoli-prenotati', route(async (req, res) => {
    const archived = req.query.archiviate === 'true' ? 1 : 0;
    const rows = await getDatabase().all(`
      SELECT dp.*, p.nome, p.taglia, p.usato, pr.nome_prenotante, pr.email_prenotante,
        pr.branca_riferimento, pr.data_prenotazione
      FROM dettagli_prenotazioni dp
      JOIN prenotazioni pr ON pr.id = dp.prenotazione_id
      JOIN prodotti p ON p.id = dp.prodotto_id
      WHERE COALESCE(pr.archiviata, 0) = ?
      ORDER BY p.nome, p.taglia, pr.data_prenotazione DESC, dp.id
    `, [archived]);
    res.json(rows);
  }));

  app.post('/api/admin/articoli-prenotati/stato', route(async (req, res) => {
    res.json(await updateItemStates(req.user, req.body.ids, req.body.stato));
  }));

  app.post('/api/admin/prenotazioni/archivia-selezionate', route(async (req, res) => {
    const ids = req.body.prenotazioneIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
        ids.some(id => typeof id !== 'string' || !id.trim())) {
      fail(400, 'Seleziona da 1 a 100 prenotazioni valide');
    }
    const uniqueIds = [...new Set(ids)];
    const result = await withTransaction(async db => {
      const bookings = await db.all(
        `SELECT * FROM prenotazioni WHERE id IN (${uniqueIds.map(() => '?').join(',')})
         ORDER BY id ${db.pool ? 'FOR UPDATE' : ''}`, uniqueIds
      );
      if (bookings.length !== uniqueIds.length) fail(404, 'Una o più prenotazioni non esistono più');
      if (bookings.some(booking => Number(booking.archiviata) === 1)) fail(400, 'Una o più prenotazioni sono già archiviate');
      for (const booking of bookings) {
        await db.run(
          'UPDATE prenotazioni SET archiviata = 1, data_archiviazione = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [booking.id]
        );
      }
      return { archiviate: bookings.length };
    });
    res.json(result);
  }));

  app.get('/api/admin/notifiche-stato', route(async (req, res) => {
    const pending = await getDatabase().get("SELECT COUNT(*) AS totale FROM notifiche_stato WHERE stato != 'sent'");
    const errors = await getDatabase().get("SELECT COUNT(*) AS totale FROM notifiche_stato WHERE stato != 'sent' AND ultimo_errore IS NOT NULL");
    res.json({ inCoda: Number(pending.totale), conErrore: Number(errors.totale) });
  }));

  app.get('/api/admin/capi-unita', route(async (req, res) => {
    const users = await getDatabase().all("SELECT id, nome, email, ruolo, branche FROM admin_users WHERE ruolo = 'capo_unita' ORDER BY nome");
    res.json(users.map(publicUser));
  }));

  app.post('/api/admin/capi-unita', route(async (req, res) => {
    const { nome, email, password, branche } = req.body;
    if (typeof nome !== 'string' || !nome.trim() || typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || password.length < 10 || password.length > 1024 ||
        !Array.isArray(branche) || branche.length !== 1 || !BRANCHES.includes(branche[0])) {
      fail(400, 'Inserisci nome, email valida, password di almeno 10 caratteri e una sola branca valida');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase()) fail(409, 'Email già usata dall’admin');
    const db = getDatabase();
    if (await db.get('SELECT id FROM admin_users WHERE email = ?', [normalizedEmail])) fail(409, 'Email già registrata');
    await db.run('INSERT INTO admin_users (nome, email, password_hash, ruolo, branche) VALUES (?, ?, ?, ?, ?)',
      [nome.trim(), normalizedEmail, await hashPassword(password), 'capo_unita', JSON.stringify([...new Set(branche)])]);
    res.status(201).json({ message: 'Account capo unità creato' });
  }));

  app.delete('/api/admin/capi-unita/:id', route(async (req, res) => {
    const result = await getDatabase().run("DELETE FROM admin_users WHERE id = ? AND ruolo = 'capo_unita'", [req.params.id]);
    if (!result.changes) fail(404, 'Account non trovato');
    res.json({ message: 'Account eliminato' });
  }));
}
