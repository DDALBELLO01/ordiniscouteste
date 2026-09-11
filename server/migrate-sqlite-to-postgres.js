import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeDatabase } from './database.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = path.join(__dirname, 'database', 'ordini.db');
const { Pool } = pg;

const tables = {
  prodotti: ['id', 'nome', 'tipologia', 'branca', 'taglia', 'specialita', 'immagine', 'quantita_magazzino', 'prezzo', 'usato', 'mostra_home', 'created_at', 'updated_at'],
  prenotazioni: ['id', 'nome_prenotante', 'email_prenotante', 'branca_riferimento', 'data_prenotazione', 'stato', 'note', 'created_at', 'updated_at'],
  dettagli_prenotazioni: ['id', 'prenotazione_id', 'prodotto_id', 'quantita', 'prezzo_unitario', 'specialita'],
  configurazione: ['chiave', 'valore', 'updated_at'],
  admin_users: ['id', 'email', 'password_hash', 'created_at']
};

async function migrate() {
  if (!process.env.DB_HOST) {
    throw new Error('Imposta DB_HOST, DB_PORT, DB_NAME, DB_USERNAME e DB_PASSWORD prima della migrazione.');
  }

  // Assicura che le tabelle su PostgreSQL siano create
  await initializeDatabase();

  const sqlite = await open({ filename: sqlitePath, driver: sqlite3.Database });
  const tableInfo = await sqlite.all("PRAGMA table_info('prodotti')");
  const sqliteColumns = tableInfo.map(c => c.name);

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    for (const [table, columns] of Object.entries(tables)) {
      const info = await sqlite.all(`PRAGMA table_info('${table}')`);
      const tableSqliteCols = info.map(c => c.name);
      const validColumns = columns.filter(col => tableSqliteCols.includes(col));

      if (validColumns.length === 0) continue;

      const rows = await sqlite.all(`SELECT ${validColumns.join(', ')} FROM ${table}`);
      for (const row of rows) {
        const placeholders = validColumns.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${table} (${validColumns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          validColumns.map(column => row[column] ?? null)
        );
      }
      console.log(`${table}: ${rows.length} righe`);
    }

    for (const table of ['prodotti', 'dettagli_prenotazioni', 'admin_users']) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`);
    }

    await client.query('COMMIT');
    console.log('Migrazione completata.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
    await sqlite.close();
  }
}

migrate().catch(error => {
  console.error('Migrazione fallita:', error.message);
  process.exit(1);
});
