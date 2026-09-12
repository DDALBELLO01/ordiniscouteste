import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/components.css'

export default function ToBuyManagement() {
  const [itemsToBuy, setItemsToBuy] = useState([])
  const [loading, setLoading] = useState(true)
  const [ordering, setOrdering] = useState(false)
  const [syncingStock, setSyncingStock] = useState(false)
  const [configStatus, setConfigStatus] = useState(null)
  const [orderResults, setOrderResults] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

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
    } catch (error) {
      console.error('Errore configurazione Scouting FSE:', error)
    }
  }

  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type })
  }

  const handleSyncAvailability = async () => {
    setSyncingStock(true)
    try {
      const response = await axios.post('/api/admin/scouting-fse/sincronizza-disponibilita')
      showToast('🔄 ' + response.data.message, 'success')
      fetchItemsToBuy()
    } catch (error) {
      console.error('Errore sincronizzazione disponibilità:', error)
      showToast('Errore: ' + (error.response?.data?.error || error.message), 'error')
    } finally {
      setSyncingStock(false)
    }
  }

  const handleOrderAllScoutingFse = async () => {
    if (itemsToBuy.length === 0) {
      showToast('Nessun articolo nuovo da acquistare al momento!', 'warning')
      return
    }

    setOrdering(true)
    setOrderResults(null)
    try {
      const response = await axios.post('/api/admin/scouting-fse/ordina-tutti', {
        items: itemsToBuy
      })

      setOrderResults(response.data.details)
      showToast('🚀 ' + response.data.message, 'success')
    } catch (error) {
      console.error('Errore invio ordine Scouting FSE:', error)
      showToast('Errore: ' + (error.response?.data?.error || error.message), 'error')
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
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleSyncAvailability}
            disabled={syncingStock}
          >
            {syncingStock ? '⏳ Verifica in corso...' : '🔄 Sincronizza Disponibilità Scouting FSE'}
          </button>
          <button
            type="button"
            className="btn-primary btn-scouting-order"
            onClick={handleOrderAllScoutingFse}
            disabled={ordering || itemsToBuy.length === 0}
          >
            {ordering ? '⏳ Invio in corso...' : '🚀 Ordina / Aggiungi tutti su Scouting FSE (1-Click)'}
          </button>
        </div>
      </div>

      <div className="tobuy-info-banner">
        <p style={{ margin: 0 }}>
          Questa lista mostra automaticamente tutti gli <strong>articoli nuovi (non usati)</strong> con <strong>giacenza esaurita (0)</strong> o richiesti nelle prenotazioni attive.
        </p>
        {configStatus && configStatus.autoAuth && (
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#276749' }}>
            <strong>✅ Autenticazione Automatica Attiva ({configStatus.email})</strong> — Gli ordini verranno inseriti direttamente nel carrello Scouting FSE.
          </p>
        )}
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

      {toastMessage && (
        <div className="modal-overlay" onClick={() => setToastMessage(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'center' }}>
              <h3>{toastMessage.type === 'error' ? '⚠️ Errore' : toastMessage.type === 'success' ? '✅ Operazione Completata' : 'ℹ️ Informazione'}</h3>
            </div>
            <div className="modal-content">
              <p style={{ fontSize: '15px', margin: '15px 0' }}>{toastMessage.msg}</p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setToastMessage(null)}
                style={{ width: '100%', padding: '10px' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
