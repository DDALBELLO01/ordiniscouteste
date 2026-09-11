import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'
import PublicBooking from './pages/PublicBooking'
import AdminPanel from './pages/AdminPanel'

function App() {
  const [page, setPage] = useState('public')
  const [adminLogged, setAdminLogged] = useState(false)

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
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🏕️ Ordini Scout - Gestione Materiale</h1>
          <nav className="header-nav">
            <button 
              className={`nav-btn ${page === 'public' ? 'active' : ''}`}
              onClick={() => { setPage('public'); handleLogout(); }}
            >
              Home
            </button>
            {adminLogged ? (
              <>
                <button 
                  className={`nav-btn ${page === 'admin' ? 'active' : ''}`}
                  onClick={() => setPage('admin')}
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
                onClick={() => setPage('admin')}
              >
                Admin
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="app-main">
        {page === 'public' && <PublicBooking />}
        {page === 'admin' && <AdminPanel onLoggedIn={() => setAdminLogged(true)} />}
      </main>

      <footer className="app-footer">
        <p>&copy; 2024 Ordini Scout. Realizzato con ❤️</p>
      </footer>
    </div>
  )
}

export default App
