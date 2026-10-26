import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/PublicBooking.css'
import ProductSelector from '../components/ProductSelector'

export default function PublicBooking({ onCartChange, selectedBranch, onSelectedBranchChange }) {
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
        <div className="products-section">
          <h2>Catalogo Materiale</h2>
          <ProductSelector 
            products={products}
            onAddItem={handleAddItem}
            selectedBranch={selectedBranch}
            onSelectedBranchChange={onSelectedBranchChange}
          />
        </div>
      </div>
    </div>
  )
}
