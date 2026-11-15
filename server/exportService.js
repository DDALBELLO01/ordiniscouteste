/**
 * Export service per generare file di export (CSV, XLSX, ecc.)
 */
import XLSX from 'xlsx';

/**
 * Converte un valore per CSV con proper escaping
 */
function escapeCSVValue(value) {
  if (value === null || value === undefined) return '';
  const strValue = String(value).trim();
  if (strValue.includes('"') || strValue.includes(',') || strValue.includes('\n')) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }
  return strValue;
}

/**
 * Genera CSV dai dati materiale da acquistare
 * @param {Array} materials - Array di materiali da esportare
 * @param {string} filterView - Tipo di filtro applicato (tutti, da_acquistare, ecc.)
 * @param {Array} selectedColumns - Colonne selezionate da esportare
 * @returns {string} CSV content
 */
export function generateMaterialCSV(materials, filterView = 'tutti', selectedColumns = null) {
  if (!Array.isArray(materials) || materials.length === 0) {
    return generateCSVHeader();
  }

  // Mappa delle colonne disponibili
  const columnMap = {
    'nome': { header: 'NOME PRODOTTO', key: 'nome' },
    'tipologia': { header: 'TIPOLOGIA', key: 'tipologia' },
    'branca': { header: 'BRANCA', key: 'branca' },
    'taglia': { header: 'TAGLIA', key: 'taglia' },
    'richieste_totali': { header: 'TOTALE RICHIESTE', key: 'richieste_totali' },
    'da_acquistare': { header: 'DA ACQUISTARE', key: 'da_acquistare' },
    'da_magazzino': { header: 'IN MAGAZZINO', key: 'da_magazzino' },
    'gia_ordinati': { header: 'GIA\' ORDINATI', key: 'gia_ordinati' },
    'ricevuti': { header: 'RICEVUTI', key: 'ricevuti' },
    'non_disponibili': { header: 'NON DISPONIBILI', key: 'non_disponibili' },
    'non_acquistabili': { header: 'NON ACQUISTABILI', key: 'non_acquistabili' },
    'costo_da_acquistare': { header: 'COSTO (€)', key: 'costo_da_acquistare' },
    'destinazioni': { header: 'DESTINAZIONI', key: 'destinazioni' }
  };

  // Se non sono specificate colonne, usa tutte
  const columnsToExport = selectedColumns && selectedColumns.length > 0 
    ? selectedColumns 
    : Object.keys(columnMap);

  // Filtra le colonne disponibili
  const selectedColumnDefs = columnsToExport
    .filter(col => columnMap[col])
    .map(col => columnMap[col]);

  const headers = selectedColumnDefs.map(col => col.header);

  // Preparazione righe dati
  const rows = materials.map(material => 
    selectedColumnDefs.map(colDef => {
      if (colDef.key === 'taglia') {
        return escapeCSVValue(material[colDef.key] || '-');
      } else if (colDef.key === 'destinazioni') {
        return escapeCSVValue(generateDestinationsString(material.destinazioni || []));
      } else if (colDef.key === 'costo_da_acquistare') {
        return String((material[colDef.key] || 0).toFixed(2));
      } else {
        return String(material[colDef.key] || 0);
      }
    })
  );

  // Riga di totali
  const totals = selectedColumnDefs.map(colDef => {
    if (colDef.key === 'nome') {
      return escapeCSVValue('TOTALE');
    } else if (colDef.key === 'destinazioni') {
      return '';
    } else if (colDef.key === 'costo_da_acquistare') {
      return String((materials.reduce((sum, m) => sum + (m.costo_da_acquistare || 0), 0)).toFixed(2));
    } else if (['richieste_totali', 'da_acquistare', 'da_magazzino', 'gia_ordinati', 'ricevuti', 'non_disponibili', 'non_acquistabili'].includes(colDef.key)) {
      return String(materials.reduce((sum, m) => sum + (m[colDef.key] || 0), 0));
    }
    return '';
  });

  const csv = [
    headers.map(escapeCSVValue).join(','),
    ...rows.map(row => row.join(',')),
    totals.join(',')
  ].join('\n');

  return csv;
}

