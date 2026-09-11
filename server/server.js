import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDatabase, closeDatabase } from './database.js';
import { initializeEmailService, sendBookingEmail, sendAdminNotification } from './emailService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Routes
app.get('/api/prodotti', async (req, res) => {
  try {
    const db = getDatabase();
    const query = req.query.admin === 'true'
      ? 'SELECT * FROM prodotti ORDER BY branca, tipologia'
      : 'SELECT * FROM prodotti WHERE mostra_home = 1 ORDER BY branca, tipologia';
    const prodotti = await db.all(query);
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

app.post('/api/prenotazioni', async (req, res) => {
  try {
    const db = getDatabase();
    const { nome_prenotante, email_prenotante, branca_riferimento, note, items } = req.body;

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

    // VALIDARE DISPONIBILITÀ PRIMA DI CREARE LA PRENOTAZIONE
    for (const item of items) {
      const prodotto = await db.get('SELECT * FROM prodotti WHERE id = ?', [item.prodotto_id]);
      
      if (!prodotto) {
        return res.status(404).json({ error: `Prodotto ${item.prodotto_id} non trovato` });
      }

      // Se quantità_magazzino è NULL/undefined = illimitato (ok)
      // Se quantità_magazzino è 0 = esaurito (errore)
      // Se quantità_magazzino < quantità richiesta = errore
      if (prodotto.quantita_magazzino !== null && prodotto.quantita_magazzino !== undefined) {
        if (prodotto.quantita_magazzino === 0) {
          return res.status(400).json({ 
            error: `${prodotto.nome} non è disponibile` 
          });
        }
        if (item.quantita > prodotto.quantita_magazzino) {
          return res.status(400).json({ 
            error: `Quantità non sufficiente per ${prodotto.nome}. Disponibili: ${prodotto.quantita_magazzino}, Richiesti: ${item.quantita}` 
          });
        }
      }
    }

    const prenotazione_id = uuidv4();
    
    // Inserire prenotazione
    await db.run(
      'INSERT INTO prenotazioni (id, nome_prenotante, email_prenotante, branca_riferimento, note) VALUES (?, ?, ?, ?, ?)',
      [prenotazione_id, nome_prenotante, email_prenotante, branca_riferimento, note || null]
    );

    // Inserire dettagli prenotazione E DECREMENTARE QUANTITÀ
    for (const item of items) {
      const prodotto = await db.get('SELECT * FROM prodotti WHERE id = ?', [item.prodotto_id]);
      if (prodotto) {
        await db.run(
          'INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, specialita) VALUES (?, ?, ?, ?, ?)',
          [prenotazione_id, item.prodotto_id, item.quantita, prodotto.prezzo, item.specialita || null]
        );

        // DECREMENTARE QUANTITÀ SE IL PRODOTTO HA UN LIMITE
        if (prodotto.quantita_magazzino !== null && prodotto.quantita_magazzino !== undefined) {
          const nuova_quantita = prodotto.quantita_magazzino - item.quantita;
          await db.run(
            'UPDATE prodotti SET quantita_magazzino = ? WHERE id = ?',
            [nuova_quantita, item.prodotto_id]
          );
        }
      }
    }

    // Recuperare i dettagli per email
    const dettagli = await db.all(
      `SELECT dp.*, p.nome FROM dettagli_prenotazioni dp 
       JOIN prodotti p ON dp.prodotto_id = p.id 
       WHERE dp.prenotazione_id = ?`,
      [prenotazione_id]
    );

    const bookingData = {
      id: prenotazione_id,
      nome_prenotante,
      email_prenotante,
      branca_riferimento,
      data_prenotazione: new Date().toISOString(),
      note,
      items: dettagli.map(d => ({
        nome: d.specialita ? `${d.nome} - ${d.specialita}` : d.nome,
        quantita: d.quantita,
        prezzo_unitario: d.prezzo_unitario
      }))
    };

    // Inviare email
    const customerEmailSent = await sendBookingEmail(email_prenotante, bookingData);
    const adminEmailSent = await sendAdminNotification(bookingData);

    res.status(201).json({
      id: prenotazione_id,
      message: 'Prenotazione creata con successo',
      emailSent: customerEmailSent && adminEmailSent
    });
  } catch (error) {
    console.error('Errore creazione prenotazione:', error);
    res.status(500).json({ error: 'Errore creazione prenotazione' });
  }
});

// Admin Routes
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  // Implementare autenticazione JWT/sessione
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    res.json({ token: 'admin-token' });
  } else {
    res.status(401).json({ error: 'Credenziali non valide' });
  }
});

