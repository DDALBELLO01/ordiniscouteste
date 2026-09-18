import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDatabase, closeDatabase } from './database.js';
import { initializeEmailService, sendBookingEmail, sendAdminNotification, sendBrancaSummaryEmail } from './emailService.js';
 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
// CORS aperto per l'endpoint pubblico usato dal bookmarklet eseguito su scoutingfse.it
app.use('/api/public', cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Routes
app.get('/api/prodotti', async (req, res) => {
  try {
    const db = getDatabase();
    const query = req.query.admin === 'true'
      ? 'SELECT * FROM prodotti ORDER BY branca, tipologia'
      : 'SELECT * FROM prodotti WHERE mostra_home = 1 ORDER BY branca, tipologia';
    let prodotti = await db.all(query);
    if (req.query.admin !== 'true') {
      // NASCONDE AUTOMATICAMENTE I PEZZI USATI CON GIACENZA 0 O INFERIORE
      prodotti = prodotti.filter(p => {
        const isUsato = p.usato === 1 || p.usato === true;
        const isOut = p.quantita_magazzino !== null && p.quantita_magazzino !== undefined && Number(p.quantita_magazzino) <= 0;
        return !(isUsato && isOut);
      });
    }
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

      const isUsato = prodotto.usato === 1 || prodotto.usato === true;
      // Per gli articoli USATI verifica la quantità di magazzino
      // Per gli articoli NUOVI l'ordine è sempre consentito.
      if (isUsato) {
        if (prodotto.quantita_magazzino !== null && prodotto.quantita_magazzino !== undefined) {
          if (prodotto.quantita_magazzino <= 0) {
            return res.status(400).json({ 
              error: `${prodotto.nome} (Usato) non è più disponibile in magazzino` 
            });
          }
          if (item.quantita > prodotto.quantita_magazzino) {
            return res.status(400).json({ 
              error: `Quantità usata non sufficiente per ${prodotto.nome}. Disponibili: ${prodotto.quantita_magazzino}` 
            });
          }
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
      `SELECT p.*, COUNT(dp.id) as num_items,
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

// ARCHIVIAZIONE MASSIVA: raggruppa tutte le prenotazioni attive nel giorno di archiviazione
app.post('/api/admin/prenotazioni/archivia-tutte', async (req, res) => {
  try {
    const db = getDatabase();
    const riepiloghi = await inviaRiepiloghiChiusuraBranche(db);
    const result = await db.run(
      `UPDATE prenotazioni SET archiviata = 1, data_archiviazione = CURRENT_TIMESTAMP WHERE (archiviata = 0 OR archiviata IS NULL)`
    );
    res.json({
      message: 'Prenotazioni archiviate con successo',
      archiviate: result.changes,
      riepilogInviati: riepiloghi.inviati,
      riepiloghi
    });
  } catch (error) {
    console.error('Errore archiviazione prenotazioni:', error);
    res.status(500).json({ error: 'Errore archiviazione prenotazioni' });
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

// MODIFICA COMPLETA PRENOTAZIONE CON RICALCOLO GIACENZE
app.put('/api/admin/prenotazioni/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { nome_prenotante, email_prenotante, branca_riferimento, note, items } = req.body;
    const bookingId = req.params.id;

    const existing = await db.get('SELECT * FROM prenotazioni WHERE id = ?', [bookingId]);
    if (!existing) {
      return res.status(404).json({ error: 'Prenotazione non trovata' });
    }

    await db.run(
      `UPDATE prenotazioni 
       SET nome_prenotante = ?, email_prenotante = ?, branca_riferimento = ?, note = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        nome_prenotante || existing.nome_prenotante,
        email_prenotante || existing.email_prenotante,
        branca_riferimento || existing.branca_riferimento,
        note !== undefined ? note : existing.note,
        bookingId
      ]
    );

    if (Array.isArray(items)) {
      // 1. Ripristina le quantità precedenti a magazzino
      const oldItems = await db.all(
        'SELECT prodotto_id, quantita FROM dettagli_prenotazioni WHERE prenotazione_id = ?',
        [bookingId]
      );
      for (const oldItem of oldItems) {
        await db.run(
          `UPDATE prodotti SET quantita_magazzino = quantita_magazzino + ? WHERE id = ? AND quantita_magazzino IS NOT NULL`,
          [oldItem.quantita, oldItem.prodotto_id]
        );
      }

      // 2. Rimuove vecchi dettagli
      await db.run('DELETE FROM dettagli_prenotazioni WHERE prenotazione_id = ?', [bookingId]);

      // 3. Inserisce nuovi dettagli e scala nuove quantità dal magazzino
      for (const item of items) {
        const prodotto = await db.get('SELECT * FROM prodotti WHERE id = ?', [item.prodotto_id]);
        const prezzoUnitario = item.prezzo_unitario ?? (prodotto ? prodotto.prezzo : 0);

        await db.run(
          'INSERT INTO dettagli_prenotazioni (prenotazione_id, prodotto_id, quantita, prezzo_unitario, specialita) VALUES (?, ?, ?, ?, ?)',
          [bookingId, item.prodotto_id, item.quantita, prezzoUnitario, item.specialita || null]
        );

        if (prodotto && prodotto.quantita_magazzino !== null && prodotto.quantita_magazzino !== undefined) {
          const nuovaQty = prodotto.quantita_magazzino - item.quantita;
          await db.run(
            'UPDATE prodotti SET quantita_magazzino = ? WHERE id = ?',
            [nuovaQty, item.prodotto_id]
          );
        }
      }
    }

    res.json({ message: 'Prenotazione modificata con successo' });
  } catch (error) {
    console.error('Errore modifica prenotazione:', error);
    res.status(500).json({ error: 'Errore modifica prenotazione' });
  }
});

// LISTA ARTICOLI NUOVI DA ACQUISTARE
app.get('/api/admin/da-acquistare', async (req, res) => {
  try {
    const db = getDatabase();
    const soloRichiesti = req.query.soloRichiesti === 'true';

    let query = `
      SELECT p.*,
        COALESCE((
          SELECT SUM(dp.quantita)
          FROM dettagli_prenotazioni dp
          JOIN prenotazioni pr ON dp.prenotazione_id = pr.id
          WHERE dp.prodotto_id = p.id AND (pr.archiviata = 0 OR pr.archiviata IS NULL)
        ), 0) as quantita_prenotata
      FROM prodotti p
      WHERE (p.usato = 0 OR p.usato IS NULL)
    `;

    if (soloRichiesti) {
      query += `
        AND COALESCE((
          SELECT SUM(dp.quantita)
          FROM dettagli_prenotazioni dp
          JOIN prenotazioni pr ON dp.prenotazione_id = pr.id
          WHERE dp.prodotto_id = p.id AND (pr.archiviata = 0 OR pr.archiviata IS NULL)
        ), 0) > 0
      `;
    } else {
      query += `
        AND (
          p.quantita_magazzino = 0 
          OR p.quantita_magazzino < 0
          OR COALESCE((
            SELECT SUM(dp.quantita)
            FROM dettagli_prenotazioni dp
            JOIN prenotazioni pr ON dp.prenotazione_id = pr.id
            WHERE dp.prodotto_id = p.id AND (pr.archiviata = 0 OR pr.archiviata IS NULL)
          ), 0) > COALESCE(p.quantita_magazzino, 999999)
        )
      `;
    }

    query += ` ORDER BY p.branca, p.nome`;

    const prodotti = await db.all(query);
    res.json(prodotti);
  } catch (error) {
    console.error('Errore recupero lista da acquistare:', error);
    res.status(500).json({ error: 'Errore recupero lista da acquistare' });
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

  const aliasBranche = {
    coccinelle: 'cerchio',
    lupetti: 'branco',
    rover: 'clan',
    capi: 'rs'
  };
  const normalizzaBranca = valore => {
    const normalizzata = String(valore || '').trim().toLocaleLowerCase('it-IT');
    return aliasBranche[normalizzata] || normalizzata;
  };

  for (const { nome: branca, email: destinatario } of branche) {
    const brancaNormalizzata = normalizzaBranca(branca);
    const prenotazioni = prenotazioniAttive.filter(prenotazione => {
      const riferimento = normalizzaBranca(prenotazione.branca_riferimento);
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
