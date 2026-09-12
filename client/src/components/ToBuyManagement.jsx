import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/components.css'

export default function ToBuyManagement() {
  const [itemsToBuy, setItemsToBuy] = useState([])
  const [loading, setLoading] = useState(true)
  const [ordering, setOrdering] = useState(false)
  const [curlPromptOpen, setCurlPromptOpen] = useState(false)
  const [curlText, setCurlText] = useState('')

  useEffect(() => {
    fetchItemsToBuy()
  }, [])

  const fetchItemsToBuy = async () => {
    try {
      const response = await axios.get('/api/admin/da-acquistare')
      setItemsToBuy(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Errore caricamento lista da acquistare:', error)
      setLoading(false)
    }
  }

  const handleOrderAllScoutingFse = async () => {
    if (itemsToBuy.length === 0) {
      alert('Nessun articolo nuovo da acquistare al momento!')
      return
    }

    setOrdering(true)
    try {
      const response = await axios.post('/api/admin/scouting-fse/ordina-tutti', {
        items: itemsToBuy,
        cUrlConfig: curlText ? { rawCurl: curlText, url: 'https://www.scoutingfse.it/api' } : null
      })

      if (response.data.requiresConfig) {
        setCurlPromptOpen(true)
      } else {
        alert('🚀 ' + response.data.message)
      }
    } catch (error) {
      console.error('Errore invio ordine Scouting FSE:', error)
      alert('Errore: ' + (error.response?.data?.error || error.message))
    } finally {
      setOrdering(false)
    }
  }

  if (loading) {
    return <div className="loading">Caricamento lista da acquistare...</div>
  }

  return (
    <div className="to-buy-management">
      <div className="management-header">
        <h3>🛒 Lista Articoli Nuovi da Acquistare ({itemsToBuy.length})</h3>
        <button
          type="button"
          className="btn-primary btn-scouting-order"
          onClick={handleOrderAllScoutingFse}
          disabled={ordering || itemsToBuy.length === 0}
        >
          {ordering ? '⏳ Invio in corso...' : '🚀 Ordina / Aggiungi tutti su Scouting FSE (1-Click)'}
        </button>
      </div>

      <div className="tobuy-info-banner">
        <p>
          Questa lista mostra automaticamente tutti gli <strong>articoli nuovi (non usati)</strong> con <strong>giacenza esaurita (0)</strong> o richiesti nelle prenotazioni attive.
        </p>
      </div>

      <div className="products-table">
        <table>
          <thead>
            <tr>
              <th>Nome Articolo</th>
              <th>Tipologia</th>
              <th>Branca</th>
              <th>Taglia</th>
              <th>Prezzo</th>
              <th>Giacenza Attuale</th>
              <th>Richieste Attive</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {itemsToBuy.map(product => (
              <tr key={product.id}>
                <td><strong>{product.nome}</strong></td>
                <td>{product.tipologia}</td>
                <td>{product.branca}</td>
                <td>{product.taglia || 'Taglia unica'}</td>
                <td>€ {product.prezzo.toFixed(2)}</td>
                <td>{product.quantita_magazzino ?? 0}</td>
                <td>{product.quantita_prenotata || 0}</td>
                <td>
                  <span className="stock-badge stock-buy">🛒 Da Acquistare</span>
                </td>
              </tr>
            ))}
            {itemsToBuy.length === 0 && (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>
                  🎉 Nessun articolo nuovo da acquistare! Tutti gli articoli hanno giacenza disponibile.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {curlPromptOpen && (
        <div className="modal-overlay" onClick={() => setCurlPromptOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔗 Configurazione API Scouting FSE</h3>
              <button type="button" className="btn-close" onClick={() => setCurlPromptOpen(false)}>✕</button>
            </div>
            <div className="modal-content">
              <p>
                Incolla qui la chiamata <strong>cURL (CMD)</strong> che hai copiato dal sito Scouting FSE:
              </p>
              <textarea
                rows="6"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '10px' }}
                value={curlText}
                onChange={(e) => setCurlText(e.target.value)}
                placeholder="curl 'https://www.scoutingfse.it/...' -H 'Cookie: ...' --data-raw '...'"
              />
              <div style={{ marginTop: '15px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setCurlPromptOpen(false)
                    handleOrderAllScoutingFse()
                  }}
                >
                  💾 Salva e Invia Ordine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
