import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/components.css'

export default function ToBuyManagement() {
  const [itemsToBuy, setItemsToBuy] = useState([])
  const [loading, setLoading] = useState(true)
  const [ordering, setOrdering] = useState(false)
  const [curlPromptOpen, setCurlPromptOpen] = useState(false)
  const [curlText, setCurlText] = useState('')
  const [configStatus, setConfigStatus] = useState(null)
  const [orderResults, setOrderResults] = useState(null)

  useEffect(() => {
    fetchItemsToBuy()
    fetchConfigStatus()
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

  const fetchConfigStatus = async () => {
    try {
      const response = await axios.get('/api/admin/scouting-fse/config')
      setConfigStatus(response.data)
      if (response.data.rawCurl) {
        setCurlText(response.data.rawCurl)
      }
    } catch (error) {
      console.error('Errore configurazione Scouting FSE:', error)
    }
  }

  const handleSaveConfig = async () => {
    if (!curlText.trim()) return
    try {
      const response = await axios.post('/api/admin/scouting-fse/config', { rawCurl: curlText })
      alert('✅ ' + response.data.message)
      setCurlPromptOpen(false)
      fetchConfigStatus()
    } catch (error) {
      console.error('Errore salvataggio config:', error)
      alert('Errore salvataggio cURL: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleOrderAllScoutingFse = async () => {
    if (itemsToBuy.length === 0) {
      alert('Nessun articolo nuovo da acquistare al momento!')
      return
    }

    setOrdering(true)
    setOrderResults(null)
    try {
      const response = await axios.post('/api/admin/scouting-fse/ordina-tutti', {
        items: itemsToBuy,
        cUrlConfig: curlText.trim() ? curlText.trim() : null
      })

      if (response.data.requiresConfig) {
        setCurlPromptOpen(true)
      } else {
        setOrderResults(response.data.details)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <p style={{ margin: 0 }}>
              Questa lista mostra automaticamente tutti gli <strong>articoli nuovi (non usati)</strong> con <strong>giacenza esaurita (0)</strong> o richiesti nelle prenotazioni attive.
            </p>
            {configStatus && (
              <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                Stato Sessione Scouting FSE: {configStatus.configured ? (
                  <strong style={{ color: '#276749' }}>✅ Configurato e Salvato ({new Date(configStatus.updated_at).toLocaleDateString('it-IT')})</strong>
                ) : (
                  <strong style={{ color: '#c53030' }}>⚠️ Non configurato (Incolla cURL)</strong>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-small btn-secondary"
            onClick={() => setCurlPromptOpen(true)}
          >
            ⚙️ {configStatus?.configured ? 'Aggiorna cURL' : 'Incolla cURL'}
          </button>
        </div>
      </div>

      {orderResults && (
        <div className="detail-section" style={{ background: '#f7fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px' }}>📊 Esito Invio Carrello Scouting FSE</h4>
          <p style={{ margin: '0 0 10px', fontSize: '14px' }}>
            Totale elaborati: <strong>{orderResults.total}</strong> | Aggiunti con successo: <strong style={{ color: '#276749' }}>{orderResults.successfulCount}</strong>
          </p>
          <table className="detail-table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>Articolo</th>
                <th>Quantità</th>
                <th>Esito</th>
                <th>Messaggio</th>
              </tr>
            </thead>
            <tbody>
              {orderResults.results.map((res, idx) => (
                <tr key={idx}>
                  <td><strong>{res.item}</strong></td>
                  <td>{res.qty || 1}</td>
                  <td>
                    {res.status === 'success' ? (
                      <span style={{ color: '#276749', fontWeight: 'bold' }}>✓ Successo</span>
                    ) : (
                      <span style={{ color: '#c53030', fontWeight: 'bold' }}>✕ Errore</span>
                    )}
                  </td>
                  <td>{res.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔗 Configurazione cURL / Sessione Scouting FSE</h3>
              <button type="button" className="btn-close" onClick={() => setCurlPromptOpen(false)}>✕</button>
            </div>
            <div className="modal-content">
              <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
                Incolla qui il comando <strong>cURL (cmd, bash o powershell)</strong> che hai copiato dai Developer Tools del browser (F12 ➔ Network ➔ Tasto destro sulla richiesta `buy.html` ➔ Copy as cURL):
              </p>
              <textarea
                rows="8"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
                value={curlText}
                onChange={(e) => setCurlText(e.target.value)}
                placeholder="curl --url 'https://www.scoutingfse.it/buy.html?mod=caratteristica...' -H 'Cookie: ...' --data-raw '...'"
              />
              <div style={{ marginTop: '15px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCurlPromptOpen(false)}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!curlText.trim()}
                  onClick={() => {
                    handleSaveConfig()
                  }}
                >
                  💾 Salva cURL e Invia Ordine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
