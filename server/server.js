import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDatabase, closeDatabase, withTransaction } from './database.js';
import { registerBookingWorkflow, deliverStatusNotifications, normalizeBranch, assertBookingAccess, queueLeaderBookingNotifications, deleteBookingItems } from './bookingWorkflow.js';
import { initializeEmailService, sendBookingEmail, sendAdminNotification, sendBrancaSummaryEmail } from './emailService.js';
import { getMaterialOverview, processMaterial } from './procurement.js';
import { generateMaterialCSV, generateMaterialXLSX, generateExportFilename, splitDistinctiveMaterials } from './exportService.js';
 

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Routes
app.get('/api/prodotti', async (req, res) => {
  try {
    const db = getDatabase();
    let prodotti = await db.all(`SELECT id, nome, tipologia, branca, taglia, specialita, immagine,
      guida_taglie_url, quantita_magazzino, prezzo_vendita, usato, non_a_catalogo_scouting, mostra_home
      FROM prodotti WHERE mostra_home = 1 ORDER BY branca, tipologia`);
    // NASCONDE AUTOMATICAMENTE I PEZZI USATI CON GIACENZA 0 O INFERIORE
    prodotti = prodotti.filter(p => {
      const isUsato = p.usato === 1 || p.usato === true;
      const isOut = p.quantita_magazzino !== null && p.quantita_magazzino !== undefined && Number(p.quantita_magazzino) <= 0;
      return !((isUsato || Number(p.non_a_catalogo_scouting) === 1) && isOut);
    });
    res.json(prodotti);
  } catch (error) {
    console.error('Errore lettura prodotti:', error);
    res.status(500).json({ error: 'Errore lettura prodotti' });
  }
});

app.get('/api/config/prenotazioni-abilitate', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.get(
      'SELECT valore FROM configurazione WHERE chiave = ?',
      ['prenotazioni_abilitate']
    );
    res.json({ enabled: result?.valore === 'true' });
  } catch (error) {
    console.error('Errore lettura configurazione:', error);
    res.status(500).json({ error: 'Errore lettura configurazione' });
  }
});

app.get('/api/config/guida-taglie', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.get('SELECT valore FROM configurazione WHERE chiave = ?', ['guida_taglie_url']);
    res.json({ url: result?.valore || '' });
  } catch (error) {
    console.error('Errore lettura guida taglie:', error);
    res.status(500).json({ error: 'Errore lettura guida taglie' });
  }
});

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())

function assertProductStock(product, quantity) {
  const limited = Number(product.usato) === 1 || Number(product.non_a_catalogo_scouting) === 1;
  if (limited && product.quantita_magazzino !== null && product.quantita_magazzino !== undefined &&
      Number(product.quantita_magazzino) < quantity) {
    const error = new Error(`Quantità non sufficiente per ${product.nome}. Disponibili: ${Math.max(0, Number(product.quantita_magazzino))}`);
    error.status = 400;
    throw error;
  }
}

