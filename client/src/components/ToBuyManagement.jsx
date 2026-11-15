import { Fragment, useState, useEffect } from 'react'
import axios from 'axios'
import { useAppDialog } from './AppDialog'
import '../styles/components.css'

const COLUMNS = [
  { key: 'nome', label: 'Nome Prodotto', default: true },
  { key: 'tipologia', label: 'Tipologia', default: true },
  { key: 'branca', label: 'Branca', default: true },
  { key: 'taglia', label: 'Taglia', default: true },
  { key: 'richieste_totali', label: 'Totale Richieste', default: true },
  { key: 'da_acquistare', label: 'Da Acquistare', default: true },
  { key: 'da_magazzino', label: 'In Magazzino', default: true },
  { key: 'gia_ordinati', label: 'Già Ordinati', default: true },
  { key: 'ricevuti', label: 'Ricevuti', default: true },
  { key: 'non_disponibili', label: 'Non Disponibili', default: true },
  { key: 'non_acquistabili', label: 'Non Acquistabili', default: true },
  { key: 'costo_da_acquistare', label: 'Costo (€)', default: true },
  { key: 'destinazioni', label: 'Destinazioni', default: true }
]

export default function ToBuyManagement() {
  const [itemsToBuy, setItemsToBuy] = useState([])
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [filterView, setFilterView] = useState('tutti')
  const [sizeGuideUrl, setSizeGuideUrl] = useState(null)
  const [error, setError] = useState('')
  const [expandedIds, setExpandedIds] = useState([])
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState(COLUMNS.map(c => c.key))
  const { showMessage, showConfirm, dialogElement } = useAppDialog()

  useEffect(() => {
    fetchItemsToBuy()
  }, [])

  const fetchItemsToBuy = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await axios.get('/api/admin/da-acquistare')
      setItemsToBuy(response.data)
      setSelectedIds([])
    } catch (error) {
      console.error('Errore caricamento lista da acquistare:', error)
      setError(error.response?.data?.error || 'Errore caricamento materiale. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  const sizeSortKey = (value) => {
    const text = String(value || '').trim().toUpperCase()
    const ageMatch = text.match(/(\d+(?:[.,]\d+)?).*ANNI?/)
    if (ageMatch) return { group: 0, value: Number(ageMatch[1].replace(',', '.')), text }

    const numericMatch = text.match(/\d+(?:[.,]\d+)?/)
    if (numericMatch) return { group: 2, value: Number(numericMatch[0].replace(',', '.')), text }

    const sizeOrder = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
    const sizeIndex = sizeOrder.findIndex(size => text === size || text.startsWith(`${size}/`) || text.startsWith(`${size}-`))
    return { group: 1, value: sizeIndex >= 0 ? sizeIndex : sizeOrder.length, text }
  }

  const sortedItems = itemsToBuy.filter(item => filterView === 'tutti' ||
    (filterView === 'bloccati' ? item.non_acquistabili > 0 : item[filterView] > 0)).sort((first, second) => {
    const nameOrder = first.nome.localeCompare(second.nome, 'it')
    if (nameOrder) return nameOrder
    const firstSize = sizeSortKey(first.taglia)
    const secondSize = sizeSortKey(second.taglia)
    if (firstSize.group !== secondSize.group) return firstSize.group - secondSize.group
    if (firstSize.value !== secondSize.value) return firstSize.value - secondSize.value
    return firstSize.text.localeCompare(secondSize.text, 'it', { numeric: true })
  })

  const toggleSelected = (productId) => {
    setSelectedIds(current => current.includes(productId)
      ? current.filter(id => id !== productId)
      : [...current, productId]
    )
  }

  const toggleAll = () => {
    setSelectedIds(current => current.length === sortedItems.length ? [] : sortedItems.map(item => item.id))
  }

  const sum = (items, field) => items.reduce((total, item) => total + Number(item[field]), 0)
  const selected = sortedItems.filter(item => selectedIds.includes(item.id))
  
  const handleExportClick = () => {
    setShowExportDialog(true)
  }

  const handleExportConfirm = async () => {
    setShowExportDialog(false)
    try {
      const response = await axios.post('/api/admin/da-acquistare/export/xlsx', { 
        filterView,
        columns: selectedColumns 
      }, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const filename = response.headers['content-disposition']?.split('filename="')[1]?.split('"')[0] || 'materiale.xlsx'
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.parentElement.removeChild(link)
      window.URL.revokeObjectURL(url)
      showMessage(`Esportati ${sortedItems.length} articoli in Excel`, 'Export completato')
    } catch (error) {
      console.error('Errore export materiale:', error)
      showMessage(error.response?.data?.error || 'Errore export materiale', 'Errore')
    }
  }

  const toggleColumn = (columnKey) => {
    setSelectedColumns(current => 
      current.includes(columnKey)
        ? current.filter(c => c !== columnKey)
        : [...current, columnKey]
    )
  }

  const toggleAllColumns = () => {
    if (selectedColumns.length === COLUMNS.length) {
      setSelectedColumns([])
    } else {
      setSelectedColumns(COLUMNS.map(c => c.key))
    }
  }

  const handleAction = async (action, field, label) => {
    const eligible = selected.filter(item => item[field] > 0)
    if (!eligible.length) return
    const description = action === 'acquista'
      ? 'Saranno ordinati solo i mancanti, lasciando ai clienti più vecchi i pezzi già presenti in magazzino.'
      : 'I pezzi saranno segnati Ricevuti e verrà accodata la consueta email ai clienti.'
    if (!await showConfirm(`${label}: ${sum(eligible, field)} pezzi. ${description}`, 'Conferma gestione materiale')) return
    try {
      setPurchasing(true)
      const response = await axios.post(`/api/admin/da-acquistare/${action}`, { productIds: eligible.map(item => item.id) })
      await fetchItemsToBuy()
      showMessage(`${response.data.pezzi} pezzi aggiornati. ${response.data.emailInCoda} notifiche in coda.`, 'Operazione completata')
    } catch (error) {
      console.error('Errore gestione materiale:', error)
      showMessage(error.response?.data?.error || 'Errore gestione materiale', 'Errore')
    } finally {
      setPurchasing(false)
    }
  }

  return (
    <div className="to-buy-management">
      {dialogElement}
      <div className="management-header">
        <h3>Materiale prenotato e da acquistare</h3>
        <div className="to-buy-filter">
          <label htmlFor="to-buy-view">Filtra materiale</label>
          <select id="to-buy-view" value={filterView} disabled={purchasing || loading} onChange={(e) => { setFilterView(e.target.value); setSelectedIds([]) }}>
            <option value="tutti">Tutto il materiale richiesto</option>
            <option value="da_magazzino">Disponibile da magazzino</option>
            <option value="da_acquistare">Da ordinare al fornitore</option>
            <option value="gia_ordinati">Ordinato, in attesa di arrivo</option>
            <option value="ricevuti">Già ricevuto</option>
            <option value="bloccati">Mancanti non acquistabili</option>
          </select>
        </div>
      </div>

      {loading && <div className="loading">Caricamento materiale...</div>}
      {error && <div role="alert" className="tobuy-info-banner">{error} <button type="button" className="btn-secondary" onClick={fetchItemsToBuy}>Riprova</button></div>}
      <div className="material-summary" aria-label="Riepilogo materiale">
        <span>Da magazzino <strong>{sum(itemsToBuy, 'da_magazzino')}</strong></span>
        <span>Da ordinare <strong>{sum(itemsToBuy, 'da_acquistare')}</strong></span>
        <span>In arrivo <strong>{sum(itemsToBuy, 'gia_ordinati')}</strong></span>
        <span>Costo mancanti <strong>€ {sum(itemsToBuy, 'costo_da_acquistare').toFixed(2)}</strong></span>
      </div>
      <div className="to-buy-actions material-actions">
        <span>{selectedIds.length} articoli selezionati</span>
        <button type="button" className="btn-secondary" onClick={() => handleAction('magazzino', 'da_magazzino', 'Prepara da magazzino')} disabled={purchasing || loading || !!error || !sum(selected, 'da_magazzino')}>Prepara da magazzino</button>
        <button type="button" className="btn-primary" onClick={() => handleAction('acquista', 'da_acquistare', 'Ordina mancanti')} disabled={purchasing || loading || !!error || !sum(selected, 'da_acquistare')}>Ordina mancanti</button>
        <button type="button" className="btn-secondary" onClick={() => handleAction('ricevi', 'gia_ordinati', 'Registra arrivo fornitore')} disabled={purchasing || loading || !!error || !sum(selected, 'gia_ordinati')}>Registra arrivo fornitore</button>
        <button type="button" className="btn-secondary" onClick={handleExportClick} disabled={purchasing || loading || !!error || sortedItems.length === 0} title="Esporta in formato Excel">📊 Esporta Excel</button>
        <button type="button" className="btn-secondary" onClick={fetchItemsToBuy} disabled={purchasing || loading}>Aggiorna</button>
      </div>

      <div className="tobuy-info-banner">
        <p style={{ margin: 0 }}>
          Il magazzino copre prima le prenotazioni più vecchie, anche non pagate.
          Le righe vengono divise se solo una parte è disponibile. Giacenza vuota = tutto da comprare.
          Usato e fuori catalogo sono visibili, ma non acquistabili.
          “Prepara da magazzino” segna i pezzi Ricevuti e avvisa i clienti.
        </p>
      </div>

      <div className="products-table">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={sortedItems.length > 0 && selectedIds.length === sortedItems.length} disabled={purchasing || loading || !!error} onChange={toggleAll} aria-label="Seleziona tutti gli articoli" /></th>
              <th>Nome Articolo</th><th>Tipologia</th><th>Branca</th><th>Taglia</th>
              <th>Richiesti</th><th>Da magazzino</th><th>Da ordinare</th><th>In arrivo</th><th>Ricevuti</th>
              <th>Non disponibili / non acquistabili</th><th>Costo mancanti</th><th>Dettagli</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map(product => (
              <Fragment key={product.id}>
              <tr>
                <td><input type="checkbox" checked={selectedIds.includes(product.id)} disabled={purchasing || loading || !!error} onChange={() => toggleSelected(product.id)} aria-label={`Seleziona ${product.nome}`} /></td>
                <td>
                  <strong>{product.nome}</strong>
                  {(!!product.usato || !!product.non_a_catalogo_scouting) && <small className="material-note">Solo magazzino</small>}
                  {product.quantita_magazzino == null && <small className="material-note">Giacenza non censita</small>}
                </td>
                <td>{product.tipologia}</td>
                <td>{product.branca}</td>
                <td>{product.taglia || 'Taglia unica'}</td>
                <td>{product.richieste_totali}</td>
                <td>{product.da_magazzino}</td>
                <td>{product.da_acquistare}</td>
                <td>{product.gia_ordinati}</td>
                <td>{product.ricevuti}</td>
                <td>{product.non_disponibili + product.non_acquistabili}</td>
                <td>€ {Number(product.costo_da_acquistare).toFixed(2)}<small className="material-note">€ {Number(product.costo_acquisto).toFixed(2)} / pezzo</small></td>
                <td>
                  <button type="button" className="btn-small btn-secondary" aria-expanded={expandedIds.includes(product.id)} onClick={() => setExpandedIds(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])}>Prenotazioni</button>
                  {product.guida_taglie_url ? (
                    <button type="button" className="btn-small btn-secondary" onClick={() => setSizeGuideUrl(product.guida_taglie_url)}>
                      Apri guida
                    </button>
                  ) : null}
                </td>
              </tr>
              {expandedIds.includes(product.id) && <tr><td colSpan="13">
                <table aria-label={`Prenotazioni ${product.nome}`}>
                  <thead><tr><th>Cliente</th><th>Branca</th><th>Quantità</th><th>Da magazzino</th><th>Mancanti</th><th>Stato</th></tr></thead>
                  <tbody>{product.destinazioni.map(item => <tr key={item.id}>
                    <td>{item.nome_prenotante}{item.genitore_di && <small className="material-note">Genitore di: {item.genitore_di}</small>}</td><td>{item.branca_riferimento}</td><td>{item.quantita}</td>
                    <td>{item.da_magazzino}</td><td>{item.mancanti}</td><td>{item.stato.replace('_', ' ')}</td>
                  </tr>)}</tbody>
                </table>
              </td></tr>}
              </Fragment>
            ))}
            {!loading && !error && sortedItems.length === 0 && (
              <tr><td colSpan="13" style={{ textAlign: 'center', padding: '20px' }}>Nessun materiale richiesto.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {sizeGuideUrl && (
        <div className="size-guide-overlay" role="dialog" aria-modal="true" aria-label="Guida alle taglie" onClick={() => setSizeGuideUrl(null)}>
          <button type="button" className="size-guide-close" onClick={() => setSizeGuideUrl(null)} aria-label="Chiudi guida taglie">×</button>
          <img src={sizeGuideUrl} alt="Guida alle taglie" className="size-guide-image" onClick={(event) => event.stopPropagation()} />
        </div>
      )}

      {showExportDialog && (
        <div className="export-dialog-overlay" role="dialog" aria-modal="true" aria-label="Seleziona colonne da esportare" onClick={() => setShowExportDialog(false)}>
          <div className="export-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="export-dialog-header">
              <h3>Seleziona colonne da esportare</h3>
              <button type="button" className="export-dialog-close" onClick={() => setShowExportDialog(false)} aria-label="Chiudi">×</button>
            </div>
            <div className="export-dialog-content">
              <div className="export-columns-list">
                <label className="export-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={selectedColumns.length === COLUMNS.length}
                    indeterminate={selectedColumns.length > 0 && selectedColumns.length < COLUMNS.length}
                    onChange={toggleAllColumns}
                  />
                  <span><strong>Seleziona tutto</strong></span>
                </label>
                {COLUMNS.map(column => (
                  <label key={column.key} className="export-checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.includes(column.key)}
                      onChange={() => toggleColumn(column.key)}
                    />
                    <span>{column.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="export-dialog-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowExportDialog(false)}>Annulla</button>
              <button type="button" className="btn-primary" onClick={handleExportConfirm} disabled={selectedColumns.length === 0}>Scarica Excel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
