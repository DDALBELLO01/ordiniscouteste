import { useState } from 'react'
import axios from 'axios'
import '../styles/AdminPanel.css'
import LoginForm from '../components/LoginForm'
import ProductManagement from '../components/ProductManagement'
import BookingManagement from '../components/BookingManagement'
import ToBuyManagement from '../components/ToBuyManagement'

export default function AdminPanel({ onLoggedIn }) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('adminToken'))
  const [activeTab, setActiveTab] = useState('products')

  const handleLogin = (token) => {
    localStorage.setItem('adminToken', token)
    setIsLoggedIn(true)
    onLoggedIn()
  }

  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    setIsLoggedIn(false)
  }

  if (!isLoggedIn) {
    return <LoginForm onLogin={handleLogin} />
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Pannello Amministrazione</h2>
        <button className="btn-logout" onClick={handleLogout}>Logout</button>
      </div>

      <div className="admin-tabs">
        <button 
          className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          📦 Gestione Prodotti
        </button>
        <button 
          className={`tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookings')}
        >
          📋 Prenotazioni
        </button>
        <button 
          className={`tab-btn ${activeTab === 'tobuy' ? 'active' : ''}`}
          onClick={() => setActiveTab('tobuy')}
        >
          🛒 Da Acquistare (Scouting FSE)
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'products' && <ProductManagement />}
        {activeTab === 'bookings' && <BookingManagement />}
        {activeTab === 'tobuy' && <ToBuyManagement />}
      </div>
    </div>
  )
}
