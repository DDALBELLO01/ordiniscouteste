import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'node:async_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'ordini.db');

let db = null;
const transactionContext = new AsyncLocalStorage();
let sqliteQueue = Promise.resolve();

function serializeSqlite(operation) {
  const result = sqliteQueue.then(operation);
  // Keep scheduling usable after failures; callers still receive the original rejection.
  sqliteQueue = result.catch(() => {});
  return result;
}

export async function withTransaction(operation) {
  if (transactionContext.getStore()) return operation(getDatabase());
  const execute = async (connection) => {
    await connection.run('BEGIN');
    try {
      const result = await transactionContext.run(connection, () => operation(connection));
      await connection.run('COMMIT');
      return result;
    } catch (error) {
      await connection.run('ROLLBACK');
      throw error;
    }
  };
  if (db.pool) {
    const client = await db.pool.connect();
    try {
      return await execute(new PostgresAdapter(client));
    } finally {
      client.release();
    }
  }
  return serializeSqlite(() => execute(db.connection));
}

async function initializeWorkflowSchema() {
  const sqlite = !db.pool;
  const addColumn = async (table, column, definition) => {
    if (sqlite) {
      const columns = await db.all(`PRAGMA table_info(${table})`);
      if (columns.some(item => item.name === column)) return;
    }
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${sqlite ? '' : 'IF NOT EXISTS '}${column} ${definition}`);
  };
  const oldColumns = sqlite ? await db.all('PRAGMA table_info(dettagli_prenotazioni)') : await db.all(
    "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'dettagli_prenotazioni' AND table_schema = current_schema()"
  );
  await addColumn('dettagli_prenotazioni', 'stato', "TEXT NOT NULL DEFAULT 'prenotato'");
  if (!oldColumns.some(column => column.name === 'stato')) {
    await db.run("UPDATE dettagli_prenotazioni SET stato = 'ordinato' WHERE acquistato = 1");
  }
  await addColumn('dettagli_prenotazioni', 'pagamento_registrato', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn('admin_users', 'nome', "TEXT NOT NULL DEFAULT ''");
  await addColumn('admin_users', 'ruolo', "TEXT NOT NULL DEFAULT 'capo_unita'");
  await addColumn('admin_users', 'branche', "TEXT NOT NULL DEFAULT '[]'");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessioni (
      token_hash TEXT PRIMARY KEY,
      utente_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
      scadenza BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifiche_stato (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'pending',
      tentativi INTEGER NOT NULL DEFAULT 0,
      prossimo_tentativo BIGINT NOT NULL DEFAULT 0,
      ultimo_errore TEXT
    );
  `);
  await withTransaction(async connection => {
    await connection.run(
      "UPDATE dettagli_prenotazioni SET stato = 'prenotato', pagamento_registrato = 0 WHERE stato = 'non_pagato'"
    );
    const notifications = await connection.all("SELECT id, payload FROM notifiche_stato WHERE stato != 'sent'");
    for (const notification of notifications) {
      if (JSON.parse(notification.payload).stato === 'non_pagato') {
        await connection.run('DELETE FROM notifiche_stato WHERE id = ?', [notification.id]);
      }
    }
  });
}

async function initializeProductPricingSchema() {
  await withTransaction(async connection => {
    const columns = db.pool
      ? await connection.all("SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'prodotti' AND table_schema = current_schema()")
      : await connection.all('PRAGMA table_info(prodotti)');
    const names = new Set(columns.map(column => column.name));
    for (const column of ['prezzo_vendita', 'costo_acquisto']) {
      if (!names.has(column)) {
        await connection.run(`ALTER TABLE prodotti ADD COLUMN ${column} DOUBLE PRECISION NOT NULL DEFAULT 0`);
        if (names.has('prezzo')) {
          await connection.run(`UPDATE prodotti SET ${column} = prezzo`);
        }
      }
    }
    for (const column of ['prezzo', 'scouting_id_prodotto', 'scouting_caratteristica_id', 'esaurito_scouting']) {
      if (names.has(column)) await connection.run(`ALTER TABLE prodotti DROP COLUMN ${column}`);
    }
  });
}

