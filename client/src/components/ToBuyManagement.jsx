import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/components.css'

export default function ToBuyManagement() {
  const [itemsToBuy, setItemsToBuy] = useState([])
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [filterView, setFilterView] = useState('richiesti')
  const [sizeGuideUrl, setSizeGuideUrl] = useState(null)

  useEffect(() => {
    fetchItemsToBuy(filterView)
  }, [filterView])

  const fetchItemsToBuy = async (viewMode = filterView) => {
    try {
      setLoading(true)
      const soloRichiesti = viewMode === 'richiesti'
      const response = await axios.get(`/api/admin/da-acquistare?soloRichiesti=${soloRichiesti}`)
      setItemsToBuy(response.data)
      setSelectedIds([])
    } catch (error) {
      console.error('Errore caricamento lista da acquistare:', error)
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

  const sortedItems = [...itemsToBuy].sort((first, second) => {
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

  const handlePurchase = async () => {
    if (selectedIds.length === 0) return

    try {
      setPurchasing(true)
      await axios.post('/api/admin/da-acquistare/acquista', { productIds: selectedIds })
      await fetchItemsToBuy(filterView)
    } catch (error) {
      console.error('Errore registrazione acquisto:', error)
    } finally {
      setPurchasing(false)
    }
  }

  if (loading) return <div className="loading">Caricamento lista da acquistare...</div>

  return (
    <div className="to-buy-management">
      <div className="management-header">
        <h3>Lista Articoli Nuovi da Acquistare ({itemsToBuy.length})</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="to-buy-view" style={{ fontSize: '13px', fontWeight: 'bold', color: '#2d3748' }}>Filtro vista:</label>
          <select id="to-buy-view" value={filterView} onChange={(e) => setFilterView(e.target.value)} style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e0', background: 'white' }}>
            <option value="richiesti">Solo richiesti dai clienti</option>
            <option value="tutti_esauriti">Tutti con giacenza 0</option>
          </select>
        </div>
      </div>

      <div className="to-buy-actions">
        <span>{selectedIds.length} articoli selezionati</span>
        <button type="button" className="btn-primary" onClick={handlePurchase} disabled={purchasing || selectedIds.length === 0}>
          {purchasing ? 'Aggiornamento...' : 'Segna come acquistati'}
        </button>
      </div>

      <div className="tobuy-info-banner">
        <p style={{ margin: 0 }}>
          {filterView === 'richiesti'
            ? 'Sono mostrati gli articoli con richieste attive nelle prenotazioni dei clienti.'
            : 'Sono mostrati tutti gli articoli nuovi con giacenza esaurita.'}
        </p>
      </div>

      <div className="products-table">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={sortedItems.length > 0 && selectedIds.length === sortedItems.length} onChange={toggleAll} aria-label="Seleziona tutti gli articoli" /></th>
              <th>Nome Articolo</th><th>Tipologia</th><th>Branca</th><th>Taglia</th>
              <th>Prezzo</th><th>Giacenza Attuale</th><th>Richieste Attive</th><th>Guida taglie</th><th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map(product => (
              <tr key={product.id}>
                <td><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} aria-label={`Seleziona ${product.nome}`} /></td>
                <td><strong>{product.nome}</strong></td>
                <td>{product.tipologia}</td>
                <td>{product.branca}</td>
                <td>{product.taglia || 'Taglia unica'}</td>
                <td>€ {Number(product.prezzo || 0).toFixed(2)}</td>
                <td>{product.quantita_magazzino ?? 0}</td>
                <td>{product.quantita_prenotata || 0}</td>
                <td>
                  {product.guida_taglie_url ? (
                    <button type="button" className="btn-small btn-secondary" onClick={() => setSizeGuideUrl(product.guida_taglie_url)}>
                      Apri guida
                    </button>
                  ) : '-'}
                </td>
                <td><span className="stock-badge stock-buy">Da acquistare</span></td>
              </tr>
            ))}
            {itemsToBuy.length === 0 && (
              <tr><td colSpan="10" style={{ textAlign: 'center', padding: '20px' }}>Nessun articolo nuovo da acquistare.</td></tr>
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
    </div>
  )
}
