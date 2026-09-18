import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import '../styles/components.css'

export default function BookingManagement() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [bookingsEnabled, setBookingsEnabled] = useState(true)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [viewMode, setViewMode] = useState('attive') // 'attive' | 'archiviate'
  const [archiving, setArchiving] = useState(false)
  const [showFilters, setShowFilters] = useState(true)
  const [filters, setFilters] = useState({ search: '', branca: '', dataDa: '', dataA: '' })

  const [sortConfig, setSortConfig] = useState({ field: 'data_prenotazione', direction: 'desc' })

  const handleSort = (field) => {
    setSortConfig(current => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const renderSortIndicator = (field) => {
    if (sortConfig.field !== field) return <span className="sort-icon"> ⇅</span>
    return <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
  }

  const updateFilter = (name, value) => {
    setFilters(current => ({ ...current, [name]: value }))
  }

  const resetFilters = () => {
    setFilters({ search: '', branca: '', dataDa: '', dataA: '' })
  }

  useEffect(() => {
    fetchBookings(viewMode)
    checkBookingsStatus()
  }, [viewMode])

  const fetchBookings = async (mode = viewMode) => {
    try {
      const archiviate = mode === 'archiviate' ? 'true' : 'false'
      const response = await axios.get(`/api/admin/prenotazioni?archiviate=${archiviate}`)
      setBookings(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Errore caricamento:', error)
      setLoading(false)
    }
  }

  const checkBookingsStatus = async () => {
    try {
      const response = await axios.get('/api/config/prenotazioni-abilitate')
      setBookingsEnabled(response.data.enabled)
    } catch (error) {
      console.error('Errore:', error)
    }
  }

  const handleToggleBookings = async () => {
    setTogglingStatus(true)
    try {
      const response = await axios.put('/api/admin/config/prenotazioni', {
        enabled: !bookingsEnabled
      })
      setBookingsEnabled(!bookingsEnabled)
    } catch (error) {
      console.error('Errore:', error)
      alert('Errore aggiornamento configurazione')
    } finally {
      setTogglingStatus(false)
    }
  }

  const handleDelete = async (bookingId) => {
    if (!confirm('Confermi eliminazione della prenotazione? Le quantità limitate verranno ripristinate.')) {
      return
    }

    try {
      await axios.delete(`/api/admin/prenotazioni/${bookingId}`)
      if (selectedBooking === bookingId) setSelectedBooking(null)
      fetchBookings()
    } catch (error) {
      console.error('Errore eliminazione:', error)
      alert('Errore eliminazione prenotazione')
    }
  }

  const handleArchiveAll = async () => {
    if (!confirm('Confermi l\'archiviazione di TUTTE le prenotazioni attive? Verranno spostate nella sezione "Archiviate" e separate da quelle nuove.')) {
      return
    }

    setArchiving(true)
    try {
      const response = await axios.post('/api/admin/prenotazioni/archivia-tutte')
      const riepilogo = response.data.riepilogInviati > 0
        ? ` Inviati ${response.data.riepilogInviati} riepiloghi ai capi unità configurati.`
        : ''
      alert(`${response.data.archiviate} prenotazioni archiviate con successo.${riepilogo}`)
      fetchBookings(viewMode)
    } catch (error) {
      console.error('Errore archiviazione:', error)
      alert('Errore archiviazione prenotazioni')
    } finally {
      setArchiving(false)
    }
  }

  const filterOptions = useMemo(() => (
    [...new Set(bookings.map(booking => booking.branca_riferimento).filter(Boolean))].sort()
  ), [bookings])

  const filteredBookings = useMemo(() => bookings.filter(booking => {
    const search = filters.search.trim().toLowerCase()
    const matchesSearch = !search || [booking.nome_prenotante, booking.email_prenotante, booking.branca_riferimento]
      .filter(Boolean)
      .some(value => value.toLowerCase().includes(search))
    const bookingDate = booking.data_prenotazione ? new Date(booking.data_prenotazione).toISOString().slice(0, 10) : ''

    return matchesSearch &&
      (!filters.branca || booking.branca_riferimento === filters.branca) &&
      (!filters.dataDa || bookingDate >= filters.dataDa) &&
      (!filters.dataA || bookingDate <= filters.dataA)
  }), [bookings, filters])

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    let valA = a[sortConfig.field]
    let valB = b[sortConfig.field]

    if (sortConfig.field === 'totale') {
      valA = Number(valA || 0)
      valB = Number(valB || 0)
    } else if (sortConfig.field === 'num_items') {
      valA = Number(valA || 0)
      valB = Number(valB || 0)
    } else if (typeof valA === 'string') {
      valA = valA.toLowerCase()
      valB = (valB || '').toString().toLowerCase()
    }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  if (loading) {
    return <div className="loading">Caricamento prenotazioni...</div>
  }

  return (
    <div className="booking-management">
      <div className="management-header">
        <h3>Gestione Prenotazioni ({filteredBookings.length}{filteredBookings.length !== bookings.length ? ` di ${bookings.length}` : ''})</h3>
        <div className="header-controls">
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`btn-small ${viewMode === 'attive' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('attive')}
            >
              📄 Attive
            </button>
            <button
              type="button"
              className={`btn-small ${viewMode === 'archiviate' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('archiviate')}
            >
              📦 Archiviate
            </button>
          </div>
          {viewMode === 'attive' && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleArchiveAll}
              disabled={archiving || bookings.length === 0}
            >
              {archiving ? '⏳ Archiviazione...' : '📦 Archivia Tutte le Prenotazioni Attive'}
            </button>
          )}
          <button 
            className={`btn-toggle ${bookingsEnabled ? 'enabled' : 'disabled'}`}
            onClick={handleToggleBookings}
            disabled={togglingStatus}
          >
            {bookingsEnabled ? '✓ Prenotazioni Abilitate' : '✕ Prenotazioni Disabilitate'}
          </button>
        </div>
      </div>

      <div className="filters-header">
        <button
          type="button"
          className="btn-toggle-filters"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <span>🔍 {showFilters ? 'Nascondi filtri e ricerca' : 'Mostra filtri e ricerca'}</span>
          <span className="toggle-icon">{showFilters ? '▲' : '▼'}</span>
        </button>
      </div>

      {showFilters && (
        <div className="catalog-filters admin-filters booking-filters">
          <div className="filter-row">
            <input
              type="search"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Cerca per nome, email o branca"
              aria-label="Cerca prenotazioni"
            />
            <select value={filters.branca} onChange={(e) => updateFilter('branca', e.target.value)} aria-label="Filtra per branca">
              <option value="">Tutte le branche</option>
              {filterOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <input type="date" value={filters.dataDa} onChange={(e) => updateFilter('dataDa', e.target.value)} aria-label="Data prenotazione da" />
            <input type="date" value={filters.dataA} onChange={(e) => updateFilter('dataA', e.target.value)} aria-label="Data prenotazione a" />
          </div>
          <div className="filter-row booking-filter-actions">
            <span className="catalog-summary">{filteredBookings.length} prenotazioni visualizzate</span>
            <button type="button" className="btn-filter-reset" onClick={resetFilters}>Azzera filtri</button>
          </div>
        </div>
      )}

      <div className="bookings-table">
        <table>
          <thead>
            <tr>
              <th className="sortable-th" onClick={() => handleSort('nome_prenotante')}>Nome{renderSortIndicator('nome_prenotante')}</th>
              <th className="sortable-th" onClick={() => handleSort('email_prenotante')}>Email{renderSortIndicator('email_prenotante')}</th>
              <th className="sortable-th" onClick={() => handleSort('branca_riferimento')}>Branca{renderSortIndicator('branca_riferimento')}</th>
              <th className="sortable-th" onClick={() => handleSort('data_prenotazione')}>Data{renderSortIndicator('data_prenotazione')}</th>
              <th className="sortable-th" onClick={() => handleSort('num_items')}>Articoli{renderSortIndicator('num_items')}</th>
              <th className="sortable-th" onClick={() => handleSort('totale')}>Totale{renderSortIndicator('totale')}</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {sortedBookings.map(booking => (
              <tr key={booking.id}>
                <td>{booking.nome_prenotante}</td>
                <td>{booking.email_prenotante}</td>
                <td>{booking.branca_riferimento || '-'}</td>
                <td>{new Date(booking.data_prenotazione).toLocaleDateString('it-IT')}</td>
                <td>{booking.num_items} articoli</td>
                <td>€ {Number(booking.totale || 0).toFixed(2)}</td>
                <td className="actions">
                  <button 
                    className="btn-small btn-view"
                    onClick={() => setSelectedBooking(booking.id)}
                  >
                    👁️ Dettagli
                  </button>
                  <button
                    type="button"
                    className="btn-small btn-delete"
                    onClick={() => handleDelete(booking.id)}
                  >
                    🗑️ Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedBooking && (
        <BookingDetails 
          bookingId={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onBookingUpdated={fetchBookings}
        />
      )}
    </div>
  )
}

function BookingDetails({ bookingId, onClose, onBookingUpdated }) {
  const [booking, setBooking] = useState(null)
  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    nome_prenotante: '',
    email_prenotante: '',
    branca_riferimento: '',
    note: '',
    items: []
  })
  const [selectedAddProductId, setSelectedAddProductId] = useState('')

  const branches = ['Coccinelle', 'Lupetti', 'Guide', 'Esploratori', 'Scolte', 'Rover', 'Capi', 'Tutti']

  useEffect(() => {
    fetchDetails()
    fetchProducts()
  }, [bookingId])

  const fetchDetails = async () => {
    try {
      const response = await axios.get(`/api/admin/prenotazioni/${bookingId}`)
      setBooking(response.data)
      setEditForm({
        nome_prenotante: response.data.nome_prenotante,
        email_prenotante: response.data.email_prenotante,
        branca_riferimento: response.data.branca_riferimento || '',
        note: response.data.note || '',
        items: response.data.items.map(item => ({
          prodotto_id: item.prodotto_id,
          nome: item.nome,
          quantita: item.quantita,
          prezzo_unitario: item.prezzo_unitario,
          specialita: item.specialita || null
        }))
      })
      setLoading(false)
    } catch (error) {
      console.error('Errore:', error)
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/prodotti?admin=true')
      setAllProducts(response.data)
    } catch (error) {
      console.error('Errore prodotti:', error)
    }
  }

  const handleItemQtyChange = (index, newQty) => {
    const qty = Math.max(1, parseInt(newQty) || 1)
    setEditForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, quantita: qty } : item)
    }))
  }

  const handleRemoveItem = (index) => {
    setEditForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const handleAddProductToBooking = () => {
    if (!selectedAddProductId) return
    const prod = allProducts.find(p => p.id === Number(selectedAddProductId))
    if (!prod) return

    setEditForm(prev => {
      const exists = prev.items.find(i => i.prodotto_id === prod.id)
      if (exists) {
        return {
          ...prev,
          items: prev.items.map(i => i.prodotto_id === prod.id ? { ...i, quantita: i.quantita + 1 } : i)
        }
      }
      return {
        ...prev,
        items: [...prev.items, {
          prodotto_id: prod.id,
          nome: `${prod.nome}${prod.taglia ? ` - ${prod.taglia}` : ''}`,
          quantita: 1,
          prezzo_unitario: prod.prezzo,
          specialita: null
        }]
      }
    })
    setSelectedAddProductId('')
  }

  const handleSaveBooking = async () => {
    try {
      await axios.put(`/api/admin/prenotazioni/${bookingId}`, editForm)
      setIsEditing(false)
      fetchDetails()
      if (onBookingUpdated) onBookingUpdated()
    } catch (error) {
      console.error('Errore salvataggio prenotazione:', error)
      alert('Errore salvataggio: ' + (error.response?.data?.error || error.message))
    }
  }

  if (loading) return <div className="modal-overlay"><div className="modal">Caricamento...</div></div>
  if (!booking) return null

  const currentItems = isEditing ? editForm.items : booking.items
  const total = currentItems.reduce((sum, item) => sum + (item.quantita * item.prezzo_unitario), 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? '✏️ Modifica Prenotazione' : '👁️ Dettagli Prenotazione'}</h3>
          <div className="modal-header-actions">
            {!isEditing ? (
              <button type="button" className="btn-small btn-edit" onClick={() => setIsEditing(true)}>
                ✏️ Modifica
              </button>
            ) : (
              <button type="button" className="btn-small btn-secondary" onClick={() => setIsEditing(false)}>
                Annulla
              </button>
            )}
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
        </div>
        
        <div className="modal-content">
          {!isEditing ? (
            <>
              <div className="detail-section">
                <h4>Informazioni Prenotante</h4>
                <p><strong>Nome:</strong> {booking.nome_prenotante}</p>
                <p><strong>Email:</strong> {booking.email_prenotante}</p>
                <p><strong>Branca di riferimento:</strong> {booking.branca_riferimento || '-'}</p>
                <p><strong>Data:</strong> {new Date(booking.data_prenotazione).toLocaleString('it-IT')}</p>
                {booking.note && <p><strong>Note:</strong> {booking.note}</p>}
              </div>

              <div className="detail-section">
                <h4>Articoli Prenotati</h4>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>Prodotto</th>
                      <th>Quantità</th>
                      <th>Prezzo Unit.</th>
                      <th>Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.nome}</td>
                        <td>{item.quantita}</td>
                        <td>€ {item.prezzo_unitario.toFixed(2)}</td>
                        <td>€ {(item.quantita * item.prezzo_unitario).toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan="3"><strong>Totale:</strong></td>
                      <td><strong>€ {total.toFixed(2)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="edit-booking-form">
              <div className="form-group-grid">
                <div className="form-group">
                  <label>Nome Prenotante:</label>
                  <input
                    type="text"
                    value={editForm.nome_prenotante}
                    onChange={(e) => setEditForm({ ...editForm, nome_prenotante: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email Prenotante:</label>
                  <input
                    type="email"
                    value={editForm.email_prenotante}
                    onChange={(e) => setEditForm({ ...editForm, email_prenotante: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Branca di riferimento:</label>
                  <select
                    value={editForm.branca_riferimento}
                    onChange={(e) => setEditForm({ ...editForm, branca_riferimento: e.target.value })}
                  >
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Note:</label>
                <textarea
                  rows="2"
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                />
              </div>

              <div className="detail-section">
                <h4>Articoli in Prenotazione</h4>
                <div style={{ overflowX: 'auto', width: '100%', marginBottom: '10px' }}>
                  <table className="detail-table edit-items-table">
                    <thead>
                      <tr>
                        <th>Prodotto</th>
                        <th>Quantità</th>
                        <th>Prezzo Unit.</th>
                        <th>Totale</th>
                        <th>Azione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editForm.items.map((item, idx) => (
                        <tr key={idx}>
                          <td><strong>{item.nome}</strong></td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              className="qty-edit-input"
                              value={item.quantita}
                              onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                            />
                          </td>
                          <td>€ {item.prezzo_unitario.toFixed(2)}</td>
                          <td>€ {(item.quantita * item.prezzo_unitario).toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-small btn-delete"
                              title="Rimuovi articolo"
                              onClick={() => handleRemoveItem(idx)}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                      {editForm.items.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', color: '#718096', padding: '15px' }}>
                            Nessun articolo in prenotazione. Aggiungine uno dal menu sottostante.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="add-item-to-booking">
                  <select
                    value={selectedAddProductId}
                    onChange={(e) => setSelectedAddProductId(e.target.value)}
                  >
                    <option value="">Aggiungi un altro articolo dal catalogo...</option>
                    {allProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} {p.taglia ? `(${p.taglia})` : ''} - € {p.prezzo.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-small btn-primary"
                    disabled={!selectedAddProductId}
                    onClick={handleAddProductToBooking}
                  >
                    + Aggiungi
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-primary" onClick={handleSaveBooking}>
                  💾 Salva Modifiche Prenotazione
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