export async function initializeDatabase({ filename = DB_PATH } = {}) {
  if (process.env.DB_HOST) {
    await initializePostgresDatabase();
    await initializeProductPricingSchema();
    await initializeWorkflowSchema();
    return db;
  }

  const { default: sqlite3 } = await import('sqlite3');
  const { open } = await import('sqlite');

  const dbDir = path.dirname(filename);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = await open({
    filename,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA foreign_keys = ON');

  // Tabella Prodotti
  await db.exec(`
    CREATE TABLE IF NOT EXISTS prodotti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipologia TEXT NOT NULL,
      branca TEXT NOT NULL,
      taglia TEXT,
      specialita TEXT,
      immagine TEXT,
      quantita_magazzino INTEGER,
      prezzo_vendita REAL NOT NULL,
      costo_acquisto REAL NOT NULL,
      usato INTEGER DEFAULT 0,
      mostra_home INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const colonneProdotti = await db.all('PRAGMA table_info(prodotti)');
  if (!colonneProdotti.some(colonna => colonna.name === 'immagine')) {
    await db.run('ALTER TABLE prodotti ADD COLUMN immagine TEXT');
  }
  if (!colonneProdotti.some(colonna => colonna.name === 'specialita')) {
    await db.run('ALTER TABLE prodotti ADD COLUMN specialita TEXT');
  }
  if (!colonneProdotti.some(colonna => colonna.name === 'created_at')) {
    await db.run('ALTER TABLE prodotti ADD COLUMN created_at DATETIME');
    await db.run('UPDATE prodotti SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL');
  }
  if (!colonneProdotti.some(colonna => colonna.name === 'updated_at')) {
    await db.run('ALTER TABLE prodotti ADD COLUMN updated_at DATETIME');
    await db.run('UPDATE prodotti SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL');
  }
  if (!colonneProdotti.some(colonna => colonna.name === 'mostra_home')) {
    await db.run('ALTER TABLE prodotti ADD COLUMN mostra_home INTEGER DEFAULT 1');
    await db.run('UPDATE prodotti SET mostra_home = 1 WHERE mostra_home IS NULL');
  }
  if (!colonneProdotti.some(colonna => colonna.name === 'guida_taglie_url')) {
    await db.run('ALTER TABLE prodotti ADD COLUMN guida_taglie_url TEXT');
  }

  // Tabella Prenotazioni
  await db.exec(`
    CREATE TABLE IF NOT EXISTS prenotazioni (
      id TEXT PRIMARY KEY,
      nome_prenotante TEXT NOT NULL,
      email_prenotante TEXT NOT NULL,
      branca_riferimento TEXT,
      data_prenotazione DATETIME DEFAULT CURRENT_TIMESTAMP,
      stato TEXT DEFAULT 'attiva',
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const colonnePrenotazioni = await db.all('PRAGMA table_info(prenotazioni)');
  if (!colonnePrenotazioni.some(colonna => colonna.name === 'branca_riferimento')) {
    await db.run('ALTER TABLE prenotazioni ADD COLUMN branca_riferimento TEXT');
  }
  if (!colonnePrenotazioni.some(colonna => colonna.name === 'updated_at')) {
    await db.run('ALTER TABLE prenotazioni ADD COLUMN updated_at DATETIME');
    await db.run('UPDATE prenotazioni SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL');
  }
  if (!colonnePrenotazioni.some(colonna => colonna.name === 'archiviata')) {
    await db.run('ALTER TABLE prenotazioni ADD COLUMN archiviata INTEGER DEFAULT 0');
  }
  if (!colonnePrenotazioni.some(colonna => colonna.name === 'data_archiviazione')) {
    await db.run('ALTER TABLE prenotazioni ADD COLUMN data_archiviazione DATETIME');
  }
  if (!colonnePrenotazioni.some(colonna => colonna.name === 'metodo_pagamento')) {
    await db.run("ALTER TABLE prenotazioni ADD COLUMN metodo_pagamento TEXT DEFAULT 'in_sede'");
  }

  // Tabella Dettagli Prenotazioni (linee di ordine)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS dettagli_prenotazioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prenotazione_id TEXT NOT NULL,
      prodotto_id INTEGER NOT NULL,
      quantita INTEGER NOT NULL,
      prezzo_unitario REAL NOT NULL,
      specialita TEXT,
      FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE CASCADE,
      FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
    )
  `);

  const colonneDettagli = await db.all('PRAGMA table_info(dettagli_prenotazioni)');
  if (!colonneDettagli.some(colonna => colonna.name === 'specialita')) {
    await db.run('ALTER TABLE dettagli_prenotazioni ADD COLUMN specialita TEXT');
  }
  if (!colonneDettagli.some(colonna => colonna.name === 'acquistato')) {
    await db.run('ALTER TABLE dettagli_prenotazioni ADD COLUMN acquistato INTEGER DEFAULT 0');
  }

  // Tabella Configurazione (stato delle prenotazioni)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS configurazione (
      chiave TEXT PRIMARY KEY,
      valore TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const colonneConfigurazione = await db.all('PRAGMA table_info(configurazione)');
  if (!colonneConfigurazione.some(colonna => colonna.name === 'updated_at')) {
    await db.run('ALTER TABLE configurazione ADD COLUMN updated_at DATETIME');
    await db.run('UPDATE configurazione SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL');
  }

  // Tabella Utenti Admin
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inizializza configurazione predefinita
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['prenotazioni_abilitate', 'true']
  );
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['email_capi_branca', '{}']
  );
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['guida_taglie_url', '']
  );
  // Predisposizione futura pagamento con carta: funzionalità non ancora abilitata/visibile
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['pagamento_carta_abilitato', 'false']
  );

  const connection = db;
  db = { connection };
  for (const method of ['all', 'get', 'run', 'exec', 'close']) {
    db[method] = (...args) => {
      const current = transactionContext.getStore();
      return current ? current[method](...args) : serializeSqlite(() => connection[method](...args));
    };
  }
  await initializeProductPricingSchema();
  await initializeWorkflowSchema();
  return db;
}

class PostgresAdapter {
  constructor(pool) {
    this.pool = pool;
  }

  convertQuery(sql) {
    let index = 0;
    return sql
      .replace(/INSERT OR IGNORE/gi, 'INSERT')
      .replace(/\?/g, () => `$${++index}`);
  }

  async exec(sql) {
    return this.pool.query(sql);
  }

  async all(sql, params = []) {
    const result = await this.pool.query(this.convertQuery(sql), params);
    return result.rows;
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params);
    return rows[0];
  }

  async run(sql, params = []) {
    const ignoreConflict = /INSERT\s+OR\s+IGNORE/i.test(sql);
    const isProductInsert = /^\s*INSERT\s+INTO\s+prodotti/i.test(sql);
    let query = isProductInsert && !/RETURNING\s+/i.test(sql)
      ? `${sql} RETURNING id`
      : sql;
    if (ignoreConflict) {
      query = query.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT');
      query = `${query} ON CONFLICT DO NOTHING`;
    }
    const result = await this.pool.query(this.convertQuery(query), params);
    return {
      changes: result.rowCount,
      lastID: result.rows[0]?.id
    };
  }

  async close() {
    await this.pool.end();
  }
}

async function initializePostgresDatabase() {
  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 5
  });

  db = new PostgresAdapter(pool);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS prodotti (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      nome TEXT NOT NULL,
      tipologia TEXT NOT NULL,
      branca TEXT NOT NULL,
      taglia TEXT,
      specialita TEXT,
      immagine TEXT,
      quantita_magazzino INTEGER,
      prezzo_vendita DOUBLE PRECISION NOT NULL,
      costo_acquisto DOUBLE PRECISION NOT NULL,
      usato INTEGER DEFAULT 0,
      mostra_home INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS prenotazioni (
      id TEXT PRIMARY KEY,
      nome_prenotante TEXT NOT NULL,
      email_prenotante TEXT NOT NULL,
      branca_riferimento TEXT,
      data_prenotazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      stato TEXT DEFAULT 'attiva',
      note TEXT,
      archiviata INTEGER DEFAULT 0,
      data_archiviazione TIMESTAMP,
      metodo_pagamento TEXT DEFAULT 'in_sede',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS dettagli_prenotazioni (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      prenotazione_id TEXT NOT NULL REFERENCES prenotazioni(id) ON DELETE CASCADE,
      prodotto_id INTEGER NOT NULL REFERENCES prodotti(id),
      quantita INTEGER NOT NULL,
      prezzo_unitario DOUBLE PRECISION NOT NULL,
      specialita TEXT,
      acquistato INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS configurazione (
      chiave TEXT PRIMARY KEY,
      valore TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE prodotti ADD COLUMN IF NOT EXISTS guida_taglie_url TEXT;
    ALTER TABLE prenotazioni ADD COLUMN IF NOT EXISTS archiviata INTEGER DEFAULT 0;
    ALTER TABLE prenotazioni ADD COLUMN IF NOT EXISTS data_archiviazione TIMESTAMP;
    ALTER TABLE prenotazioni ADD COLUMN IF NOT EXISTS metodo_pagamento TEXT DEFAULT 'in_sede';
    ALTER TABLE dettagli_prenotazioni ADD COLUMN IF NOT EXISTS acquistato INTEGER DEFAULT 0;
  `);
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['prenotazioni_abilitate', 'true']
  );
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['email_capi_branca', '{}']
  );
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['guida_taglie_url', '']
  );
  await db.run(
    'INSERT OR IGNORE INTO configurazione (chiave, valore) VALUES (?, ?)',
    ['pagamento_carta_abilitato', 'false']
  );
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return transactionContext.getStore() || db;
}

export async function closeDatabase() {
  if (db) {
    await db.close();
  }
}
