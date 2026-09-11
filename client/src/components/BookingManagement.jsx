import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/components.css'

export default function BookingManagement() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [bookingsEnabled, setBookingsEnabled] = useState(true)
  const [togglingStatus, setTogglingStatus] = useState(false)

  const statuses = ['attiva', 'confermata', 'ritirata', 'annullata']

  useEffect(() => {
    fetchBookings()
    checkBookingsStatus()
  }, [])

  const fetchBookings = async () => {
    try {
      const response = await axios.get('/api/admin/prenotazioni')
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
      await axios.put('/api/admin/config/prenotazioni', {
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

  const handleChangeStatus = async (bookingId, newStatus) => {
    try {
      await axios.put(`/api/admin/prenotazioni/${bookingId}/stato`, {
        stato: newStatus
      })
      fetchBookings()
    } catch (error) {
      console.error('Errore aggiornamento:', error)
      alert('Errore aggiornamento stato')
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

  if (loading) {
    return <div className="loading">Caricamento prenotazioni...</div>
  }

  return (
    <div className="booking-management">
      <div className="management-header">
        <h3>Gestione Prenotazioni ({bookings.length})</h3>
        <div className="header-controls">
          <button 
            className={`btn-toggle ${bookingsEnabled ? 'enabled' : 'disabled'}`}
            onClick={handleToggleBookings}
            disabled={togglingStatus}
          >
            {bookingsEnabled ? '✓ Prenotazioni Abilitate' : '✕ Prenotazioni Disabilitate'}
          </button>
        </div>
      </div>

      <div className="bookings-table">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Branca</th>
              <th>Data</th>
              <th>Articoli</th>
              <th>Totale</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map(booking => (
              <tr key={booking.id}>
                <td>{booking.nome_prenotante}</td>
                <td>{booking.email_prenotante}</td>
                <td>{booking.branca_riferimento || '-'}</td>
                <td>{new Date(booking.data_prenotazione).toLocaleDateString('it-IT')}</td>
                <td>{booking.num_items} articoli</td>
                <td>€ {Number(booking.totale || 0).toFixed(2)}</td>
                <td>
                  <select 
                    value={booking.stato}
                    onChange={(e) => handleChangeStatus(booking.id, e.target.value)}
                    className={`status-select status-${booking.stato}`}
                  >
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
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
        />
      )}
    </div>
  )
}

function BookingDetails({ bookingId, onClose }) {
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const response = await axios.get(`/api/admin/prenotazioni/${bookingId}`)
        setBooking(response.data)
        setLoading(false)
      } catch (error) {
        console.error('Errore:', error)
        setLoading(false)
      }
    }
    fetchDetails()
  }, [bookingId])

  if (loading) return <div className="modal-overlay"><div className="modal">Caricamento...</div></div>
  if (!booking) return null

  const total = booking.items.reduce((sum, item) => sum + (item.quantita * item.prezzo_unitario), 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Dettagli Prenotazione</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-content">
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
        </div>
      </div>
    </div>
  )
}
