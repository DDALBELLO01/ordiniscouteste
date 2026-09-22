import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/PublicBooking.css'
import ProductSelector from '../components/ProductSelector'
import BookingForm from '../components/BookingForm'
import { useAppDialog } from '../components/AppDialog'

export default function PublicBooking({ onCartChange, selectedBranch, onSelectedBranchChange }) {
  const { showMessage, dialogElement } = useAppDialog()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingsEnabled, setBookingsEnabled] = useState(true)
  const [selectedItems, setSelectedItems] = useState(() => {
    try {
      const saved = localStorage.getItem('cartItems')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetchProducts()
    checkBookingsEnabled()

    // Polling ogni 30 secondi
    const interval = setInterval(checkBookingsEnabled, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (onCartChange) {
      const count = selectedItems.reduce((sum, item) => sum + item.quantita, 0)
      const total = selectedItems.reduce((sum, item) => sum + (item.quantita * item.prezzo), 0)
      onCartChange({ count, total })
    }
    localStorage.setItem('cartItems', JSON.stringify(selectedItems))
  }, [selectedItems, onCartChange])

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/prodotti')
      setProducts(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Errore caricamento prodotti:', error)
      setLoading(false)
    }
  }

  const checkBookingsEnabled = async () => {
    try {
      const response = await axios.get('/api/config/prenotazioni-abilitate')
      setBookingsEnabled(response.data.enabled)
    } catch (error) {
      console.error('Errore controllo prenotazioni:', error)
    }
  }

  const handleAddItem = (product, quantity) => {
    setSelectedItems(currentItems => {
      const existingItem = currentItems.find(item => item.prodotto_id === product.id && item.specialita === product.specialita)

      if (existingItem) {
        return currentItems.map(item => item.prodotto_id === product.id && item.specialita === product.specialita
          ? { ...item, quantita: item.quantita + quantity }
          : item
        )
      }

      return [...currentItems, {
        prodotto_id: product.id,
        specialita: product.specialita || null,
        nome: `${product.taglia ? `${product.nome} - Taglia ${product.taglia}` : product.nome}${product.specialita ? ` - ${product.specialita}` : ''}`,
        quantita: quantity,
        prezzo: product.prezzo
      }]
    })
  }

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

  if (loading) {
    return <div className="loading">Caricamento...</div>
  }

  if (!bookingsEnabled) {
    return (
      <div className="booking-disabled">
        <h2>⚠️ Prenotazioni Temporaneamente Disabilitate</h2>
        <p>Le prenotazioni sono attualmente disabilitate. Riprovare più tardi.</p>
      </div>
    )
  }

  return (
    <div className="public-booking">
      <div className="booking-container">
        <div className="booking-grid">
          <div className="products-section">
            <h2>Catalogo Materiale</h2>
            <ProductSelector 
              products={products}
              onAddItem={handleAddItem}
              selectedBranch={selectedBranch}
              onSelectedBranchChange={onSelectedBranchChange}
            />
          </div>

          <div className="cart-section" id="cart-section">
            <h2>Riepilogo Prenotazione</h2>
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

            {selectedItems.length > 0 && (
              <BookingForm 
                items={selectedItems}
                onSubmit={handleSubmitBooking}
                submitted={submitted}
              />
            )}
          </div>
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
