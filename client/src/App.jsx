import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import './App.css'
import PublicBooking from './pages/PublicBooking'
import AdminPanel from './pages/AdminPanel'
import CartPage from './pages/CartPage'

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAdminPage = location.pathname.startsWith('/admin')
  const isCartPage = location.pathname === '/carrello'
  const page = isAdminPage ? 'admin' : 'public'
  const selectedBranch = page === 'public' && location.pathname !== '/' && !isCartPage
    ? decodeURIComponent(location.pathname.slice(1))
    : null
  const [adminLogged, setAdminLogged] = useState(false)
  const [cartSummary, setCartSummary] = useState({ count: 0, total: 0 })
  const [uniformGallery, setUniformGallery] = useState(null)
  const [zoomedUniformImage, setZoomedUniformImage] = useState(null)
  const [uniformBranchPickerOpen, setUniformBranchPickerOpen] = useState(false)

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

  // Alla prima apertura su "/" torna all'ultima unità scelta, se presente
  useEffect(() => {
    if (location.pathname === '/') {
      const saved = localStorage.getItem('selectedBranch')
      if (saved) {
        navigate(`/${encodeURIComponent(saved)}`, { replace: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setSelectedBranch = (branch) => {
    if (branch) {
      localStorage.setItem('selectedBranch', branch)
      navigate(`/${encodeURIComponent(branch)}`)
    } else {
      localStorage.removeItem('selectedBranch')
      navigate('/')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    setAdminLogged(false)
    navigate('/')
    setCartSummary({ count: 0, total: 0 })
  }

  const handlePageChange = (newPage) => {
    navigate(newPage === 'admin' ? '/admin' : '/')
    if (newPage !== 'public') {
      setCartSummary({ count: 0, total: 0 })
    }
  }

  const openUniformGallery = (branch) => {
    setUniformGallery({
      branch,
      images: uniformImagesByBranch[branch] || []
    })
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
              onClick={() => navigate('/carrello')}
              aria-label="Apri carrello"
            >
              🛒 {cartSummary.count} {cartSummary.count === 1 ? 'articolo' : 'articoli'} (€ {cartSummary.total.toFixed(2)})
            </button>
          )}

          <nav className="header-nav">
            <button 
              className={`nav-btn ${page === 'public' && !isCartPage ? 'active' : ''}`}
              onClick={() => {
                if (selectedBranch) {
                  setSelectedBranch(null)
                  return
                }
                handlePageChange('public')
              }}
            >
              {selectedBranch ? 'Cambio unità' : 'Home'}
            </button>

            {page === 'public' && (
              <button
                type="button"
                className="nav-btn"
                onClick={() => setUniformBranchPickerOpen(true)}
              >
                Uniformi
              </button>
            )}

            {adminLogged ? (
              <>
                <button 
                  className={`nav-btn ${page === 'admin' ? 'active' : ''}`}
                  onClick={() => handlePageChange('admin')}
                >
                  Admin
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
        <Routes>
          <Route path="/" element={(
            <PublicBooking
              onCartChange={setCartSummary}
              selectedBranch={selectedBranch}
              onSelectedBranchChange={setSelectedBranch}
            />
          )} />
          <Route path="/carrello" element={(
            <CartPage
              onCartChange={setCartSummary}
              selectedBranch={selectedBranch}
            />
          )} />
          <Route path="/:branca" element={(
            <PublicBooking
              onCartChange={setCartSummary}
              selectedBranch={selectedBranch}
              onSelectedBranchChange={setSelectedBranch}
            />
          )} />
          <Route path="/admin/*" element={<AdminPanel onLoggedIn={() => setAdminLogged(true)} />} />
        </Routes>
      </main>

      {uniformBranchPickerOpen && (
        <div className="uniform-gallery-overlay" onClick={() => setUniformBranchPickerOpen(false)} role="dialog" aria-modal="true" aria-label="Selezione uniformi">
          <div className="uniform-branch-picker" onClick={(event) => event.stopPropagation()}>
            <div className="uniform-gallery-header">
              <h3>Uniformi</h3>
              <button type="button" className="uniform-gallery-close" onClick={() => setUniformBranchPickerOpen(false)} aria-label="Chiudi selezione uniformi">
                ×
              </button>
            </div>
            <div className="uniform-branch-picker-grid">
              {uniformOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className="uniform-branch-picker-btn"
                  onClick={() => {
                    openUniformGallery(option.value)
                    setUniformBranchPickerOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
                <button
                  key={`${uniformGallery.branch}-${index}`}
                  type="button"
                  className="uniform-gallery-image-button"
                  onClick={() => setZoomedUniformImage(image)}
                  aria-label={`Ingrandisci uniforme ${uniformGallery.branch} ${index + 1}`}
                >
                  <img
                    src={image}
                    alt={`${uniformGallery.branch} uniforme ${index + 1}`}
                    className="uniform-gallery-image"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {zoomedUniformImage && (
        <div
          className="uniform-image-zoom-overlay"
          onClick={() => setZoomedUniformImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Zoom uniforme"
        >
          <button
            type="button"
            className="uniform-image-zoom-close"
            onClick={() => setZoomedUniformImage(null)}
            aria-label="Chiudi zoom uniforme"
          >
            ×
          </button>
          <img
            src={zoomedUniformImage}
            alt="Uniforme ingrandita"
            className="uniform-image-zoom-large"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      <footer className="app-footer">
        <p>&copy; 2026 Scout Este. Realizzato con ❤️</p>
      </footer>
    </div>
  )
}

export default App