app.post('/api/prenotazioni', async (req, res) => {
  try {
    const db = getDatabase();
    const { nome_prenotante, email_prenotante, branca_riferimento, genitore_di, note, items } = req.body;

    // Verificare se le prenotazioni sono abilitate
    const config = await db.get(
      'SELECT valore FROM configurazione WHERE chiave = ?',
      ['prenotazioni_abilitate']
    );
    
    if (config?.valore !== 'true') {
      return res.status(403).json({ error: 'Prenotazioni temporaneamente disabilitate' });
    }

    // Validare i dati
    if (!nome_prenotante || !email_prenotante || !branca_riferimento || !items || items.length === 0) {
      return res.status(400).json({ error: 'Dati mancanti' });
    }
    if (genitore_di !== undefined && genitore_di !== null && typeof genitore_di !== 'string') {
      return res.status(400).json({ error: 'Il campo Genitore di non è valido' });
    }

    const trimmedEmail = String(email_prenotante).trim();
    const trimmedGenitoreDi = String(genitore_di || '').trim() || null;
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'Inserisci un indirizzo email valido' });
    }

    if (!Array.isArray(items) || items.some(item => !Number.isSafeInteger(item.prodotto_id) ||
        !Number.isSafeInteger(item.quantita) || item.quantita <= 0)) {
      return res.status(400).json({ error: 'Articoli o quantità non validi' });
    }

    const { bookingData, leaderEmailsQueued } = await withTransaction(async db => {
      if (db.pool) {
        await db.all(`SELECT id FROM prodotti WHERE id IN (${items.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`,
          items.map(item => item.prodotto_id));
      }
      const prenotazione_id = uuidv4();
      await db.run(
        'INSERT INTO prenotazioni (id, nome_prenotante, email_prenotante, branca_riferimento, genitore_di, note) VALUES (?, ?, ?, ?, ?, ?)',
        [prenotazione_id, nome_prenotante, trimmedEmail, branca_riferimento, trimmedGenitoreDi, note || null]
      );

      for (const item of items) {
        const prodotto = await db.get('SELECT * FROM prodotti WHERE id = ?', [item.prodotto_id]);
        if (!prodotto) {
          const error = new Error(`Prodotto ${item.prodotto_id} non trovato`);
          error.status = 404;
          throw error;
        }
        assertProductStock(prodotto, item.quantita);
        await db.run(
          'INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, specialita) VALUES (?, ?, ?, ?, ?)',
          [prenotazione_id, item.prodotto_id, item.quantita, prodotto.prezzo_vendita, item.specialita || null]
        );
        if (prodotto.quantita_magazzino !== null && prodotto.quantita_magazzino !== undefined) {
          await db.run(
            'UPDATE prodotti SET quantita_magazzino = quantita_magazzino - ? WHERE id = ?',
            [item.quantita, item.prodotto_id]
          );
        }
      }

      const dettagli = await db.all(
        `SELECT dp.*, p.nome, p.taglia FROM dettagli_prenotazioni dp
         JOIN prodotti p ON dp.prodotto_id = p.id
         WHERE dp.prenotazione_id = ?`,
        [prenotazione_id]
      );

      const bookingData = {
        id: prenotazione_id,
        nome_prenotante,
        email_prenotante: trimmedEmail,
        branca_riferimento,
        genitore_di: trimmedGenitoreDi,
        data_prenotazione: new Date().toISOString(),
        note,
        items: dettagli.map(d => ({
          nome: `${d.nome}${d.taglia ? ` (${d.taglia})` : ''}${d.specialita ? ` - ${d.specialita}` : ''}`,
          quantita: d.quantita,
          prezzo_unitario: d.prezzo_unitario
        }))
      };
      const leaderEmailsQueued = await queueLeaderBookingNotifications(db, bookingData);
      return { bookingData, leaderEmailsQueued };
    });

    // Inviare email
    const customerEmailSent = await sendBookingEmail(trimmedEmail, bookingData);
    const adminEmailSent = await sendAdminNotification(bookingData);

    res.status(201).json({
      id: bookingData.id,
      message: 'Prenotazione creata con successo',
      emailSent: customerEmailSent && adminEmailSent,
      leaderEmailsQueued
    });
  } catch (error) {
    console.error('Errore creazione prenotazione:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore creazione prenotazione' });
  }
});

// Admin Routes
registerBookingWorkflow(app);

app.get('/api/admin/prodotti', async (req, res) => {
  try {
    const products = await getDatabase().all('SELECT * FROM prodotti ORDER BY branca, tipologia');
    res.json(req.user.ruolo === 'admin' ? products : products.map(({ costo_acquisto, ...product }) => product));
  } catch (error) {
    console.error('Errore lettura prodotti:', error);
    res.status(500).json({ error: 'Errore lettura prodotti' });
  }
});

