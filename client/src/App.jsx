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
  const [uniformGallery, setUniformGallery] = useState(null)

  const uniformImagesByBranch = {
    Coccinelle: [
      'https://www.scoutingfse.it/images/img_contenuti/26092013150554.gif',
      'https://www.scoutingfse.it/images/img_contenuti/26092013150620.gif',
      'https://www.scoutingfse.it/images/img_contenuti/26092013150647.gif',
      'https://www.scoutingfse.it/images/img_contenuti/26092013150723.gif',
      'https://www.scoutingfse.it/images/img_contenuti/26092013150754.gif',
      'https://www.scoutingfse.it/images/img_contenuti/26092013150819.gif'
    ],
    Lupetti: [
      'https://www.scoutingfse.it/images/img_contenuti/25092013090139.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013092403.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013090215.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013092459.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013092926.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013092634.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013092700.gif'
    ],
    Guide: [
      'https://www.scoutingfse.it/images/img_contenuti/06092013140906.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013140936.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141007.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141038.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141108.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141142.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141251.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141325.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141356.gif',
      'https://www.scoutingfse.it/images/img_contenuti/06092013141442.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013174634.jpg'
    ],
    Esploratori: [
      'https://www.scoutingfse.it/images/img_contenuti/23092013172810.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013172914.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013172838.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173045.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173116.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173150.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173217.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173301.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173326.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173451.gif',
      'https://www.scoutingfse.it/images/img_contenuti/23092013173851.jpg'
    ],
    Scolte: [
      'https://www.scoutingfse.it/images/img_contenuti/25092013141355.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013141418.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013141447.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013141514.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013141535.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013141535.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013141559.gif'
    ],
    Rover: [
      'https://www.scoutingfse.it/images/img_contenuti/25092013140354.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013140417.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013140447.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013140512.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013140546.gif',
      'https://www.scoutingfse.it/images/img_contenuti/25092013140620.gif'
    ]
  }

  const uniformOptions = [
    { label: 'Coccinelle', value: 'Coccinelle' },
    { label: 'Lupetti', value: 'Lupetti' },
    { label: 'Guide', value: 'Guide' },
    { label: 'Esploratori', value: 'Esploratori' },
    { label: 'Scolte', value: 'Scolte' },
    { label: 'Rover', value: 'Rover' }
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
                    const branch = event.target.value
                    if (!branch) return
                    setUniformGallery({
                      branch,
                      images: uniformImagesByBranch[branch] || []
                    })
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

      {uniformGallery && (
        <div className="uniform-gallery-overlay" onClick={() => setUniformGallery(null)} role="dialog" aria-modal="true" aria-label="Galleria uniformi">
          <div className="uniform-gallery-modal" onClick={(event) => event.stopPropagation()}>
            <div className="uniform-gallery-header">
              <h3>Uniformi - {uniformGallery.branch}</h3>
              <button type="button" className="uniform-gallery-close" onClick={() => setUniformGallery(null)} aria-label="Chiudi galleria uniformi">
                ×
              </button>
            </div>

            <div className="uniform-gallery-grid">
              {uniformGallery.images.map((image, index) => (
                <img
                  key={`${uniformGallery.branch}-${index}`}
                  src={image}
                  alt={`${uniformGallery.branch} uniforme ${index + 1}`}
                  className="uniform-gallery-image"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>&copy; 2026 Scout Este. Realizzato con ❤️</p>
      </footer>
    </div>
  )
}

export default App
