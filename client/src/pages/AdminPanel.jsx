import { useState, useEffect } from 'react'
import axios from 'axios'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import '../styles/AdminPanel.css'
import LoginForm from '../components/LoginForm'
import ProductManagement from '../components/ProductManagement'
import BookingManagement from '../components/BookingManagement'
import ToBuyManagement from '../components/ToBuyManagement'
import SettingsManagement from '../components/SettingsManagement'
import ReservedItems from '../components/ReservedItems'
import LeaderAccounts from '../components/LeaderAccounts'

export default function AdminPanel({ onLoggedIn }) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('adminToken'))
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.split('/')[2] || 'prodotti'

  useEffect(() => {
    const expire = () => {
      setIsLoggedIn(false)
      setUser(null)
      setError('Sessione scaduta: accedi nuovamente')
    }
    window.addEventListener('session-expired', expire)
    return () => window.removeEventListener('session-expired', expire)
  }, [])

  useEffect(() => {
    if (!isLoggedIn || user) return
    axios.get('/api/admin/me').then(response => setUser(response.data)).catch(error => {
      console.error('Errore verifica sessione:', error)
      setError(error.response?.data?.error || 'Impossibile verificare la sessione. Ricarica la pagina.')
    })
  }, [isLoggedIn, user])

  const handleLogin = (token, account) => {
    localStorage.setItem('adminToken', token)
    setUser(account)
    setError('')
    setIsLoggedIn(true)
    navigate('/admin/prenotazioni')
    onLoggedIn()
  }

  if (!isLoggedIn) {
    return <>{error && <div className="error-message">{error}</div>}<LoginForm onLogin={handleLogin} /></>
  }
  if (!user) return <div className={error ? 'error-message' : 'loading'}>{error || 'Verifica accesso...'}</div>
  const isAdmin = user.ruolo === 'admin'

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>{isAdmin ? 'Pannello Amministrazione' : `Prenotazioni — ${user.nome}`}</h2>
      </div>

      <div className="admin-tabs">
        {isAdmin && <button
          className={`tab-btn ${activeTab === 'prodotti' ? 'active' : ''}`}
          onClick={() => navigate('/admin/prodotti')}
        >
          📦 Gestione Prodotti
        </button>}
        <button 
          className={`tab-btn ${activeTab === 'prenotazioni' ? 'active' : ''}`}
          onClick={() => navigate('/admin/prenotazioni')}
        >
          📋 Prenotazioni
        </button>
        {isAdmin && <button
          className={`tab-btn ${activeTab === 'da-acquistare' ? 'active' : ''}`}
          onClick={() => navigate('/admin/da-acquistare')}
        >
          🛒 Da Acquistare
        </button>}
        {isAdmin && <button
          className={`tab-btn ${activeTab === 'impostazioni' ? 'active' : ''}`}
          onClick={() => navigate('/admin/impostazioni')}
        >
          ⚙️ Impostazioni
        </button>}
        {isAdmin && <button className={`tab-btn ${activeTab === 'capi-unita' ? 'active' : ''}`} onClick={() => navigate('/admin/capi-unita')}>
          Capi Unità
        </button>}
      </div>

      <div className="admin-content">
        <Routes>
          <Route index element={<Navigate to="prenotazioni" replace />} />
          <Route path="prenotazioni" element={<ReservedItems user={user} />} />
          {isAdmin && <>
            <Route path="prodotti" element={<ProductManagement />} />
            <Route path="per-prenotazione" element={<BookingManagement />} />
            <Route path="da-acquistare" element={<ToBuyManagement />} />
            <Route path="impostazioni" element={<SettingsManagement />} />
            <Route path="capi-unita" element={<LeaderAccounts />} />
          </>}
          <Route path="*" element={<Navigate to="prenotazioni" replace />} />
        </Routes>
      </div>
    </div>
  )
}
