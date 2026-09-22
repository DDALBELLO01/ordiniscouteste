import { useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import '../styles/AdminPanel.css'
import LoginForm from '../components/LoginForm'
import ProductManagement from '../components/ProductManagement'
import BookingManagement from '../components/BookingManagement'
import ToBuyManagement from '../components/ToBuyManagement'
import SettingsManagement from '../components/SettingsManagement'

export default function AdminPanel({ onLoggedIn }) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('adminToken'))
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.split('/')[2] || 'prodotti'

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
          className={`tab-btn ${activeTab === 'prodotti' ? 'active' : ''}`}
          onClick={() => navigate('/admin/prodotti')}
        >
          📦 Gestione Prodotti
        </button>
        <button 
          className={`tab-btn ${activeTab === 'prenotazioni' ? 'active' : ''}`}
          onClick={() => navigate('/admin/prenotazioni')}
        >
          📋 Prenotazioni
        </button>
        <button 
          className={`tab-btn ${activeTab === 'da-acquistare' ? 'active' : ''}`}
          onClick={() => navigate('/admin/da-acquistare')}
        >
          🛒 Da Acquistare
        </button>
        <button 
          className={`tab-btn ${activeTab === 'impostazioni' ? 'active' : ''}`}
          onClick={() => navigate('/admin/impostazioni')}
        >
          ⚙️ Impostazioni
        </button>
      </div>

      <div className="admin-content">
        <Routes>
          <Route index element={<Navigate to="prodotti" replace />} />
          <Route path="prodotti" element={<ProductManagement />} />
          <Route path="prenotazioni" element={<BookingManagement />} />
          <Route path="da-acquistare" element={<ToBuyManagement />} />
          <Route path="impostazioni" element={<SettingsManagement />} />
          <Route path="*" element={<Navigate to="prodotti" replace />} />
        </Routes>
      </div>
    </div>
  )
}
