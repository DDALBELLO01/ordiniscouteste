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
  const [curlPromptOpen, setCurlPromptOpen] = useState(false)
  const [curlText, setCurlText] = useState('')
  const [browserScriptModalOpen, setBrowserScriptModalOpen] = useState(false)
  const [scriptCopied, setScriptCopied] = useState(false)

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
      const response = await axios.post('/api/admin/scouting-fse/config', { rawCurl: curlText.trim() })
      showToast('✅ ' + response.data.message, 'success')
      setCurlPromptOpen(false)
      fetchConfigStatus()
    } catch (error) {
      console.error('Errore salvataggio config:', error)
      showToast('Errore salvataggio cURL: ' + (error.response?.data?.error || error.message), 'error')
    }
  }

  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type })
  }

  const generateBrowserScript = () => {
    const requestedItems = itemsToBuy.filter(i => (Number(i.quantita_prenotata) || 0) > 0)
    const itemsJson = JSON.stringify(requestedItems.map(i => ({
      nome: i.nome + (i.taglia ? ` (${i.taglia})` : ''),
      qty: Number(i.quantita_prenotata) || 1,
      scouting_id_prodotto: i.scouting_id_prodotto,
      scouting_caratteristica_id: i.scouting_caratteristica_id,
      immagine: i.immagine
    })))

    return `(async function() {
  const items = ${itemsJson};
  if (!items || items.length === 0) {
    alert('Nessun articolo da acquistare!');
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:#1a365d;color:white;padding:20px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:sans-serif;max-width:380px;';
  overlay.innerHTML = '<h3 style="margin:0 0 10px;font-size:16px;color:#63b3ed;">🏕️ Ordini Scout Auto-Cart</h3><div id="scout-status" style="font-size:14px;line-height:1.5;">Inizio aggiunta articoli al carrello...</div>';
  document.body.appendChild(overlay);

  const statusEl = document.getElementById('scout-status');
  let added = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    statusEl.innerHTML = \`Aggiunta in corso (\${i+1}/\${items.length}):<br><strong>\${item.nome}</strong>\`;
    
    const qty = item.qty || 1;
    let idProdotto = item.scouting_id_prodotto;
    let caratteristica0 = item.scouting_caratteristica_id;

    if (!idProdotto && item.immagine) {
      const m = item.immagine.match(/(\\d{3,6})/);
      if (m) idProdotto = m[1];
    }

    if (!idProdotto) {
      failed++;
      continue;
    }

    const url = \`https://www.scoutingfse.it/buy.html?mod=caratteristica&id_prodotto=\${idProdotto}&mod1=insert\`;
    const params = new URLSearchParams();
    params.append('qty', qty.toString());
    if (caratteristica0) params.append('caratteristica0', caratteristica0.toString());

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: params.toString()
      });

      if (res.ok) {
        added++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 250));
  }

  statusEl.innerHTML = \`<span style="color:#68d391;font-weight:bold;">✅ Completato! \${added} articoli aggiunti al carrello Scouting FSE.</span>\`;
  setTimeout(() => {
    window.location.href = 'https://www.scoutingfse.it/cart.html';
  }, 1500);
})();`
  }

  const handleCopyBrowserScript = () => {
    const script = generateBrowserScript()
    navigator.clipboard.writeText(script)
    setScriptCopied(true)
    setTimeout(() => setScriptCopied(false), 3000)
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
    const requestedItems = itemsToBuy.filter(i => (Number(i.quantita_prenotata) || 0) > 0)

    if (requestedItems.length === 0) {
      showToast('Nessun articolo ha richieste attive nelle prenotazioni da ordinare su Scouting FSE!', 'warning')
      return
    }

    setOrdering(true)
    setOrderResults(null)
    try {
      const minimalItems = requestedItems.map(i => ({
        id: i.id,
        nome: i.nome,
        taglia: i.taglia,
        quantita_prenotata: i.quantita_prenotata,
        scouting_id_prodotto: i.scouting_id_prodotto,
        scouting_caratteristica_id: i.scouting_caratteristica_id,
        immagine: i.immagine
      }))

      const response = await axios.post('/api/admin/scouting-fse/ordina-tutti', {
        items: minimalItems,
        rawCurl: curlText.trim() ? curlText.trim() : null
      })

      setOrderResults(response.data.details)
      showToast('🚀 ' + response.data.message, 'success')
    } catch (error) {
      console.error('Errore invio ordine Scouting FSE:', error)
      const errMessage = error.response?.data?.error || error.message
      showToast('Errore: ' + errMessage, 'error')
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
            className="btn-primary"
            style={{ backgroundColor: '#2b6cb0', borderColor: '#2b6cb0' }}
            onClick={() => setBrowserScriptModalOpen(true)}
            disabled={itemsToBuy.filter(i => (Number(i.quantita_prenotata) || 0) > 0).length === 0}
          >
            ⚡ Ordina dal Browser 1-Click (Consigliato)
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleSyncAvailability}
            disabled={syncingStock}
          >
            {syncingStock ? '⏳ Verifica in corso...' : '🔄 Sincronizza Disponibilità'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setCurlPromptOpen(true)}
          >
            ⚙️ cURL / Server Cloud
          </button>
        </div>
      </div>

      <div className="tobuy-info-banner">
        <p style={{ margin: 0 }}>
          Questa lista mostra automaticamente tutti gli <strong>articoli nuovi (non usati)</strong> con <strong>giacenza esaurita (0)</strong> o richiesti nelle prenotazioni attive.
        </p>
        {configStatus && (
          <div style={{ marginTop: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {configStatus.configured && (
              <span style={{ color: '#276749' }}>
                <strong>✅ Sessione cURL Configurata ({new Date(configStatus.updated_at).toLocaleDateString('it-IT')})</strong>
              </span>
            )}
            {configStatus.autoAuth && (
              <span style={{ color: '#2b6cb0' }}>
                <strong>🔑 Credenziali Automatiche ({configStatus.email})</strong>
              </span>
            )}
          </div>
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

      {browserScriptModalOpen && (
        <div className="modal-overlay" onClick={() => setBrowserScriptModalOpen(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚡ Ordine Automatico 1-Click dal Browser</h3>
              <button type="button" className="btn-close" onClick={() => setBrowserScriptModalOpen(false)}>✕</button>
            </div>
            <div className="modal-content" style={{ fontSize: '14px', lineHeight: '1.6' }}>
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', padding: '12px 16px', borderRadius: '6px', color: '#2b6cb0', marginBottom: '15px' }}>
                <p style={{ margin: 0 }}>
                  <strong>🔒 Perché dal Browser?</strong> Scouting FSE utilizza la protezione Anti-Bot Cloudflare che blocca i server cloud. Eseguendo lo script direttamente nel tuo browser sul sito Scouting FSE, l'ordine verrà inviato con successo usando il tuo indirizzo IP e la tua sessione autenticata!
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1a365d' }}>📌 Metodo 1: Copia Script (Consigliato)</h4>
                <ol style={{ paddingLeft: '20px', margin: '0 0 15px' }}>
                  <li>Clicca sul pulsante qui sotto per copiare lo script contenente i <strong>{itemsToBuy.filter(i => (Number(i.quantita_prenotata) || 0) > 0).length} articoli richiesti</strong>.</li>
                  <li>Apri una scheda su <a href="https://www.scoutingfse.it" target="_blank" rel="noreferrer" style={{ fontWeight: 'bold', color: '#2b6cb0' }}>scoutingfse.it</a> (dove sei collegato col tuo account).</li>
                  <li>Premi <strong>F12</strong> (o Tasto Destro ➔ Ispeziona), vai nella scheda <strong>Console</strong>, incolla (Ctrl + V) e premi <strong>Invio</strong>.</li>
                </ol>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCopyBrowserScript}
                  style={{ fontSize: '15px', padding: '10px 18px' }}
                >
                  {scriptCopied ? '✅ Script Copiato negli Appunti!' : '📋 Copia Script Ordine 1-Click'}
                </button>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '20px 0' }} />

              <div>
                <h4 style={{ margin: '0 0 10px', color: '#1a365d' }}>🔖 Metodo 2: Preferito / Bookmarklet</h4>
                <p style={{ margin: '0 0 10px' }}>
                  Trascina questo pulsante nella tua barra dei <strong>Preferiti</strong> del browser. Quando sei su <a href="https://www.scoutingfse.it" target="_blank" rel="noreferrer">scoutingfse.it</a>, ti basterà cliccare sul preferito!
                </p>
                <a
                  href={`javascript:${encodeURIComponent(generateBrowserScript())}`}
                  className="btn-primary"
                  onClick={(e) => e.preventDefault()}
                  style={{ display: 'inline-block', backgroundColor: '#319795', borderColor: '#319795', cursor: 'grab' }}
                  title="Trascina questo pulsante nella barra dei preferiti"
                >
                  🛒 Ordina su Scouting FSE
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {curlPromptOpen && (
        <div className="modal-overlay" onClick={() => setCurlPromptOpen(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔗 Configurazione cURL / Sessione Scouting FSE</h3>
              <button type="button" className="btn-close" onClick={() => setCurlPromptOpen(false)}>✕</button>
            </div>
            <div className="modal-content">
              <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
                Se la protezione Cloudflare di Scouting FSE blocca l'accesso automatico da server cloud (HTTP 403), incolla qui il comando <strong>cURL (cmd, bash o powershell)</strong> copiato dai Developer Tools F12 del browser (Network ➔ Tasto destro sulla richiesta ➔ Copy as cURL):
              </p>
              <textarea
                rows="7"
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
                  onClick={() => handleSaveConfig()}
                >
                  💾 Salva cURL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