app.post('/api/admin/prodotti', async (req, res) => {
  try {
    const db = getDatabase();
    const { nome, tipologia, branca, taglia, specialita, immagine, quantita_magazzino, prezzo, usato, mostra_home } = req.body;
    const quantita = quantita_magazzino === '' || quantita_magazzino === null || quantita_magazzino === undefined
      ? null
      : Number(quantita_magazzino);

    const result = await db.run(
      `INSERT INTO prodotti (nome, tipologia, branca, taglia, specialita, immagine, quantita_magazzino, prezzo, usato, mostra_home) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, tipologia, branca, taglia || null, specialita || null, immagine || null, quantita, prezzo, usato ? 1 : 0, mostra_home === false || mostra_home === 0 || mostra_home === '0' ? 0 : 1]
    );

    res.status(201).json({ id: result.lastID, message: 'Prodotto creato' });
  } catch (error) {
    console.error('Errore creazione prodotto:', error);
    res.status(500).json({ error: 'Errore creazione prodotto' });
  }
});

app.put('/api/admin/prodotti/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { nome, tipologia, branca, taglia, specialita, immagine, quantita_magazzino, prezzo, usato, mostra_home } = req.body;
    const quantita = quantita_magazzino === '' || quantita_magazzino === null || quantita_magazzino === undefined
      ? null
      : Number(quantita_magazzino);

    await db.run(
      `UPDATE prodotti SET nome = ?, tipologia = ?, branca = ?, taglia = ?, specialita = ?, immagine = ?, quantita_magazzino = ?, prezzo = ?, usato = ?, mostra_home = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [nome, tipologia, branca, taglia || null, specialita || null, immagine || null, quantita, prezzo, usato ? 1 : 0, mostra_home === false || mostra_home === 0 || mostra_home === '0' ? 0 : 1, req.params.id]
    );

    res.json({ message: 'Prodotto aggiornato' });
  } catch (error) {
    console.error('Errore aggiornamento prodotto:', error);
    res.status(500).json({ error: 'Errore aggiornamento prodotto' });
  }
});

app.delete('/api/admin/prodotti/:id', async (req, res) => {
  try {
    const db = getDatabase();
    await db.run('DELETE FROM prodotti WHERE id = ?', [req.params.id]);
    res.json({ message: 'Prodotto eliminato' });
  } catch (error) {
    console.error('Errore eliminazione prodotto:', error);
    res.status(500).json({ error: 'Errore eliminazione prodotto' });
  }
});

app.get('/api/admin/prenotazioni', async (req, res) => {
  try {
    const db = getDatabase();
    const prenotazioni = await db.all(
      `SELECT p.*, COUNT(dp.id) as num_items,
        COALESCE(SUM(dp.quantita * dp.prezzo_unitario), 0) as totale
       FROM prenotazioni p
       LEFT JOIN dettagli_prenotazioni dp ON p.id = dp.prenotazione_id
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
    const dettagli = await db.all(
      `SELECT dp.*, p.nome FROM dettagli_prenotazioni dp
       JOIN prodotti p ON dp.prodotto_id = p.id
       WHERE dp.prenotazione_id = ?`,
      [req.params.id]
    );
    res.json({ ...prenotazione, items: dettagli });
  } catch (error) {
    console.error('Errore lettura prenotazione:', error);
    res.status(500).json({ error: 'Errore lettura prenotazione' });
  }
});

app.put('/api/admin/prenotazioni/:id/stato', async (req, res) => {
  try {
    const db = getDatabase();
    const { stato } = req.body;
    await db.run(
      'UPDATE prenotazioni SET stato = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [stato, req.params.id]
    );
    res.json({ message: 'Stato prenotazione aggiornato' });
  } catch (error) {
    console.error('Errore aggiornamento stato:', error);
    res.status(500).json({ error: 'Errore aggiornamento stato' });
  }
});

app.delete('/api/admin/prenotazioni/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const dettagli = await db.all(
      'SELECT prodotto_id, quantita FROM dettagli_prenotazioni WHERE prenotazione_id = ?',
      [req.params.id]
    );

    await db.run('BEGIN TRANSACTION');
    try {
      for (const dettaglio of dettagli) {
        await db.run(
          `UPDATE prodotti
           SET quantita_magazzino = quantita_magazzino + ?
           WHERE id = ? AND quantita_magazzino IS NOT NULL`,
          [dettaglio.quantita, dettaglio.prodotto_id]
        );
      }

      await db.run(
        'DELETE FROM dettagli_prenotazioni WHERE prenotazione_id = ?',
        [req.params.id]
      );

      const result = await db.run('DELETE FROM prenotazioni WHERE id = ?', [req.params.id]);
      if (result.changes === 0) {
        await db.run('ROLLBACK');
        return res.status(404).json({ error: 'Prenotazione non trovata' });
      }
      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }

    res.json({ message: 'Prenotazione eliminata' });
  } catch (error) {
    console.error('Errore eliminazione prenotazione:', error);
    res.status(500).json({ error: 'Errore eliminazione prenotazione' });
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

start();
