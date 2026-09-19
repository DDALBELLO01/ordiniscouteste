import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'
import PublicBooking from './pages/PublicBooking'
import AdminPanel from './pages/AdminPanel'

function App() {
  const [page, setPage] = useState('public')
  const [adminLogged, setAdminLogged] = useState(false)
  const [cartSummary, setCartSummary] = useState({ count: 0, total: 0 })
  const [selectedBranch, setSelectedBranch] = useState(null)

  const uniformOptions = [
    { label: 'Coccinelle', value: 'https://www.scoutingfse.it/info_6_uniforme-distintivi-coccinelle.html' },
    { label: 'Lupetti', value: 'https://www.scoutingfse.it/info_5_uniforme-distintivi-lupetti.html' },
    { label: 'Guide', value: 'https://www.scoutingfse.it/info_4_uniforme-distintivi-guide.html' },
    { label: 'Esploratori', value: 'https://www.scoutingfse.it/info_3_uniforme-distintivi-esploratori.html' },
    { label: 'Scolte', value: 'https://www.scoutingfse.it/info_10_uniforme-distintivi-scolte.html' },
    { label: 'Rover', value: 'https://www.scoutingfse.it/info_1_uniforme-distintivi-rover.html' },
    { label: 'Capi', value: 'https://www.scoutingfse.it/info_2_uniforme-distintivi-capi.html' }
  ]

  useEffect(() => {
    const token = localStorage.getItem('adminToken')
    if (token) {
      setAdminLogged(true)
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    setAdminLogged(false)
    setPage('public')
    setCartSummary({ count: 0, total: 0 })
  }

  const handlePageChange = (newPage) => {
    setPage(newPage)
    if (newPage !== 'public') {
      setCartSummary({ count: 0, total: 0 })
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🏕️ Ordini Scout</h1>

          {page === 'public' && cartSummary.count > 0 && (
            <button 
              type="button" 
              className="header-cart-btn"
              onClick={() => {
                const cartEl = document.getElementById('cart-section')
                if (cartEl) {
                  cartEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              }}
              aria-label="Vai al carrello"
            >
              🛒 {cartSummary.count} {cartSummary.count === 1 ? 'articolo' : 'articoli'} (€ {cartSummary.total.toFixed(2)}) ➔
            </button>
          )}

          <nav className="header-nav">
            <button 
              className={`nav-btn ${page === 'public' ? 'active' : ''}`}
              onClick={() => { handlePageChange('public'); handleLogout(); setSelectedBranch(null) }}
            >
              Home
            </button>

            {page === 'public' && selectedBranch && (
              <button
                type="button"
                className="nav-btn nav-btn-secondary"
                onClick={() => setSelectedBranch(null)}
              >
                Cambia unità
              </button>
            )}

            {page === 'public' && (
              <label className="uniform-header-picker-label">
                <select
                  className="uniform-header-picker"
                  defaultValue=""
                  onChange={(event) => {
                    const url = event.target.value
                    if (!url) return
                    window.open(url, '_blank', 'noopener,noreferrer')
                    event.target.value = ''
                  }}
                  aria-label="Apri uniforme"
                >
                  <option value="">Uniformi</option>
                  {uniformOptions.map(option => (
                    <option key={option.label} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}

            {adminLogged ? (
              <>
                <button 
                  className={`nav-btn ${page === 'admin' ? 'active' : ''}`}
                  onClick={() => handlePageChange('admin')}
                >
                  Admin Panel
                </button>
                <button className="nav-btn logout-btn" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <button 
                className={`nav-btn ${page === 'admin' ? 'active' : ''}`}
                onClick={() => handlePageChange('admin')}
              >
                Admin
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="app-main">
        {page === 'public' && (
          <PublicBooking
            onCartChange={setCartSummary}
            selectedBranch={selectedBranch}
            onSelectedBranchChange={setSelectedBranch}
          />
        )}
        {page === 'admin' && <AdminPanel onLoggedIn={() => setAdminLogged(true)} />}
      </main>

      <footer className="app-footer">
        <p>&copy; 2026 Scout Este. Realizzato con ❤️</p>
      </footer>
    </div>
  )
}

export default App