const isValidPrice = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') &&
  Number.isFinite(Number(value)) && Number(value) >= 0;

app.post('/api/admin/prodotti', async (req, res) => {
  try {
    const db = getDatabase();
    const { nome, tipologia, branca, taglia, specialita, immagine, guida_taglie_url, quantita_magazzino, prezzo_vendita, costo_acquisto, usato, mostra_home } = req.body;
    const nonACatalogo = [true, 1, '1'].includes(req.body.non_a_catalogo_scouting) ? 1 : 0;
    if (!isValidPrice(prezzo_vendita) || !isValidPrice(costo_acquisto)) {
      return res.status(400).json({ error: 'Inserisci prezzo di vendita e costo di acquisto validi e non negativi' });
    }
    const brancaValue = Array.isArray(branca) ? branca.filter(Boolean).join(', ') : String(branca || '').trim();
    if (!brancaValue) return res.status(400).json({ error: 'Selezionare almeno una branca' });
    const quantita = quantita_magazzino === '' || quantita_magazzino === null || quantita_magazzino === undefined
      ? null
      : Number(quantita_magazzino);
    const result = await db.run(
      `INSERT INTO prodotti (nome, tipologia, branca, taglia, specialita, guida_taglie_url, immagine, quantita_magazzino, prezzo_vendita, costo_acquisto, usato, non_a_catalogo_scouting, mostra_home)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, tipologia, brancaValue, taglia || null, specialita || null, guida_taglie_url || null, immagine || null, quantita, Number(prezzo_vendita), Number(costo_acquisto), usato ? 1 : 0, nonACatalogo, mostra_home === false || mostra_home === 0 || mostra_home === '0' ? 0 : 1]
    );

    if (String(guida_taglie_url || '').trim()) {
      await db.run('UPDATE prodotti SET guida_taglie_url = ? WHERE nome = ?', [String(guida_taglie_url).trim(), nome]);
    }

    res.status(201).json({ id: result.lastID, message: 'Prodotto creato' });
  } catch (error) {
    console.error('Errore creazione prodotto:', error);
    res.status(500).json({ error: 'Errore creazione prodotto' });
  }
});

app.put('/api/admin/prodotti/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { nome, tipologia, branca, taglia, specialita, immagine, guida_taglie_url, quantita_magazzino, prezzo_vendita, costo_acquisto, usato, mostra_home } = req.body;
    const existing = await db.get('SELECT non_a_catalogo_scouting FROM prodotti WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Prodotto non trovato' });
    const nonACatalogo = req.body.non_a_catalogo_scouting === undefined ? existing.non_a_catalogo_scouting
      : [true, 1, '1'].includes(req.body.non_a_catalogo_scouting) ? 1 : 0;
    if (!isValidPrice(prezzo_vendita) || !isValidPrice(costo_acquisto)) {
      return res.status(400).json({ error: 'Inserisci prezzo di vendita e costo di acquisto validi e non negativi' });
    }
    const brancaValue = Array.isArray(branca) ? branca.filter(Boolean).join(', ') : String(branca || '').trim();
    if (!brancaValue) return res.status(400).json({ error: 'Selezionare almeno una branca' });
    const quantita = quantita_magazzino === '' || quantita_magazzino === null || quantita_magazzino === undefined
      ? null
      : Number(quantita_magazzino);
    await db.run(
      `UPDATE prodotti SET nome = ?, tipologia = ?, branca = ?, taglia = ?, specialita = ?, guida_taglie_url = ?, immagine = ?, quantita_magazzino = ?, prezzo_vendita = ?, costo_acquisto = ?, usato = ?, non_a_catalogo_scouting = ?, mostra_home = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nome, tipologia, brancaValue, taglia || null, specialita || null, guida_taglie_url || null, immagine || null, quantita, Number(prezzo_vendita), Number(costo_acquisto), usato ? 1 : 0, nonACatalogo, mostra_home === false || mostra_home === 0 || mostra_home === '0' ? 0 : 1, req.params.id]
    );

    await db.run('UPDATE prodotti SET guida_taglie_url = ? WHERE nome = ?', [String(guida_taglie_url || '').trim() || null, nome]);

    res.json({ message: 'Prodotto aggiornato' });
  } catch (error) {
    console.error('Errore aggiornamento prodotto:', error);
    res.status(500).json({ error: 'Errore aggiornamento prodotto' });
  }
});

