import { Fragment, useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import '../styles/components.css'
import { useAppDialog } from './AppDialog'

function ProductForm({ formRef, formData, setFormData, branches, editingId, handleSave, resetForm }) {
  return (
    <form ref={formRef} className="management-form" onSubmit={handleSave}>
      <div className="form-row">
        <div className="form-group">
          <label>Nome:</label>
          <input type="text" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} required />
        </div>
        <div className="form-group">
          <label>Tipologia:</label>
          <input type="text" value={formData.tipologia} onChange={(e) => setFormData({...formData, tipologia: e.target.value})} required />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Branca:</label>
          <select value={formData.branca} onChange={(e) => setFormData({...formData, branca: e.target.value})} required>
            <option value="">Seleziona branca</option>
            {branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Taglia:</label>
          <input type="text" value={formData.taglia} onChange={(e) => setFormData({...formData, taglia: e.target.value})} placeholder="Es. S, M, L, XL o 6-8 anni" />
        </div>
        <div className="form-group">
          <label>Immagine (URL):</label>
          <input type="url" value={formData.immagine || ''} onChange={(e) => setFormData({...formData, immagine: e.target.value})} placeholder="https://..." />
        </div>
        <div className="form-group">
          <label>Quantità Magazzino:</label>
          <input type="number" min="0" value={formData.quantita_magazzino} onChange={(e) => setFormData({...formData, quantita_magazzino: e.target.value === '' ? '' : parseInt(e.target.value, 10)})} placeholder="Vuoto = illimitato" />
        </div>
        <div className="form-group">
          <label>Prezzo (€):</label>
          <input type="number" step="0.01" value={formData.prezzo} onChange={(e) => setFormData({...formData, prezzo: parseFloat(e.target.value)})} required />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Scouting FSE ID Prodotto:</label>
          <input type="number" value={formData.scouting_id_prodotto || ''} onChange={(e) => setFormData({...formData, scouting_id_prodotto: e.target.value})} placeholder="Es. 1018" />
        </div>
        <div className="form-group">
          <label>Scouting FSE ID Caratteristica:</label>
          <input type="number" value={formData.scouting_caratteristica_id || ''} onChange={(e) => setFormData({...formData, scouting_caratteristica_id: e.target.value})} placeholder="Es. 337" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <input type="checkbox" id={`usato-${editingId || 'nuovo'}`} checked={formData.usato} onChange={(e) => setFormData({...formData, usato: e.target.checked})} />
          <label htmlFor={`usato-${editingId || 'nuovo'}`} style={{marginBottom: 0}}>Articolo usato</label>
        </div>
        <div className="form-group" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <input type="checkbox" id={`mostra-home-${editingId || 'nuovo'}`} checked={formData.mostra_home !== false && formData.mostra_home !== 0} onChange={(e) => setFormData({...formData, mostra_home: e.target.checked})} />
          <label htmlFor={`mostra-home-${editingId || 'nuovo'}`} style={{marginBottom: 0}}>Visibile nella home</label>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary">{editingId ? 'Aggiorna' : 'Crea'}</button>
        <button type="button" className="btn-secondary" onClick={resetForm}>Annulla</button>
      </div>
    </form>
  )
}

export default function ProductManagement() {
  const { showMessage, showConfirm, dialogElement } = useAppDialog()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const formRef = useRef(null)
  const [editTarget, setEditTarget] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    tipologia: '',
    branca: '',
    taglia: '',
    usato: '',
    mostraHome: '',
    giacenza: ''
  })
  const [formData, setFormData] = useState({
    nome: '',
    tipologia: '',
    branca: '',
    taglia: '',
    immagine: '',
    quantita_magazzino: '',
    prezzo: 0,
    usato: false,
    mostra_home: true,
    scouting_id_prodotto: '',
    scouting_caratteristica_id: ''
  })

  const branches = ['Coccinelle', 'Lupetti', 'Guide', 'Esploratori', 'Scolte', 'Rover', 'Capi', 'Tutti']

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    if (showForm && editingId && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showForm, editingId, editTarget])

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/prodotti?admin=true')
      setProducts(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Errore caricamento:', error)
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await axios.put(`/api/admin/prodotti/${editingId}`, formData)
      } else {
        await axios.post('/api/admin/prodotti', formData)
      }
      fetchProducts()
      resetForm()
    } catch (error) {
      console.error('Errore salvataggio:', error)
      showMessage('Errore: ' + error.response?.data?.error, 'Errore')
    }
  }

  const handleDelete = async (id) => {
    if (await showConfirm('Confermi eliminazione?', 'Elimina prodotto')) {
      try {
        await axios.delete(`/api/admin/prodotti/${id}`)
        fetchProducts()
      } catch (error) {
        console.error('Errore eliminazione:', error)
        showMessage('Errore: ' + error.response?.data?.error, 'Errore')
      }
    }
  }

  const handleDuplicate = async (product) => {
    try {
      const { id, created_at, updated_at, ...copy } = product
      await axios.post('/api/admin/prodotti', copy)
      await fetchProducts()
    } catch (error) {
      console.error('Errore duplicazione:', error)
      showMessage('Errore: ' + error.response?.data?.error, 'Errore')
    }
  }

  const handleEdit = (product) => {
    setFormData(product)
    setEditingId(product.id)
    setEditTarget(null)
    setShowForm(true)
  }

  const resetForm = () => {
    setFormData({
      nome: '',
      tipologia: '',
      branca: '',
      taglia: '',
      immagine: '',
      quantita_magazzino: '',
      prezzo: 0,
      usato: false,
      mostra_home: true,
      scouting_id_prodotto: '',
      scouting_caratteristica_id: ''
    })
    setEditingId(null)
    setEditTarget(null)
    setShowForm(false)
  }

  const [sortConfig, setSortConfig] = useState({ field: 'nome', direction: 'asc' })
  const [showFilters, setShowFilters] = useState(true)

  const handleSort = (field) => {
    setSortConfig(current => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const renderSortIndicator = (field) => {
    if (sortConfig.field !== field) return <span className="sort-icon"> ⇅</span>
    return <span className="sort-icon">{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
  }
  const updateFilter = (name, value) => {
    setFilters(current => ({ ...current, [name]: value }))
  }

  const filterOptions = useMemo(() => ({
    tipologie: [...new Set(products.map(product => product.tipologia).filter(Boolean))].sort(),
    branche: [...new Set(products.map(product => product.branca).filter(Boolean))].sort(),
    taglie: [...new Set(products.map(product => product.taglia).filter(Boolean))].sort()
  }), [products])

  const filteredProducts = useMemo(() => products.filter(product => {
    const search = filters.search.trim().toLowerCase()
    const matchesSearch = !search || [product.nome, product.tipologia, product.branca, product.taglia]
      .filter(Boolean)
      .some(value => value.toLowerCase().includes(search))

    const isUsato = product.usato === 1 || product.usato === true
    const isZeroStock = product.quantita_magazzino !== null && product.quantita_magazzino !== undefined && Number(product.quantita_magazzino) <= 0
    const isDaAcquistare = !isUsato && isZeroStock

    let matchesGiacenza = true
    if (filters.giacenza === 'da_acquistare') {
      matchesGiacenza = isDaAcquistare
    } else if (filters.giacenza === 'esaurito') {
      matchesGiacenza = isZeroStock
    } else if (filters.giacenza === 'disponibile') {
      matchesGiacenza = !isZeroStock
    }

    return matchesSearch &&
      (!filters.tipologia || product.tipologia === filters.tipologia) &&
      (!filters.branca || product.branca === filters.branca) &&
      (!filters.taglia || product.taglia === filters.taglia) &&
      (!filters.usato || (filters.usato === 'usato' ? isUsato : !isUsato)) &&
      (!filters.mostraHome || (filters.mostraHome === 'visibile'
        ? product.mostra_home !== 0 && product.mostra_home !== false
        : product.mostra_home === 0 || product.mostra_home === false)) &&
      matchesGiacenza
  }), [products, filters])

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts]
    list.sort((a, b) => {
      let valA = a[sortConfig.field]
      let valB = b[sortConfig.field]

      if (valA === null || valA === undefined) valA = ''
      if (valB === null || valB === undefined) valB = ''

      if (typeof valA === 'string') {
        valA = valA.toLowerCase()
        valB = valB.toString().toLowerCase()
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredProducts, sortConfig])

  const resetFilters = () => {
    setFilters({
      search: '', tipologia: '', branca: '', taglia: '', usato: '', mostraHome: '', giacenza: ''
    })
    setSortConfig({ field: 'nome', direction: 'asc' })
  }

  if (loading) {
    return <div className="loading">Caricamento prodotti...</div>
  }

  return (
    <>
    <div className="product-management">
      <div className="management-header">
        <h3>Gestione Prodotti ({products.length})</h3>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Chiudi' : '+ Nuovo Prodotto'}
        </button>
      </div>

      {showForm && !editingId && (
        <ProductForm formRef={formRef} formData={formData} setFormData={setFormData} branches={branches} editingId={editingId} handleSave={handleSave} resetForm={resetForm} />
      )}

      <div className="filters-header">
        <button
          type="button"
          className="btn-toggle-filters"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
        >
          <span>🔍 {showFilters ? 'Nascondi filtri e ricerca' : 'Mostra filtri e ricerca'}</span>
          <span className="toggle-icon">{showFilters ? '▲' : '▼'}</span>
        </button>
      </div>

      {showFilters && (
        <div className="catalog-filters admin-filters">
          <div className="filter-row">
            <input
              type="search"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Cerca per nome, tipologia, branca o taglia"
              aria-label="Cerca prodotti admin"
            />
            <select value={filters.tipologia} onChange={(e) => updateFilter('tipologia', e.target.value)} aria-label="Filtra per tipologia">
              <option value="">Tutte le tipologie</option>
              {filterOptions.tipologie.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={filters.branca} onChange={(e) => updateFilter('branca', e.target.value)} aria-label="Filtra per branca">
              <option value="">Tutte le branche</option>
              {filterOptions.branche.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={filters.taglia} onChange={(e) => updateFilter('taglia', e.target.value)} aria-label="Filtra per taglia">
              <option value="">Tutte le taglie</option>
              {filterOptions.taglie.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="filter-row">
            <select value={filters.usato} onChange={(e) => updateFilter('usato', e.target.value)} aria-label="Filtra per stato articolo">
              <option value="">Nuovi e usati</option>
              <option value="nuovo">Solo nuovi</option>
              <option value="usato">Solo usati</option>
            </select>
            <select value={filters.mostraHome} onChange={(e) => updateFilter('mostraHome', e.target.value)} aria-label="Filtra per visibilità home">
              <option value="">Ogni visibilità</option>
              <option value="visibile">Visibili nella home</option>
              <option value="nascosto">Nascosti dalla home</option>
            </select>
            <select value={filters.giacenza} onChange={(e) => updateFilter('giacenza', e.target.value)} aria-label="Filtra per giacenza magazzino">
              <option value="">Ogni giacenza</option>
              <option value="da_acquistare">🛒 Da acquistare (Nuovi giacenza 0)</option>
              <option value="disponibile">Disponibili</option>
              <option value="esaurito">Esauriti</option>
            </select>
            <button type="button" className="btn-filter-reset" onClick={resetFilters}>Azzera filtri</button>
          </div>
        </div>
      )}

      <div className="catalog-summary">{filteredProducts.length} di {products.length} articoli</div>

      <div className="products-table">
        <table>
          <thead>
            <tr>
              <th className="sortable-th" onClick={() => handleSort('nome')}>Nome{renderSortIndicator('nome')}</th>
              <th className="sortable-th" onClick={() => handleSort('tipologia')}>Tipologia{renderSortIndicator('tipologia')}</th>
              <th className="sortable-th" onClick={() => handleSort('branca')}>Branca{renderSortIndicator('branca')}</th>
              <th className="sortable-th" onClick={() => handleSort('taglia')}>Taglia{renderSortIndicator('taglia')}</th>
              <th>Immagine</th>
              <th className="sortable-th" onClick={() => handleSort('quantita_magazzino')}>Magazzino{renderSortIndicator('quantita_magazzino')}</th>
              <th className="sortable-th" onClick={() => handleSort('prezzo')}>Prezzo{renderSortIndicator('prezzo')}</th>
              <th className="sortable-th" onClick={() => handleSort('usato')}>Usato{renderSortIndicator('usato')}</th>
              <th className="sortable-th" onClick={() => handleSort('mostra_home')}>Home{renderSortIndicator('mostra_home')}</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map(product => (
              <Fragment key={product.id}>
              <tr>
                <td>{product.nome}</td>
                <td>{product.tipologia}</td>
                <td>{product.branca}</td>
                <td>{product.taglia || '-'}</td>
                <td>
                  {product.immagine ? (
                    <img className="product-thumb" src={product.immagine} alt="" />
                  ) : '-'}
                </td>
                <td>
                  {product.quantita_magazzino === null || product.quantita_magazzino === undefined ? (
                    '∞ (Illimitato)'
                  ) : Number(product.quantita_magazzino) <= 0 ? (
                    product.usato ? (
                      <span className="stock-badge stock-hidden">0 (Nascosto)</span>
                    ) : (
                      <span className="stock-badge stock-buy">🛒 Da Acquistare (0)</span>
                    )
                  ) : (
                    product.quantita_magazzino
                  )}
                </td>
                <td>€ {product.prezzo.toFixed(2)}</td>
                <td>{product.usato ? '✓ Sì' : 'No'}</td>
                <td>{product.mostra_home === 0 ? 'Nascosto' : 'Visibile'}</td>
                <td className="actions">
                  <button className="btn-small btn-copy" onClick={() => handleDuplicate(product)}>
                    📄 Duplica
                  </button>
                  <button className="btn-small btn-edit" onClick={() => handleEdit(product)}>
                    ✏️ Modifica
                  </button>
                  <button className="btn-small btn-delete" onClick={() => handleDelete(product.id)}>
                    🗑️ Elimina
                  </button>
                </td>
              </tr>
              {product.id === editingId && (
                <tr>
                  <td colSpan="10">
                    <div ref={product.id === editingId ? setEditTarget : null} className="inline-edit-target" />
                  </td>
                </tr>
              )}
              {product.id === editingId && editTarget && createPortal(
                <ProductForm formRef={formRef} formData={formData} setFormData={setFormData} branches={branches} editingId={editingId} handleSave={handleSave} resetForm={resetForm} />,
                editTarget
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && <p className="empty-catalog">Nessun articolo corrisponde ai filtri selezionati.</p>}
      </div>
    </div>
    {dialogElement}
    </>
  )
}