/**
 * Genera header CSV di base
 */
function generateCSVHeader() {
  const headers = [
    'NOME PRODOTTO',
    'TIPOLOGIA',
    'BRANCA',
    'TAGLIA',
    'TOTALE RICHIESTE',
    'DA ACQUISTARE',
    'IN MAGAZZINO',
    'GIA\' ORDINATI',
    'RICEVUTI',
    'NON DISPONIBILI',
    'NON ACQUISTABILI',
    'COSTO (€)',
    'DESTINAZIONI'
  ];
  return headers.map(escapeCSVValue).join(',');
}

/**
 * Genera stringa con i dettagli delle destinazioni
 */
function generateDestinationsString(destinazioni) {
  if (!Array.isArray(destinazioni) || destinazioni.length === 0) {
    return '-';
  }

  return destinazioni
    .map(d => {
      const name = d.nome_prenotante || d.genitore_di || 'Sconosciuto';
      const branch = d.branca_riferimento ? ` (${d.branca_riferimento})` : '';
      const qty = d.quantita ? ` x${d.quantita}` : '';
      return `${name}${branch}${qty}`;
    })
    .join('; ');
}

export function splitDistinctiveMaterials(materials) {
  return materials.flatMap(material => {
    if (!String(material.tipologia || '').toLowerCase().includes('distintiv')) return [material];

    const groups = new Map();
    for (const destination of material.destinazioni || []) {
      const description = String(destination.specialita || '').trim();
      if (!groups.has(description)) groups.set(description, []);
      groups.get(description).push(destination);
    }
    if (!groups.size || (groups.size === 1 && !groups.keys().next().value)) return [material];

    const purchasable = Number(material.usato) !== 1 && Number(material.non_a_catalogo_scouting) !== 1;
    return [...groups].map(([description, destinations]) => {
      const sum = (field, predicate = () => true) => destinations
        .filter(predicate)
        .reduce((total, destination) => total + Number(destination[field] || 0), 0);
      const daMagazzino = sum('da_magazzino');
      const mancanti = sum('mancanti');
      const daAcquistare = purchasable ? mancanti : 0;

      return {
        ...material,
        nome: description ? `${material.nome} - ${description}` : material.nome,
        richieste_totali: sum('quantita'),
        da_magazzino: daMagazzino,
        da_acquistare: daAcquistare,
        gia_ordinati: sum('quantita', destination => destination.stato === 'ordinato' ||
          (['prenotato', 'pagato'].includes(destination.stato) && Number(destination.acquistato) === 1)),
        ricevuti: sum('quantita', destination => destination.stato === 'ricevuto'),
        non_disponibili: sum('quantita', destination => destination.stato === 'non_disponibile'),
        non_acquistabili: purchasable ? 0 : mancanti,
        costo_da_acquistare: daAcquistare * Number(material.costo_acquisto || 0),
        destinazioni: destinations
      };
    });
  });
}

/**
 * Crea un filename per l'export
 */
export function generateExportFilename(filterView = 'tutti', format = 'csv') {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const filterStr = filterView === 'tutti' ? 'materiale' : `materiale-${filterView}`;
  const ext = format === 'xlsx' ? 'xlsx' : 'csv';
  return `${dateStr}_${timeStr}_${filterStr}.${ext}`;
}

/**
 * Genera file XLSX dai dati materiale da acquistare
 * @param {Array} materials - Array di materiali da esportare
 * @param {string} filterView - Tipo di filtro applicato (tutti, da_acquistare, ecc.)
 * @returns {Buffer} File XLSX come buffer
 */
