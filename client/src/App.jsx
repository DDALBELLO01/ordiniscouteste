import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'
import PublicBooking from './pages/PublicBooking'
import AdminPanel from './pages/AdminPanel'

function App() {
  const [page, setPage] = useState('public')
  const [adminLogged, setAdminLogged] = useState(false)
  const [cartSummary, setCartSummary] = useState({ count: 0, total: 0 })

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
              onClick={() => { handlePageChange('public'); handleLogout(); }}
            >
              Home
            </button>
          <button 
            className={`nav-btn ${page === 'public' ? 'active' : ''}`}
            onClick={() => setSelectedBranch(null)}>
            Cambia branca
          </button>
          {branchReferenceUrl(selectedBranch) && (
            <button 
              className={`nav-btn ${page === 'public' ? 'active' : ''}`}
              onClick={() => handleOpenBranchUniform(selectedBranch)}>
              Mostra uniforme
            </button>
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
        {page === 'public' && <PublicBooking onCartChange={setCartSummary} />}
        {page === 'admin' && <AdminPanel onLoggedIn={() => setAdminLogged(true)} />}
      </main>

      <footer className="app-footer">
        <p>&copy; 2026 Scout Este. Realizzato con ❤️</p>
      </footer>
    </div>
  )
}

export default App
