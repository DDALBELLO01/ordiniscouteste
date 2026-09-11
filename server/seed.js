import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database', 'ordini.db');

// Dati di esempio per popolare il database
const sampleProducts = [
  // Castorini (4-6 anni)
  { nome: 'Fazzolettone Castorini', tipologia: 'Abbigliamento', branca: 'Castorini', quantita_magazzino: 50, prezzo: 8.50 },
  { nome: 'Insegna Ramo Castorini', tipologia: 'Decorazione', branca: 'Castorini', quantita_magazzino: 30, prezzo: 3.00 },
  
  // Lupetti (7-10 anni)
  { nome: 'Fazzolettone Lupetti', tipologia: 'Abbigliamento', branca: 'Lupetti', quantita_magazzino: 60, prezzo: 9.00 },
  { nome: 'Giallo Lupetto', tipologia: 'Decorazione', branca: 'Lupetti', quantita_magazzino: 80, prezzo: 2.50 },
  { nome: 'Coccarda Lupetti', tipologia: 'Decorazione', branca: 'Lupetti', quantita_magazzino: 100, prezzo: 1.50 },
  
  // Esploratori (11-14 anni)
  { nome: 'Fazzolettone Esploratori', tipologia: 'Abbigliamento', branca: 'Esploratori', quantita_magazzino: 70, prezzo: 10.00 },
  { nome: 'Distintivo Specializzazione', tipologia: 'Decorazione', branca: 'Esploratori', quantita_magazzino: 150, prezzo: 5.00 },
  { nome: 'Quaderno di Volo', tipologia: 'Materiale Didattico', branca: 'Esploratori', quantita_magazzino: 40, prezzo: 3.50 },
  
  // Guide (15-17 anni)
  { nome: 'Fazzolettone Guide', tipologia: 'Abbigliamento', branca: 'Guide', quantita_magazzino: 50, prezzo: 11.00 },
  { nome: 'Simbolo Sqaudra', tipologia: 'Decorazione', branca: 'Guide', quantita_magazzino: 40, prezzo: 6.00 },
  { nome: 'Diario Guida', tipologia: 'Materiale Didattico', branca: 'Guide', quantita_magazzino: 35, prezzo: 4.50 },
  
  // Rover (18-20 anni)
  { nome: 'Fazzolettone Rover', tipologia: 'Abbigliamento', branca: 'Rover', quantita_magazzino: 40, prezzo: 12.00 },
  { nome: 'Distintivo Specialità Rover', tipologia: 'Decorazione', branca: 'Rover', quantita_magazzino: 60, prezzo: 7.00 },
  { nome: 'Manuale Rover', tipologia: 'Materiale Didattico', branca: 'Rover', quantita_magazzino: 25, prezzo: 8.00 },
  
  // Capi (Comuni)
  { nome: 'Uniformina Capo', tipologia: 'Abbigliamento', branca: 'Capi', quantita_magazzino: 30, prezzo: 15.00 },
  { nome: 'Fazzolettone Capo', tipologia: 'Abbigliamento', branca: 'Capi', quantita_magazzino: 25, prezzo: 14.00 },
  { nome: 'Insegna Capo', tipologia: 'Decorazione', branca: 'Capi', quantita_magazzino: 20, prezzo: 5.00 },
  
  // Materiale Generico
  { nome: 'Quaderno Scout', tipologia: 'Materiale Didattico', branca: 'Castorini', quantita_magazzino: 100, prezzo: 2.50 },
  { nome: 'Penna Scout', tipologia: 'Accessori', branca: 'Lupetti', quantita_magazzino: 200, prezzo: 0.80 },
  { nome: 'Zaino Scout', tipologia: 'Accessori', branca: 'Esploratori', quantita_magazzino: 45, prezzo: 35.00 },
];

async function seedDatabase() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ Errore connessione database:', err);
      process.exit(1);
    }
  });

  try {
    // Cancellare dati esistenti (opzionale)
    db.run('DELETE FROM prodotti');
    
    // Inserire dati di esempio
    console.log('📥 Inserimento dati di esempio...');
    
    for (const product of sampleProducts) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO prodotti (nome, tipologia, branca, quantita_magazzino, prezzo) 
           VALUES (?, ?, ?, ?, ?)`,
          [product.nome, product.tipologia, product.branca, product.quantita_magazzino, product.prezzo],
          function(err) {
            if (err) reject(err);
            resolve();
          }
        );
      });
    }
    
    console.log(`✅ ${sampleProducts.length} prodotti inseriti con successo!`);
    
    // Mostrare un riepilogo
    db.all('SELECT branca, COUNT(*) as count FROM prodotti GROUP BY branca', (err, rows) => {
      if (err) {
        console.error('Errore query:', err);
      } else {
        console.log('\n📊 Prodotti per Branca:');
        rows.forEach(row => {
          console.log(`   ${row.branca}: ${row.count} prodotti`);
        });
      }
      
      db.close(() => {
        console.log('\n✅ Seeding completato!');
      });
    });
  } catch (error) {
    console.error('❌ Errore durante il seeding:', error);
    db.close();
    process.exit(1);
  }
}

// Eseguire il seeding
seedDatabase();