export function generateMaterialXLSX(materials, filterView = 'tutti', selectedColumns = null) {
  const workbook = XLSX.utils.book_new();
  
  // Mappa delle colonne disponibili
  const columnMap = {
    'nome': { header: 'NOME PRODOTTO', width: 30, key: 'nome' },
    'tipologia': { header: 'TIPOLOGIA', width: 15, key: 'tipologia' },
    'branca': { header: 'BRANCA', width: 15, key: 'branca' },
    'taglia': { header: 'TAGLIA', width: 15, key: 'taglia' },
    'richieste_totali': { header: 'TOTALE RICHIESTE', width: 12, key: 'richieste_totali', isNumeric: true },
    'da_acquistare': { header: 'DA ACQUISTARE', width: 12, key: 'da_acquistare', isNumeric: true },
    'da_magazzino': { header: 'IN MAGAZZINO', width: 12, key: 'da_magazzino', isNumeric: true },
    'gia_ordinati': { header: 'GIA\' ORDINATI', width: 12, key: 'gia_ordinati', isNumeric: true },
    'ricevuti': { header: 'RICEVUTI', width: 12, key: 'ricevuti', isNumeric: true },
    'non_disponibili': { header: 'NON DISPONIBILI', width: 14, key: 'non_disponibili', isNumeric: true },
    'non_acquistabili': { header: 'NON ACQUISTABILI', width: 14, key: 'non_acquistabili', isNumeric: true },
    'costo_da_acquistare': { header: 'COSTO (€)', width: 12, key: 'costo_da_acquistare', isNumeric: true },
    'destinazioni': { header: 'DESTINAZIONI', width: 40, key: 'destinazioni' }
  };

  // Se non sono specificate colonne, usa tutte
  const columnsToExport = selectedColumns && selectedColumns.length > 0 
    ? selectedColumns 
    : Object.keys(columnMap);

  // Filtra le colonne disponibili
  const selectedColumnDefs = columnsToExport
    .filter(col => columnMap[col])
    .map(col => columnMap[col]);

  const headers = selectedColumnDefs.map(col => col.header);

  // Preparazione righe dati
  const rows = materials.map(material => 
    selectedColumnDefs.map(colDef => {
      if (colDef.key === 'taglia') {
        return material[colDef.key] || '-';
      } else if (colDef.key === 'destinazioni') {
        return generateDestinationsString(material.destinazioni || []);
      } else if (colDef.key === 'costo_da_acquistare') {
        return (material[colDef.key] || 0).toFixed(2);
      }
      return material[colDef.key] || 0;
    })
  );

  // Riga di totali
  const totals = selectedColumnDefs.map(colDef => {
    if (colDef.key === 'nome') {
      return 'TOTALE';
    } else if (colDef.key === 'destinazioni') {
      return '';
    } else if (colDef.key === 'costo_da_acquistare') {
      return (materials.reduce((sum, m) => sum + (m.costo_da_acquistare || 0), 0)).toFixed(2);
    } else if (colDef.isNumeric) {
      return materials.reduce((sum, m) => sum + (m[colDef.key] || 0), 0);
    }
    return '';
  });

  // Crea il worksheet
  const wsData = [headers, ...rows, totals];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Formattazione colonne
  worksheet['!cols'] = selectedColumnDefs.map(col => ({ wch: col.width }));

  // Stile header (riga 1)
  for (let i = 0; i < headers.length; i++) {
    const cellRef = XLSX.utils.encode_col(i) + '1';
    if (!worksheet[cellRef]) continue;
    worksheet[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '4472C4' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    };
  }

  // Stile riga totali (ultima riga)
  const totalRowNum = wsData.length;
  for (let i = 0; i < headers.length; i++) {
    const cellRef = XLSX.utils.encode_col(i) + totalRowNum;
    if (!worksheet[cellRef]) continue;
    worksheet[cellRef].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'E2EFDA' } },
      border: { top: { style: 'thin' } }
    };
  }

  // Stile numerico per le colonne numeriche
  for (let row = 2; row < totalRowNum; row++) {
    selectedColumnDefs.forEach((colDef, colIndex) => {
      if (colDef.isNumeric) {
        const cellRef = XLSX.utils.encode_col(colIndex) + row;
        if (worksheet[cellRef]) {
          worksheet[cellRef].t = 'n';
        }
      }
    });
  }

  // Aggiungi il worksheet al workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Materiale da Acquistare');

  // Genera il file come buffer
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}
