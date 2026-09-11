import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'ordini.db');

// Listino 2025
const productos = [
  // UNIFORMI - BERRETTI
  { nome: 'BASCO NERO', tipologia: 'Berretto', branca: 'Capi', taglia: '53-62 cm', prezzo: 14.00 },
  { nome: 'BERRETTO BLU da campo', tipologia: 'Berretto', branca: 'Capi', taglia: 'Regolabile', prezzo: 6.00 },
  { nome: 'BERRETTO CAPO SCOUT NAUTICO', tipologia: 'Berretto', branca: 'Rover', taglia: '55-62 cm', prezzo: 36.00 },
  { nome: 'BERRETTO da navigazione', tipologia: 'Berretto', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 16.00 },
  { nome: 'BERRETTO LUPETTO', tipologia: 'Berretto', branca: 'Lupetti', taglia: 'XXS-L', prezzo: 14.00 },
  { nome: 'BERRETTO PILE con logo', tipologia: 'Berretto', branca: 'Esploratori', taglia: 'S/M - L/XL', prezzo: 6.00 },
  { nome: 'BERRETTO SCOUT NAUTICO', tipologia: 'Berretto', branca: 'Esploratori', taglia: '54-61 cm', prezzo: 26.00 },
  { nome: 'CALZETTONI COTONE RAGAZZO/RAGAZZA', tipologia: 'Calze', branca: 'Esploratori', taglia: '33-34 / 38-40', prezzo: 6.00 },
  { nome: 'CALZETTONI da campo', tipologia: 'Calze', branca: 'Esploratori', taglia: '30-33 / 38-40', prezzo: 4.00 },
  { nome: 'CALZETTONI da trekking', tipologia: 'Calze', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'CAMICIA GUIDA', tipologia: 'Camicia', branca: 'Guide', taglia: 'XXS-XXXL', prezzo: 24.00 },
  { nome: 'CAMICIA SCOUT', tipologia: 'Camicia', branca: 'Esploratori', taglia: 'XXS-XXXL', prezzo: 24.00 },
  { nome: 'CAMICIA SCOUT NAUTICO', tipologia: 'Camicia', branca: 'Rover', taglia: 'XXS-XXXL', prezzo: 24.00 },
  { nome: 'CAPPELLONE GUIDA', tipologia: 'Cappellone', branca: 'Guide', taglia: '53-62 cm', prezzo: 36.00 },
  { nome: 'CAPPELLONE SCOUT', tipologia: 'Cappellone', branca: 'Esploratori', taglia: '54-62 cm', prezzo: 36.00 },
  { nome: 'CINTURA SCOUT', tipologia: 'Cintura', branca: 'Esploratori', taglia: '80-140 cm', prezzo: 10.00 },
  { nome: 'FERMAFAZZOLETTO COCCINELLA', tipologia: 'Fermafazzoletto', branca: 'Coccinelle', taglia: 'Taglia Unica', prezzo: 1.50 },
  { nome: 'FERMAFAZZOLETTO INTRECCIATO', tipologia: 'Fermafazzoletto', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 2.00 },
  { nome: 'FERMAFAZZOLETTO LOGO FSE', tipologia: 'Fermafazzoletto', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 1.50 },
  { nome: 'FERMAFAZZOLETTO TESTA DI LUPO', tipologia: 'Fermafazzoletto', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 1.50 },
  { nome: 'FIBBIA', tipologia: 'Accessorio', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 6.00 },
  { nome: 'FISCHIETTO BITONICO', tipologia: 'Fischietto', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 5.00 },
  { nome: 'FISCHIETTO PER NAUTICI', tipologia: 'Fischietto', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'FREGIO BERRETTO CAPI NAUTICI', tipologia: 'Fregio', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 4.00 },
  { nome: 'FREGIO PER COPRICAPO', tipologia: 'Fregio', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 2.50 },
  { nome: 'GONNA PANTALONE BLU', tipologia: 'Gonna', branca: 'Guide', taglia: '34-60', prezzo: 24.00 },
  { nome: 'LEGGING', tipologia: 'Legging', branca: 'Coccinelle', taglia: 'Taglia Unica', prezzo: 6.00 },
  { nome: 'MAGLIETTA BLU LOGO VERTICALE RAGAZZO/RAGAZZA', tipologia: 'Maglietta', branca: 'Esploratori', taglia: 'XS-XL', prezzo: 6.00 },
  { nome: 'MAGLIETTA BLU LOGO VERTICALE UOMO/DONNA', tipologia: 'Maglietta', branca: 'Rover', taglia: 'S-XXL', prezzo: 6.00 },
  { nome: 'MAGLIETTA ESTIVA VERDE LUPETTO', tipologia: 'Maglietta', branca: 'Lupetti', taglia: '5-6 anni / S', prezzo: 16.00 },
  { nome: 'MAGLIETTA tecnica traspirante', tipologia: 'Maglietta', branca: 'Esploratori', taglia: '10-12 anni / XXL', prezzo: 10.00 },
  { nome: 'MAGLIONE BLU SCOUT', tipologia: 'Maglione', branca: 'Esploratori', taglia: '32-58', prezzo: 28.00 },
  { nome: 'MAGLIONE VERDE LUPETTO', tipologia: 'Maglione', branca: 'Lupetti', taglia: '5-6 anni / S', prezzo: 24.00 },
  { nome: 'PANTALONCINI da campo ragazza/ragazzo', tipologia: 'Pantaloncini', branca: 'Esploratori', taglia: '6-8 anni / 12-14', prezzo: 10.00 },
  { nome: 'PANTALONCINI da campo donna/uomo', tipologia: 'Pantaloncini', branca: 'Rover', taglia: 'S-L', prezzo: 12.00 },
  { nome: 'PANTALONE trekking', tipologia: 'Pantalone', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 42.00 },
  { nome: 'PANTALONI VELLUTO BLU LUNGHI', tipologia: 'Pantalone', branca: 'Esploratori', taglia: '34-60', prezzo: 28.00 },
  { nome: 'PANTALONI VELLUTO BLU CORTI', tipologia: 'Pantalone', branca: 'Esploratori', taglia: '34-60', prezzo: 24.00 },
  { nome: 'SCALDACOLLO CON LOGO', tipologia: 'Scaldacollo', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 6.00 },
  { nome: 'ZUCCHETTO COCCINELLA', tipologia: 'Copricapo', branca: 'Coccinelle', taglia: 'Taglia Unica', prezzo: 14.00 },
  
  // DISTINTIVI
  { nome: 'BARRETTE DI FUNZIONE', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 4.00 },
  { nome: 'BORCHIA C.N. ROVER/SCOLTE 2012', tipologia: 'Distintivo', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 2.00 },
  { nome: 'CORDONCINO TRICOLORE', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 0.80 },
  { nome: 'DISTINTIVI DI GRUPPO - 100 PZ.', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 45.00 },
  { nome: 'DISTINTIVI DI GRUPPO - 200 PZ.', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 60.00 },
  { nome: 'DISTINTIVI ASSOCIATIVI', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 0.80 },
  { nome: 'DISTINTIVI REGIONALI', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 0.80 },
  { nome: 'DISTINTIVI SPECIALITA\'', tipologia: 'Distintivo', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 0.80 },
  { nome: 'DISTINTIVO 40 FONDAZIONE ASSOCIAZIONE', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 1.00 },
  { nome: 'DISTINTIVO EUROMOOT 2019', tipologia: 'Distintivo', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 1.00 },
  { nome: 'FETTUCCIA BIANCA/GIALLA/VERDE', tipologia: 'Nastro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 0.50 },
  { nome: 'MEDAGLIA LUPETTIADI ARGENTO', tipologia: 'Medaglia', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 1.20 },
  { nome: 'MEDAGLIA LUPETTIADI DI BRONZO', tipologia: 'Medaglia', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 1.20 },
  { nome: 'MEDAGLIA LUPETTIADI ORO', tipologia: 'Medaglia', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 1.20 },
  { nome: 'OMERALI DELLA PARTENZA', tipologia: 'Distintivo', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 3.00 },
  { nome: 'R-S', tipologia: 'Distintivo', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 2.00 },
  
  // EDITORIA
  { nome: '40 IN CAMMINO VERSO IL FUTURO', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 10.00 },
  { nome: 'AGENDA UNIVERSALE FSE', tipologia: 'Agenda', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'AIUTAMI', tipologia: 'Libro', branca: 'Coccinelle', taglia: 'Taglia Unica', prezzo: 4.00 },
  { nome: 'B.P. - GIOCARE IL GIOCO', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 11.00 },
  { nome: 'B.P. - GIOCHI SCOUT', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 10.00 },
  { nome: 'B.P. - GUIDA DA TE LA TUA CANOA', tipologia: 'Libro', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 8.50 },
  { nome: 'B.P. - IL LIBRO DEI CAPI', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 11.00 },
  { nome: 'B.P. - LA MIA VITA COME UN\'AVVENTURA', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 12.00 },
  { nome: 'B.P. - LA STRADA VERSO IL SUCCESSO', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 12.50 },
  { nome: 'B.P. - L\'EDUCAZIONE NON FINISCE MAI', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 10.00 },
  { nome: 'B.P. - MANUALE DEI LUPETTI', tipologia: 'Libro', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 14.00 },
  { nome: 'B.P. - TACCUINO', tipologia: 'Taccuino', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 16.00 },
  { nome: 'BREVETTO SPECIALITA\' LUPETTO', tipologia: 'Documento', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 0.30 },
  { nome: 'CANZONIERE ROVER', tipologia: 'Libro', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 12.00 },
  { nome: 'CANZONIERE SCOUT', tipologia: 'Libro', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 6.00 },
  { nome: 'GIOCHI SCOUT (A.Grieco)', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 14.00 },
  { nome: 'GIRL GUIDING', tipologia: 'Libro', branca: 'Guide', taglia: 'Taglia Unica', prezzo: 13.00 },
  { nome: 'GUIDISMO: UNA PROPOSTA PER LA VITA', tipologia: 'Libro', branca: 'Guide', taglia: 'Taglia Unica', prezzo: 11.00 },
  { nome: 'IL MANUALE DEL CAPOSQUADRIGLIA', tipologia: 'Libro', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 10.00 },
  { nome: 'IL MANUALE DELLO SCOUT', tipologia: 'Libro', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 14.00 },
  { nome: 'IL SESTANTE', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 16.00 },
  { nome: 'LA TRACCIA DI BADEN', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 14.00 },
  { nome: 'NORME DIRETTIVE E CERIMONIALE BR. LUPETTI', tipologia: 'Manuale', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'NORME DIRETTIVE E CERIMONIALE BR. ESPLORATORI', tipologia: 'Manuale', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'NORME DIRETTIVE E CERIMONIALE BR. GUIDE', tipologia: 'Manuale', branca: 'Guide', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'NORME DIRETTIVE E CERIMONIALE BR. ROVER', tipologia: 'Manuale', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 12.00 },
  { nome: 'STATUTO E NORME DIRETTIVE', tipologia: 'Manuale', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 15.00 },
  { nome: 'STORIA DELLO SCAUTISMO IN ITALIA', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 15.00 },
  { nome: 'STORIA DELLO SCAUTISMO NEL MONDO', tipologia: 'Libro', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 18.00 },
  
  // CAMPISMO
  { nome: 'BATTERIA CUCINA DI SQ.', tipologia: 'Attrezzatura', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 140.00 },
  { nome: 'BATTERIA E SPIRITIERA AD ALCOLE', tipologia: 'Attrezzatura', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 28.00 },
  { nome: 'BEAUTY LOGO ASSOCIATIVO', tipologia: 'Accessorio', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 12.00 },
  { nome: 'BORRACCIA 400 ML', tipologia: 'Borraccia', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 5.00 },
  { nome: 'BORRACCIA CON LOGO 750 ML', tipologia: 'Borraccia', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'BRANDINA DA CAMPO', tipologia: 'Attrezzatura', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 59.00 },
  { nome: 'BRICCO INOX 400 cc', tipologia: 'Utensile', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 6.00 },
  { nome: 'BUSSOLA MODELLO RANGER', tipologia: 'Strumento', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'COLTELLINO OPINEL N.7', tipologia: 'Coltellino', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'COLTELLINO OPINEL N.8', tipologia: 'Coltellino', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 10.00 },
  { nome: 'COLTELLINO OPINEL PUNTA TONDA N.7', tipologia: 'Coltellino', branca: 'Coccinelle', taglia: 'Taglia Unica', prezzo: 11.00 },
  { nome: 'GAVETTA TONDA IN ALLUMINIO', tipologia: 'Utensile', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 18.00 },
  { nome: 'LAMPADA FRONTALE USB', tipologia: 'Lampada', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 12.00 },
  { nome: 'MARSUPIO LOGO ASSOCIATIVO', tipologia: 'Zaino', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 8.00 },
  { nome: 'MATERASSINO PIEGHEVOLE', tipologia: 'Materassino', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 13.00 },
  { nome: 'SACCO LETTO ECO COTTON', tipologia: 'Sacco a pelo', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 24.00 },
  { nome: 'SACCO YUCON PLUS', tipologia: 'Sacco a pelo', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 62.00 },
  { nome: 'ZAINO 20 LT LOGO ASSOCIATIVO', tipologia: 'Zaino', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 12.00 },
  { nome: 'ZAINO EVERYWHERE 75', tipologia: 'Zaino', branca: 'Rover', taglia: 'Taglia Unica', prezzo: 99.00 },
  { nome: 'THERMOS LOGO ASSOCIATIVO', tipologia: 'Thermos', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 12.00 },
  
  // GADGET E VARIE
  { nome: 'ADESIVI ASSOCIATIVI', tipologia: 'Gadget', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 0.50 },
  { nome: 'BANDIERA ITALIANA', tipologia: 'Bandiera', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 20.00 },
  { nome: 'BANDIERA EUROPEA', tipologia: 'Bandiera', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 20.00 },
  { nome: 'BANDIERINA ASSOCIATIVA', tipologia: 'Bandiera', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 3.50 },
  { nome: 'BASTONE SCOUT', tipologia: 'Accessorio', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 25.00 },
  { nome: 'CASULA', tipologia: 'Abbigliamento Liturgico', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 90.00 },
  { nome: 'GIGLIO PER ASTA ORIFIAMMA', tipologia: 'Accessorio', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 32.00 },
  { nome: 'ORIFIAMMA DI GRUPPO', tipologia: 'Accessorio', branca: 'Esploratori', taglia: 'Taglia Unica', prezzo: 30.00 },
  { nome: 'ORIFIAMMA PER ALZABANDIERA', tipologia: 'Accessorio', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 30.00 },
  { nome: 'PATCH SCOUT D\'EUROPA blu', tipologia: 'Patch', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 4.00 },
  { nome: 'PORTACHIAVI SCOUT D\'EUROPA blu', tipologia: 'Portachiavi', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 5.00 },
  { nome: 'ROSARIO SCOUT', tipologia: 'Religioso', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 1.50 },
  { nome: 'STOLA BICOLORE', tipologia: 'Abbigliamento', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 80.00 },
  { nome: 'STOLA MONOCOLORE', tipologia: 'Abbigliamento', branca: 'Capi', taglia: 'Taglia Unica', prezzo: 40.00 },
  { nome: 'PIN COCCINELLA', tipologia: 'Pin', branca: 'Coccinelle', taglia: 'Taglia Unica', prezzo: 2.00 },
  { nome: 'PIN TESTA LUPO', tipologia: 'Pin', branca: 'Lupetti', taglia: 'Taglia Unica', prezzo: 2.00 },
];

async function seedDatabase() {
  let db;
  try {
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    console.log('🏗️  Ricreazione schema database...\n');
    
    // Drop tabelle vecchie
    await db.run('DROP TABLE IF EXISTS dettagli_prenotazioni');
    await db.run('DROP TABLE IF EXISTS prenotazioni');
    await db.run('DROP TABLE IF EXISTS prodotti');
    await db.run('DROP TABLE IF EXISTS configurazione');

    // Crea tabella prodotti
    await db.run(`
      CREATE TABLE prodotti (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipologia TEXT NOT NULL,
        branca TEXT NOT NULL,
        taglia TEXT,
        specialita TEXT,
        quantita_magazzino INTEGER,
        prezzo REAL NOT NULL,
        usato INTEGER DEFAULT 0,
        mostra_home INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(`
      CREATE TABLE prenotazioni (
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

    await db.run(`
      CREATE TABLE dettagli_prenotazioni (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prenotazione_id TEXT NOT NULL,
        prodotto_id INTEGER NOT NULL,
        quantita INTEGER NOT NULL,
        prezzo_unitario REAL NOT NULL,
        FOREIGN KEY (prenotazione_id) REFERENCES prenotazioni(id) ON DELETE CASCADE,
        FOREIGN KEY (prodotto_id) REFERENCES prodotti(id)
      )
    `);

    await db.run(`
      CREATE TABLE configurazione (
        chiave TEXT PRIMARY KEY,
        valore TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Schema creato\n');
    console.log('📥 Inserimento prodotti dal Listino 2025...');
    console.log(`📦 Totale: ${productos.length} prodotti\n`);
    
    for (const p of productos) {
      await db.run(
        `INSERT INTO prodotti (nome, tipologia, branca, taglia, quantita_magazzino, prezzo, usato) 
         VALUES (?, ?, ?, ?, NULL, ?, 0)`,
        [p.nome, p.tipologia, p.branca, p.taglia, p.prezzo]
      );
    }
    
    console.log(`✅ ${productos.length} prodotti inseriti!\n`);
    
    const branche = await db.all('SELECT branca, COUNT(*) as count FROM prodotti GROUP BY branca ORDER BY branca');
    console.log('📊 Prodotti per Branca:');
    branche.forEach(b => {
      console.log(`   ${b.branca.padEnd(20)} : ${String(b.count).padStart(3)} prodotti`);
    });
    
    const tipi = await db.all('SELECT tipologia, COUNT(*) as count FROM prodotti GROUP BY tipologia ORDER BY tipologia');
    console.log('\n📋 Prodotti per Tipologia:');
    tipi.forEach(t => {
      console.log(`   ${t.tipologia.padEnd(20)} : ${String(t.count).padStart(3)} prodotti`);
    });
    
    await db.close();
    
    console.log('\n✅ Seeding completato!\n');
    console.log('🎯 Tutti i prodotti:');
    console.log('   ✓ Quantità: ILLIMITATA (NULL)');
    console.log('   ✓ Taglia: Indicata nel catalogo');
    console.log('   ✓ Prezzo: Dal Listino 2025');
    console.log('   ✓ Usato: 0 (articoli nuovi)\n');
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    if (db) await db.close();
    process.exit(1);
  }
}

seedDatabase();
