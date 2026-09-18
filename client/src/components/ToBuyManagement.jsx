import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/components.css'

export default function ToBuyManagement() {
  const [itemsToBuy, setItemsToBuy] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterView, setFilterView] = useState('richiesti')

  useEffect(() => {
    fetchItemsToBuy(filterView)
  }, [filterView])

  const fetchItemsToBuy = async (viewMode = filterView) => {
    try {
      setLoading(true)
      const soloRichiesti = viewMode === 'richiesti'
      const response = await axios.get(`/api/admin/da-acquistare?soloRichiesti=${soloRichiesti}`)
      setItemsToBuy(response.data)
    } catch (error) {
      console.error('Errore caricamento lista da acquistare:', error)
    } finally {
      setLoading(false)
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
              <th>Nome Articolo</th><th>Tipologia</th><th>Branca</th><th>Taglia</th>
              <th>Prezzo</th><th>Giacenza Attuale</th><th>Richieste Attive</th><th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {itemsToBuy.map(product => (
              <tr key={product.id}>
                <td><strong>{product.nome}</strong></td>
                <td>{product.tipologia}</td>
                <td>{product.branca}</td>
                <td>{product.taglia || 'Taglia unica'}</td>
                <td>€ {Number(product.prezzo || 0).toFixed(2)}</td>
                <td>{product.quantita_magazzino ?? 0}</td>
                <td>{product.quantita_prenotata || 0}</td>
                <td><span className="stock-badge stock-buy">Da acquistare</span></td>
              </tr>
            ))}
            {itemsToBuy.length === 0 && (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>Nessun articolo nuovo da acquistare.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