app.put('/api/admin/prodotti/:id/giacenza', async (req, res) => {
  const quantitaFisica = req.body?.quantita_fisica;
  if (!Number.isSafeInteger(quantitaFisica) || quantitaFisica < 0) {
    return res.status(400).json({ error: 'Inserisci una quantità fisica intera e non negativa' });
  }

  try {
    const result = await withTransaction(async db => {
      const product = await db.get(`SELECT id FROM prodotti WHERE id = ? ${db.pool ? 'FOR UPDATE' : ''}`,
        [req.params.id]);
      if (!product) {
        const error = new Error('Prodotto non trovato');
        error.status = 404;
        throw error;
      }

      const reserved = await db.get(
        `SELECT COALESCE(SUM(dp.quantita), 0) AS quantita_prenotata
         FROM dettagli_prenotazioni dp
         JOIN prenotazioni pr ON pr.id = dp.prenotazione_id
         WHERE dp.prodotto_id = ? AND dp.stato IN ('prenotato', 'pagato')
           AND COALESCE(dp.acquistato, 0) = 0 AND COALESCE(pr.archiviata, 0) = 0`,
        [req.params.id]
      );
      const quantitaPrenotata = Number(reserved.quantita_prenotata);
      const quantitaMagazzino = quantitaFisica - quantitaPrenotata;
      if (!Number.isSafeInteger(quantitaPrenotata) || !Number.isSafeInteger(quantitaMagazzino)) {
        const error = new Error('La quantità risultante non è valida');
        error.status = 400;
        throw error;
      }

      await db.run(
        'UPDATE prodotti SET quantita_magazzino = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quantitaMagazzino, req.params.id]
      );
      return { quantita_fisica: quantitaFisica, quantita_prenotata: quantitaPrenotata,
        quantita_magazzino: quantitaMagazzino };
    });
    res.json({ message: 'Giacenza corretta', ...result });
  } catch (error) {
    console.error('Errore rettifica giacenza:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore rettifica giacenza' });
  }
});

app.delete('/api/admin/prodotti/:id', async (req, res) => {
  try {
    const db = getDatabase();
    await db.run('DELETE FROM prodotti WHERE id = ?', [req.params.id]);
    res.json({ message: 'Prodotto eliminato' });
  } catch (error) {
    console.error('Errore eliminazione prodotto:', error);
    if (error.code === '23503' || error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /foreign key constraint failed/i.test(error.message || '')) {
      return res.status(409).json({
        error: 'Questo articolo è presente in una o più prenotazioni e non può essere eliminato. Per rimuoverlo dal catalogo, modifica l’articolo e disattiva “Visibile nella home”.'
      });
    }
    res.status(500).json({ error: 'Errore eliminazione prodotto' });
  }
});

app.get('/api/admin/prenotazioni', async (req, res) => {
  try {
    const db = getDatabase();
    const { archiviate } = req.query;
    let whereClause = '';
    if (archiviate === 'true') {
      whereClause = 'WHERE p.archiviata = 1';
    } else if (archiviate === 'all') {
      whereClause = '';
    } else {
      whereClause = 'WHERE (p.archiviata = 0 OR p.archiviata IS NULL)';
    }

    const prenotazioni = await db.all(
      `SELECT p.*, COALESCE(SUM(dp.quantita), 0) as num_items,
        COALESCE(SUM(dp.quantita * dp.prezzo_unitario), 0) as totale
       FROM prenotazioni p
       LEFT JOIN dettagli_prenotazioni dp ON p.id = dp.prenotazione_id
       ${whereClause}
       GROUP BY p.id
       ORDER BY p.data_prenotazione DESC`
    );
    res.json(prenotazioni);
  } catch (error) {
    console.error('Errore lettura prenotazioni:', error);
    res.status(500).json({ error: 'Errore lettura prenotazioni' });
  }
});

