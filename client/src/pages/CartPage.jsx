import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/PublicBooking.css'
import BookingForm from '../components/BookingForm'
import { useAppDialog } from '../components/AppDialog'

export default function CartPage({ onCartChange, selectedBranch }) {
  const navigate = useNavigate()
  const { showMessage, dialogElement } = useAppDialog()
  const savedBranch = localStorage.getItem('selectedBranch')
  const [selectedItems, setSelectedItems] = useState(() => {
    try {
      const saved = localStorage.getItem('cartItems')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [submitted, setSubmitted] = useState(false)
  const [bookingsEnabled, setBookingsEnabled] = useState(true)
  const [checkingBookings, setCheckingBookings] = useState(true)

  useEffect(() => {
    const checkBookingsEnabled = async () => {
      try {
        const response = await axios.get('/api/config/prenotazioni-abilitate')
        setBookingsEnabled(response.data.enabled)
      } catch (error) {
        console.error('Errore controllo prenotazioni:', error)
      } finally {
        setCheckingBookings(false)
      }
    }

    checkBookingsEnabled()
  }, [])

  useEffect(() => {
    if (onCartChange) {
      const count = selectedItems.reduce((sum, item) => sum + item.quantita, 0)
      const total = selectedItems.reduce((sum, item) => sum + (item.quantita * item.prezzo), 0)
      onCartChange({ count, total })
    }
    localStorage.setItem('cartItems', JSON.stringify(selectedItems))
  }, [selectedItems, onCartChange])

  const handleRemoveItem = (productId, specialita) => {
    setSelectedItems(currentItems => currentItems.filter(item => !(item.prodotto_id === productId && item.specialita === specialita)))
  }

  const handleChangeItemQuantity = (productId, specialita, change) => {
    setSelectedItems(currentItems => currentItems
      .map(item => item.prodotto_id === productId && item.specialita === specialita
        ? { ...item, quantita: Math.max(0, item.quantita + change) }
        : item
      )
      .filter(item => item.quantita > 0)
    )
  }

  const handleSubmitBooking = async (bookingData) => {
    try {
      const response = await axios.post('/api/prenotazioni', {
        ...bookingData,
        items: selectedItems.map(item => ({
          prodotto_id: item.prodotto_id,
          quantita: item.quantita,
          specialita: item.specialita
        }))
      })
      setSubmitted(true)
      setSelectedItems([])
      if (!response.data.emailSent) {
        showMessage('Prenotazione salvata, ma non è stato possibile inviare le email. Contatta l’amministratore.', 'Email non inviate')
      }
      setTimeout(() => setSubmitted(false), 5000)
    } catch (error) {
      console.error('Errore prenotazione:', error)
      showMessage('Errore nella prenotazione: ' + (error.response?.data?.error || error.message), 'Errore prenotazione')
    }
  }

  if (checkingBookings) {
    return <div className="loading">Caricamento...</div>
  }

  return (
    <div className="public-booking cart-page">
      <div className="booking-container">
        <div className="cart-page-header">
          <h2>Riepilogo Prenotazione</h2>
          <button
            type="button"
            className="branch-change-button"
            onClick={() => navigate(selectedBranch ? `/${encodeURIComponent(selectedBranch)}` : (savedBranch ? `/${encodeURIComponent(savedBranch)}` : '/'))}
          >
            ← Torna al catalogo
          </button>
        </div>

        {!bookingsEnabled && (
          <div className="booking-disabled">
            <h2>⚠️ Prenotazioni Temporaneamente Disabilitate</h2>
            <p>Le prenotazioni sono attualmente disabilitate. Riprovare più tardi.</p>
          </div>
        )}

        <div className="cart-section cart-page-section">
          <div className="cart">
            {selectedItems.length === 0 ? (
              <p className="empty-cart">Nessun articolo selezionato</p>
            ) : (
              <>
                <div className="cart-items">
                  {selectedItems.map(item => (
                    <div key={`${item.prodotto_id}-${item.specialita || ''}`} className="cart-item">
                      <div className="item-info">
                        <strong>{item.nome}</strong>
                        <div className="cart-quantity-controls">
                          <button type="button" onClick={() => handleChangeItemQuantity(item.prodotto_id, item.specialita, -1)} aria-label="Diminuisci quantità">−</button>
                          <span>{item.quantita}</span>
                          <button type="button" onClick={() => handleChangeItemQuantity(item.prodotto_id, item.specialita, 1)} aria-label="Aumenta quantità">+</button>
                        </div>
                        <p>Prezzo: € {(item.quantita * item.prezzo).toFixed(2)}</p>
                      </div>
                      <button
                        className="btn-remove"
                        onClick={() => handleRemoveItem(item.prodotto_id, item.specialita)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="cart-total">
                  Totale: € {selectedItems.reduce((sum, item) => sum + (item.quantita * item.prezzo), 0).toFixed(2)}
                </div>
              </>
            )}
          </div>

          {bookingsEnabled && selectedItems.length > 0 && (
            <BookingForm
              items={selectedItems}
              onSubmit={handleSubmitBooking}
              submitted={submitted}
            />
          )}
        </div>

        {submitted && (
          <div className="success-message">
            ✅ Prenotazione confermata! Riceverai presto un'email di conferma.
          </div>
        )}
      </div>
      {dialogElement}
    </div>
  )
}
