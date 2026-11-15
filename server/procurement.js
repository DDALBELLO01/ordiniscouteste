import { withTransaction } from './database.js';
import { updateItemStates } from './bookingWorkflow.js';

const pending = row => ['prenotato', 'pagato'].includes(row.stato) && Number(row.acquistato) !== 1;
const ordered = row => row.stato === 'ordinato' ||
  (['prenotato', 'pagato'].includes(row.stato) && Number(row.acquistato) === 1);

async function materialTransaction(operation) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTransaction(async db => {
        if (db.pool) await db.run('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        return operation(db);
      });
    } catch (error) {
      if (attempt >= 2 || !['40001', '40P01'].includes(error.code)) throw error;
    }
  }
}

async function loadMaterial(db, productIds, lock = false) {
  const params = productIds || [];
  const scope = productIds ? `AND dp.prodotto_id IN (${productIds.map(() => '?').join(',')})` : '';
  if (lock && db.pool) {
    await db.all(`SELECT id FROM prenotazioni WHERE id IN (
      SELECT dp.prenotazione_id FROM dettagli_prenotazioni dp WHERE 1 = 1 ${scope}
    ) ORDER BY id FOR UPDATE`, params);
  }
    const rows = await db.all(`SELECT dp.*, pr.data_prenotazione, pr.nome_prenotante,
      pr.genitore_di, pr.branca_riferimento
    FROM dettagli_prenotazioni dp JOIN prenotazioni pr ON pr.id = dp.prenotazione_id
    WHERE COALESCE(pr.archiviata, 0) = 0 ${scope}
    ORDER BY pr.data_prenotazione, pr.id, dp.id ${lock && db.pool ? 'FOR UPDATE OF dp' : ''}`, params);
  const products = await db.all(`SELECT * FROM prodotti
    ${productIds ? `WHERE id IN (${productIds.map(() => '?').join(',')})` : ''}
    ORDER BY id ${lock && db.pool ? 'FOR UPDATE' : ''}`, params);
  return products.map(product => {
    const items = rows.filter(row => row.prodotto_id === product.id);
    const waiting = items.filter(pending);
    const requested = waiting.reduce((sum, row) => sum + Number(row.quantita), 0);
    // Stock is already net of reservations: add the waiting demand back only once.
    let available = product.quantita_magazzino == null ? 0
      : Math.max(0, Number(product.quantita_magazzino) + requested);
    const allocations = waiting.map(row => {
      const magazzino = Math.min(available, Number(row.quantita));
      available -= magazzino;
      return { ...row, magazzino, mancante: Number(row.quantita) - magazzino };
    });
    const covered = allocations.reduce((sum, row) => sum + row.magazzino, 0);
    const missing = requested - covered;
    const purchasable = Number(product.usato) !== 1 && Number(product.non_a_catalogo_scouting) !== 1;
    return {
      ...product,
      quantita_prenotata: requested,
      richieste_totali: items.reduce((sum, row) => sum + Number(row.quantita), 0),
      da_magazzino: covered,
      da_acquistare: purchasable ? missing : 0,
      non_acquistabili: purchasable ? 0 : missing,
      gia_ordinati: items.filter(ordered).reduce((sum, row) => sum + Number(row.quantita), 0),
      ricevuti: items.filter(row => row.stato === 'ricevuto').reduce((sum, row) => sum + Number(row.quantita), 0),
      non_disponibili: items.filter(row => row.stato === 'non_disponibile').reduce((sum, row) => sum + Number(row.quantita), 0),
      costo_da_acquistare: purchasable ? missing * Number(product.costo_acquisto) : 0,
      destinazioni: items.map(row => {
        const allocation = allocations.find(item => item.id === row.id);
        return { id: row.id, prenotazione_id: row.prenotazione_id, nome_prenotante: row.nome_prenotante,
          genitore_di: row.genitore_di, branca_riferimento: row.branca_riferimento, quantita: Number(row.quantita),
          specialita: row.specialita, acquistato: Number(row.acquistato || 0),
          stato: row.stato, da_magazzino: allocation?.magazzino || 0,
          mancanti: allocation?.mancante || 0 };
      }),
      allocations,
      orderedItems: items.filter(ordered)
    };
  });
}

export async function getMaterialOverview() {
  return materialTransaction(async db => (await loadMaterial(db))
    .filter(product => product.richieste_totali > 0)
    .map(({ allocations, orderedItems, ...product }) => product));
}

export async function processMaterial(user, productIds, action) {
  if (!Array.isArray(productIds) || !productIds.length || productIds.length > 500 ||
      productIds.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      !['acquista', 'magazzino', 'ricevi'].includes(action)) {
    const error = new Error('Seleziona da 1 a 500 articoli validi e un’azione valida');
    error.status = 400;
    throw error;
  }
  return materialTransaction(async db => {
    const ids = [...new Set(productIds)];
    const products = await loadMaterial(db, ids, true);
    if (products.length !== ids.length) {
      const error = new Error('Uno o più articoli non esistono più');
      error.status = 404;
      throw error;
    }
    const selected = [];
    let pieces = 0;
    for (const product of products) {
      if (action === 'ricevi') {
        selected.push(...product.orderedItems.map(row => row.id));
        pieces += product.gia_ordinati;
        continue;
      }
      if (action === 'acquista' && !product.da_acquistare) continue;
      for (const row of product.allocations) {
        const quantity = action === 'magazzino' ? row.magazzino : row.mancante;
        if (!quantity) continue;
        if (quantity < Number(row.quantita)) {
          await db.run(`INSERT INTO dettagli_prenotazioni
            (prenotazione_id, prodotto_id, quantita, prezzo_unitario, specialita, acquistato, stato, pagamento_registrato)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [row.prenotazione_id, row.prodotto_id,
            Number(row.quantita) - quantity, row.prezzo_unitario, row.specialita,
            row.acquistato, row.stato, row.pagamento_registrato]);
          await db.run('UPDATE dettagli_prenotazioni SET quantita = ? WHERE id = ?', [quantity, row.id]);
        }
        selected.push(row.id);
        pieces += quantity;
      }
    }
    let emailInCoda = 0;
    if (selected.length) {
      const result = await updateItemStates(user, selected, action === 'acquista' ? 'ordinato' : 'ricevuto', { unlimited: true });
      emailInCoda = result.emailInCoda;
    }
    return { acquistati: action === 'acquista' ? selected.length : 0,
      aggiornati: selected.length, pezzi: pieces, emailInCoda };
  });
}