app.get('/api/admin/prenotazioni/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const prenotazione = await db.get('SELECT * FROM prenotazioni WHERE id = ?', [req.params.id]);
    await assertBookingAccess(db, req.user, prenotazione);
    const dettagli = await db.all(
      `SELECT dp.*, p.nome, p.taglia FROM dettagli_prenotazioni dp
       JOIN prodotti p ON dp.prodotto_id = p.id
       WHERE dp.prenotazione_id = ?`,
      [req.params.id]
    );
    res.json({ ...prenotazione, items: dettagli });
  } catch (error) {
    console.error('Errore lettura prenotazione:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore lettura prenotazione' });
  }
});

// MODIFICA COMPLETA PRENOTAZIONE CON RICALCOLO GIACENZE
app.put('/api/admin/prenotazioni/:id', async (req, res) => {
  try {
    await withTransaction(async db => {
      const { nome_prenotante, email_prenotante, branca_riferimento, genitore_di, note, items } = req.body;
      const bookingId = req.params.id;

      const existing = await db.get(`SELECT * FROM prenotazioni WHERE id = ? ${db.pool ? 'FOR UPDATE' : ''}`, [bookingId]);
      await assertBookingAccess(db, req.user, existing, { editing: true, branch: branca_riferimento });
      if (req.user.ruolo === 'capo_unita' && Array.isArray(items) && !items.length) {
        const error = new Error('La prenotazione deve contenere almeno un articolo');
        error.status = 400;
        throw error;
      }

      const trimmedEmail = String(email_prenotante ?? existing.email_prenotante).trim();
      if (!isValidEmail(trimmedEmail)) {
        const error = new Error('Inserisci un indirizzo email valido');
        error.status = 400;
        throw error;
      }
      if (genitore_di !== undefined && genitore_di !== null && typeof genitore_di !== 'string') {
        const error = new Error('Il campo Genitore di non è valido');
        error.status = 400;
        throw error;
      }

      await db.run(
        `UPDATE prenotazioni
         SET nome_prenotante = ?, email_prenotante = ?, branca_riferimento = ?, genitore_di = ?, note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          nome_prenotante || existing.nome_prenotante,
          trimmedEmail,
          branca_riferimento || existing.branca_riferimento,
          genitore_di !== undefined ? String(genitore_di || '').trim() || null : existing.genitore_di,
          note !== undefined ? note : existing.note,
          bookingId
        ]
      );

      if (Array.isArray(items)) {
        // 1. Ripristina le quantità precedenti a magazzino
        const oldItems = await db.all(
          'SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = ?',
          [bookingId]
        );
        const usedIds = new Set();
        const resolvedItems = [];
        for (const item of items) {
          const oldItem = item.id !== undefined
            ? oldItems.find(old => old.id === item.id)
            : oldItems.find(old => old.prodotto_id === item.prodotto_id &&
              (old.specialita || '') === (item.specialita || '') && !usedIds.has(old.id));
          if ((item.id !== undefined && !oldItem) || (oldItem && usedIds.has(oldItem.id)) ||
              !Number.isSafeInteger(item.quantita) || item.quantita <= 0 ||
              (oldItem && oldItem.prodotto_id !== item.prodotto_id)) {
            const error = new Error('Righe articolo o quantità non valide');
            error.status = 400;
            throw error;
          }
          if (oldItem) usedIds.add(oldItem.id);
          resolvedItems.push({ item, oldItem });
        }
        for (const oldItem of oldItems) {
          if (Number(oldItem.acquistato) === 1) continue;
          await db.run(
            `UPDATE prodotti SET quantita_magazzino = quantita_magazzino + ? WHERE id = ? AND quantita_magazzino IS NOT NULL`,
            [oldItem.quantita, oldItem.prodotto_id]
          );
        }

        for (const oldItem of oldItems) {
          if (!usedIds.has(oldItem.id)) await db.run('DELETE FROM dettagli_prenotazioni WHERE id = ?', [oldItem.id]);
        }

        for (const { item, oldItem } of resolvedItems) {
          const prodotto = await db.get(`SELECT * FROM prodotti WHERE id = ? ${db.pool ? 'FOR UPDATE' : ''}`, [item.prodotto_id]);
          const prezzoUnitario = Number(req.user.ruolo === 'capo_unita'
            ? oldItem?.prezzo_unitario ?? prodotto?.prezzo_vendita
            : item.prezzo_unitario ?? prodotto?.prezzo_vendita);
          if (!prodotto || !Number.isFinite(prezzoUnitario) || prezzoUnitario < 0) {
            const error = new Error('Prodotto o prezzo non valido');
            error.status = 400;
            throw error;
          }

          if (oldItem) {
            await db.run(
              'UPDATE dettagli_prenotazioni SET quantita = ?, prezzo_unitario = ?, specialita = ? WHERE id = ?',
              [item.quantita, prezzoUnitario, item.specialita || null, oldItem.id]
            );
          } else {
            await db.run(
              'INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, specialita) VALUES (?, ?, ?, ?, ?)',
              [bookingId, item.prodotto_id, item.quantita, prezzoUnitario, item.specialita || null]
            );
          }

          if (Number(oldItem?.acquistato || 0) !== 1 && prodotto.quantita_magazzino !== null && prodotto.quantita_magazzino !== undefined) {
            assertProductStock(prodotto, item.quantita);
            const nuovaQty = prodotto.quantita_magazzino - item.quantita;
            await db.run(
              'UPDATE prodotti SET quantita_magazzino = ? WHERE id = ?',
              [nuovaQty, item.prodotto_id]
            );
          }
        }
      }
    });
    res.json({ message: 'Prenotazione modificata con successo' });
  } catch (error) {
    console.error('Errore modifica prenotazione:', error);
    if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore modifica prenotazione' });
  }
});

// Materiale richiesto, copertura da magazzino e ordini al fornitore.
app.get('/api/admin/da-acquistare', async (req, res) => {
  try {
    res.json(await getMaterialOverview());
  } catch (error) {
    console.error('Errore recupero lista da acquistare:', error);
    res.status(500).json({ error: 'Errore recupero lista da acquistare' });
  }
});

// Export materiale da acquistare come CSV o XLSX
app.post('/api/admin/da-acquistare/export/:format', async (req, res) => {
  try {
    const { filterView, columns } = req.body;
    const format = req.params.format === 'xlsx' ? 'xlsx' : 'csv';
    const materials = await getMaterialOverview();
    const exportMaterials = format === 'xlsx' ? splitDistinctiveMaterials(materials) : materials;
    
    // Applica lo stesso filtro del frontend
    const filteredMaterials = exportMaterials.filter(item =>
      filterView === 'tutti' ||
      (filterView === 'bloccati' ? item.non_acquistabili > 0 : item[filterView] > 0)
    );

    let fileContent, contentType, filename;

    if (format === 'xlsx') {
      fileContent = generateMaterialXLSX(filteredMaterials, filterView, columns);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = generateExportFilename(filterView, 'xlsx');
    } else {
      fileContent = generateMaterialCSV(filteredMaterials, filterView, columns);
      contentType = 'text/csv; charset=utf-8';
      filename = generateExportFilename(filterView, 'csv');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.send(fileContent);
  } catch (error) {
    console.error('Errore export materiale:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore export materiale' });
  }
});

app.post('/api/admin/da-acquistare/:azione', async (req, res) => {
  try {
    res.json(await processMaterial(req.user, req.body?.productIds, req.params.azione));
  } catch (error) {
    console.error('Errore gestione materiale:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore gestione materiale' });
  }
});

app.delete('/api/admin/prenotazioni/:id', async (req, res) => {
  try {
    const deleted = await withTransaction(async db => {
      const booking = await db.get(`SELECT * FROM prenotazioni WHERE id = ? ${db.pool ? 'FOR UPDATE' : ''}`, [req.params.id]);
      await assertBookingAccess(db, req.user, booking, { editing: true });
      const dettagli = await db.all(
        'SELECT * FROM dettagli_prenotazioni WHERE prenotazione_id = ? ORDER BY id',
        [req.params.id]
      );

      await deleteBookingItems(db, dettagli);

      const result = await db.run('DELETE FROM prenotazioni WHERE id = ?', [req.params.id]);
      return result.changes;
    });
    if (!deleted) return res.status(404).json({ error: 'Prenotazione non trovata' });
    res.json({ message: 'Prenotazione eliminata' });
  } catch (error) {
    console.error('Errore eliminazione prenotazione:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Errore eliminazione prenotazione' });
  }
});

app.put('/api/admin/config/prenotazioni', async (req, res) => {
  try {
    const db = getDatabase();
    const { enabled } = req.body;

    await db.run(
      'UPDATE configurazione SET valore = ?, updated_at = CURRENT_TIMESTAMP WHERE chiave = ?',
      [enabled ? 'true' : 'false', 'prenotazioni_abilitate']
    );

    res.json({ message: 'Configurazione aggiornata' });
  } catch (error) {
    console.error('Errore aggiornamento configurazione:', error);
    res.status(500).json({ error: 'Errore aggiornamento configurazione' });
  }
});

// Impostazioni: email dei capi unità per branca, usate per il riepilogo all'archiviazione
app.get('/api/admin/config/email-branche', async (req, res) => {
  try {
    const db = getDatabase();
    const row = await db.get('SELECT valore FROM configurazione WHERE chiave = ?', ['email_capi_branca']);
    let emails = {};
    try { emails = row?.valore ? JSON.parse(row.valore) : {}; } catch { emails = {}; }
    res.json({ emails });
  } catch (error) {
    console.error('Errore lettura email branche:', error);
    res.status(500).json({ error: 'Errore lettura email branche' });
  }
});

app.put('/api/admin/config/email-branche', async (req, res) => {
  try {
    const db = getDatabase();
    const { emails } = req.body;
    if (!emails || typeof emails !== 'object' || Array.isArray(emails)) {
      return res.status(400).json({ error: 'Formato email non valido' });
    }

    const valore = JSON.stringify(emails);
    const existing = await db.get('SELECT valore FROM configurazione WHERE chiave = ?', ['email_capi_branca']);
    if (existing) {
      await db.run('UPDATE configurazione SET valore = ?, updated_at = CURRENT_TIMESTAMP WHERE chiave = ?', [valore, 'email_capi_branca']);
    } else {
      await db.run('INSERT INTO configurazione (chiave, valore) VALUES (?, ?)', ['email_capi_branca', valore]);
    }

    res.json({ message: 'Email branche aggiornate con successo' });
  } catch (error) {
    console.error('Errore salvataggio email branche:', error);
    res.status(500).json({ error: 'Errore salvataggio email branche' });
  }
});

app.put('/api/admin/config/guida-taglie', async (req, res) => {
  try {
    const db = getDatabase();
    const url = typeof req.body.url === 'string' ? req.body.url.trim() : '';
    if (url && !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'L’URL della guida taglie non è valido' });
    }
    await db.run(
      'UPDATE configurazione SET valore = ?, updated_at = CURRENT_TIMESTAMP WHERE chiave = ?',
      [url, 'guida_taglie_url']
    );
    res.json({ message: 'Guida taglie aggiornata' });
  } catch (error) {
    console.error('Errore salvataggio guida taglie:', error);
    res.status(500).json({ error: 'Errore salvataggio guida taglie' });
  }
});

// Predisposizione futura pagamento con carta: endpoint pronto ma non collegato/visibile in UI
app.post('/api/pagamenti/carta/crea-intento', async (req, res) => {
  try {
    const db = getDatabase();
    const config = await db.get('SELECT valore FROM configurazione WHERE chiave = ?', ['pagamento_carta_abilitato']);
    if (config?.valore !== 'true') {
      return res.status(503).json({ error: 'Pagamento con carta non ancora disponibile' });
    }
    // TODO: integrare un provider di pagamento (es. Stripe) quando la funzionalità verrà attivata
    res.status(501).json({ error: 'Integrazione pagamento con carta non ancora implementata' });
  } catch (error) {
    console.error('Errore predisposizione pagamento carta:', error);
    res.status(500).json({ error: 'Errore predisposizione pagamento carta' });
  }
});

// Invia il riepilogo prima di archiviare gli ordini attivi
async function inviaRiepiloghiChiusuraBranche(db) {
  const row = await db.get('SELECT valore FROM configurazione WHERE chiave = ?', ['email_capi_branca']);
  let emailMap = {};
  try { emailMap = row?.valore ? JSON.parse(row.valore) : {}; } catch { emailMap = {}; }

  const branche = Object.keys(emailMap)
    .map(branca => ({ nome: String(branca).trim(), email: String(emailMap[branca] || '').trim() }))
    .filter(({ nome, email }) => nome && email);
  const riepiloghi = { inviati: 0, senzaOrdini: [], falliti: [], errori: {} };
  if (branche.length === 0) return riepiloghi;

  const prenotazioniAttive = await db.all(
    'SELECT * FROM prenotazioni WHERE (archiviata = 0 OR archiviata IS NULL)'
  );

  for (const { nome: branca, email: destinatario } of branche) {
    const brancaNormalizzata = normalizeBranch(branca);
    const prenotazioni = prenotazioniAttive.filter(prenotazione => {
      const riferimento = normalizeBranch(prenotazione.branca_riferimento);
      return riferimento === brancaNormalizzata || riferimento === 'tutti';
    });
    if (prenotazioni.length === 0) {
      riepiloghi.senzaOrdini.push(branca);
      continue;
    }

    const bookings = [];
    for (const prenotazione of prenotazioni) {
      const items = await db.all(
        `SELECT dp.*, p.nome FROM dettagli_prenotazioni dp JOIN prodotti p ON dp.prodotto_id = p.id WHERE dp.prenotazione_id = ?`,
        [prenotazione.id]
      );
      bookings.push({ prenotazione, items });
    }

    const inviata = await sendBrancaSummaryEmail(destinatario, branca, bookings);
    if (inviata) {
      riepiloghi.inviati++;
    } else {
      riepiloghi.falliti.push(branca);
      riepiloghi.errori[branca] = 'Il provider SMTP ha rifiutato o non ha completato l’invio';
    }
  }

  return riepiloghi;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Inizializzazione
async function start() {
  try {
    await initializeDatabase();
    initializeEmailService();
    const sendNotifications = () => deliverStatusNotifications().catch(error => console.error('Errore coda notifiche:', error));
    sendNotifications();
    setInterval(sendNotifications, 10000).unref();
    app.listen(PORT, () => {
      console.log(`Server avviato su http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Errore inizializzazione:', error);
    process.exit(1);
  }
}

// Gestione interruzione
process.on('SIGINT', async () => {
  console.log('Chiusura server...');
  await closeDatabase();
  process.exit(0);
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
