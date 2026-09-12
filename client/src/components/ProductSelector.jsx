import { useMemo, useState } from 'react'
import '../styles/components.css'

export default function ProductSelector({ products, onAddItem }) {
  const [quantities, setQuantities] = useState({})
  const [sizePicker, setSizePicker] = useState(null)
  const [specialitaPicker, setSpecialitaPicker] = useState(null)
  const [specialitaName, setSpecialitaName] = useState('')
  const [filters, setFilters] = useState({
    search: '',
    tipologia: '',
    branca: '',
    taglia: '',
    usato: '',
    disponibilita: ''
  })
  const [sortField, setSortField] = useState('nome')
  const [sortOrder, setSortDirection] = useState('asc')
  const [showFilters, setShowFilters] = useState(true)

  const handleQuantityChange = (productId, value) => {
    setQuantities({
      ...quantities,
      [productId]: Math.max(1, parseInt(value) || 1)
    })
  }

  const handleAdd = (product) => {
    const quantity = quantities[product.id] || 1
    
    // Verifica se la quantità richiesta è disponibile
    if (product.quantita_magazzino !== null && product.quantita_magazzino !== undefined) {
      if (product.quantita_magazzino === 0) {
        alert('Articolo non disponibile')
        return
      }
      if (quantity > product.quantita_magazzino) {
        alert(`Quantità massima disponibile: ${product.quantita_magazzino}`)
        return
      }
    }
    
    onAddItem(product, quantity)
    setQuantities(currentQuantities => ({ ...currentQuantities, [product.id]: 1 }))
  }

  const handleAddGroup = (group) => {
    const tipologiaLower = group.tipologia.toLowerCase()
    const nomeLower = group.nome.toLowerCase()
    if (
      tipologiaLower.includes('specialit') ||
      nomeLower.includes('specialit') ||
      tipologiaLower.includes('barrett') ||
      nomeLower.includes('barrett')
    ) {
      setSpecialitaName('')
      setSpecialitaPicker(group)
      return
    }
    if (group.items.length === 1) {
      handleAdd(group.items[0])
      return
    }
    setSizePicker(group)
  }

  const options = useMemo(() => ({
    tipologie: [...new Set(products.map(product => product.tipologia).filter(Boolean))].sort(),
    branche: [...new Set(products.map(product => product.branca).filter(Boolean))].sort(),
    taglie: [...new Set(products.map(product => product.taglia).filter(Boolean))].sort()
  }), [products])

  const filteredProducts = useMemo(() => products.filter(product => {
    // Nascondi automaticamente i pezzi usati esauriti (quantita_magazzino <= 0)
    const isUsato = product.usato === 1 || product.usato === true
    const isOut = product.quantita_magazzino !== null && product.quantita_magazzino !== undefined && Number(product.quantita_magazzino) <= 0
    if (isUsato && isOut) return false

    const search = filters.search.trim().toLowerCase()
    const matchesSearch = !search || [product.nome, product.tipologia, product.branca, product.taglia]
      .filter(Boolean)
      .some(value => value.toLowerCase().includes(search))
    const matchesAvailability = !filters.disponibilita || (
      filters.disponibilita === 'disponibile'
        ? product.quantita_magazzino === null || product.quantita_magazzino === undefined || product.quantita_magazzino > 0
        : product.quantita_magazzino === 0
    )

    return matchesSearch &&
      (!filters.tipologia || product.tipologia === filters.tipologia) &&
      (!filters.branca || product.branca === filters.branca || product.branca === 'Tutti') &&
      (!filters.taglia || product.taglia === filters.taglia) &&
      (!filters.usato || (filters.usato === 'usato' ? product.usato === 1 : product.usato !== 1)) &&
      matchesAvailability
  }), [products, filters])

  const groupedProducts = useMemo(() => {
    const groups = new Map()
    filteredProducts.forEach(product => {
      const key = [product.nome, product.tipologia, product.branca, product.prezzo, product.immagine || '', product.usato].join('|')
      if (!groups.has(key)) groups.set(key, { ...product, items: [] })
      groups.get(key).items.push(product)
    })
    const list = [...groups.values()]
    list.sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (sortField === 'disponibilita') {
        const getQty = (itemGroup) => {
          const avail = itemGroup.items.filter(i => i.quantita_magazzino === null || i.quantita_magazzino === undefined || i.quantita_magazzino > 0)
          if (avail.some(i => i.quantita_magazzino === null || i.quantita_magazzino === undefined)) return 999999
          return avail.reduce((s, i) => s + (i.quantita_magazzino || 0), 0)
        }
        valA = getQty(a)
        valB = getQty(b)
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase()
        valB = (valB || '').toLowerCase()
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredProducts, sortField, sortOrder])

  const updateFilter = (name, value) => {
    setFilters(current => ({ ...current, [name]: value }))
  }

  const resetFilters = () => {
    setFilters({
      search: '', tipologia: '', branca: '', taglia: '', usato: '', disponibilita: ''
    })
    setSortField('nome')
    setSortDirection('asc')
  }

  return (
    <div className="product-selector">
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
        <div className="catalog-filters">
          <div className="filter-row">
            <input
              type="search"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Cerca prodotto, tipologia, branca o taglia"
              aria-label="Cerca prodotti"
            />
            <select value={filters.tipologia} onChange={(e) => updateFilter('tipologia', e.target.value)} aria-label="Filtra per tipologia">
              <option value="">Tutte le tipologie</option>
              {options.tipologie.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={filters.branca} onChange={(e) => updateFilter('branca', e.target.value)} aria-label="Filtra per branca">
              <option value="">Tutte le branche</option>
              {options.branche.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <select value={filters.taglia} onChange={(e) => updateFilter('taglia', e.target.value)} aria-label="Filtra per taglia">
              <option value="">Tutte le taglie</option>
              {options.taglie.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="filter-row">
            <select value={filters.usato} onChange={(e) => updateFilter('usato', e.target.value)} aria-label="Filtra per stato articolo">
              <option value="">Nuovi e usati</option>
              <option value="nuovo">Solo nuovi</option>
              <option value="usato">Solo usati</option>
            </select>
            <select value={filters.disponibilita} onChange={(e) => updateFilter('disponibilita', e.target.value)} aria-label="Filtra per disponibilità">
              <option value="">Ogni disponibilità</option>
              <option value="disponibile">Disponibili</option>
              <option value="esaurito">Esauriti</option>
            </select>
            <select value={`${sortField}-${sortOrder}`} onChange={(e) => {
              const [field, order] = e.target.value.split('-')
              setSortField(field)
              setSortDirection(order)
            }} aria-label="Ordina catalogo">
              <option value="nome-asc">Ordina per: Nome (A-Z)</option>
              <option value="nome-desc">Ordina per: Nome (Z-A)</option>
              <option value="prezzo-asc">Ordina per: Prezzo (Crescente)</option>
              <option value="prezzo-desc">Ordina per: Prezzo (Decrescente)</option>
              <option value="branca-asc">Ordina per: Branca (A-Z)</option>
              <option value="tipologia-asc">Ordina per: Tipologia (A-Z)</option>
              <option value="disponibilita-desc">Ordina per: Disponibilità</option>
            </select>
            <button type="button" className="btn-filter-reset" onClick={resetFilters}>Azzera filtri</button>
          </div>
        </div>
      )}

      <div className="catalog-summary">{groupedProducts.length} articoli visualizzati</div>

      <div className="products-list">
        {groupedProducts.map(product => {
          const availableItems = product.items.filter(item => item.quantita_magazzino === null || item.quantita_magazzino === undefined || item.quantita_magazzino > 0)
          const available = availableItems.length > 0
          const unlimited = availableItems.some(item => item.quantita_magazzino === null || item.quantita_magazzino === undefined)
          const availableQuantity = availableItems.reduce((total, item) => total + (item.quantita_magazzino || 0), 0)
          const sizes = product.items.map(item => item.taglia).filter(Boolean)
          return (
            <div key={`${product.id}-${product.specialita || ''}`} className="product-row">
              <div className="product-image-wrap">
                {product.immagine ? <img src={product.immagine} alt={product.nome} className="product-image" /> : <span className="product-image-placeholder">Scout</span>}
              </div>
              <div className="product-details">
                <div className="product-header">
                  <h4>{product.nome}</h4>
                  <span className="product-type">{product.tipologia}</span>
                </div>
                <div className="product-meta">
                  <span>Branca: {product.branca}</span>
                  <span>Taglie: {sizes.length > 0 ? sizes.join(', ') : 'Taglia unica'}</span>
                  {product.usato === 1 && <span className="badge-usato">Articolo usato</span>}
                </div>
                <p className="product-stock">
                  {unlimited ? 'Disponibile senza vincoli' : available ? `Disponibili: ${availableQuantity}` : 'Non disponibile'}
                </p>
              </div>
              <div className="product-order">
                <p className="product-price">€ {product.prezzo.toFixed(2)}</p>
                {available ? (
                  <div className="product-footer">
                    <input type="number" min="1" max={product.quantita_magazzino || undefined} value={quantities[product.id] || 1} onChange={(e) => handleQuantityChange(product.id, e.target.value)} className="qty-input" aria-label={`Quantità ${product.nome}`} />
                    <button type="button" className="btn-add" onClick={() => handleAddGroup(product)}>{sizes.length > 1 ? 'Scegli taglia' : 'Aggiungi'}</button>
                  </div>
                ) : <span className="out-of-stock">Esaurito</span>}
              </div>
            </div>
          )
        })}
        {groupedProducts.length === 0 && <p className="empty-catalog">Nessun articolo corrisponde ai filtri selezionati.</p>}
      </div>

      {sizePicker && (
        <div className="size-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="size-picker-title">
          <div className="size-picker">
            <div className="size-picker-header">
              <h3 id="size-picker-title">Scegli la taglia</h3>
              <button type="button" className="btn-close" onClick={() => setSizePicker(null)} aria-label="Chiudi">×</button>
            </div>
            <p>{sizePicker.nome}{sizePicker.specialita ? ` - ${sizePicker.specialita}` : ''}</p>
            <div className="size-picker-options">
              {sizePicker.items.map(item => {
                const itemAvailable = item.quantita_magazzino === null || item.quantita_magazzino === undefined || item.quantita_magazzino > 0
                return <button key={item.id} type="button" disabled={!itemAvailable} onClick={() => { handleAdd(item); setSizePicker(null) }}>{item.taglia || 'Taglia unica'}{!itemAvailable ? ' - Esaurita' : ''}</button>
              })}
            </div>
          </div>
        </div>
      )}

      {specialitaPicker && (() => {
        const isBarretta = specialitaPicker.tipologia.toLowerCase().includes('barrett') || specialitaPicker.nome.toLowerCase().includes('barrett')
        const labelText = isBarretta ? 'Scegli la funzione / barretta' : 'Scegli la specialità'
        const placeholderText = isBarretta ? 'Inserisci la funzione (es. Capo Branco, Akela, CR...)' : 'Inserisci il nome della specialità'
        const buttonText = isBarretta ? 'Aggiungi barretta' : 'Aggiungi specialità'

        return (
          <div className="size-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="specialita-picker-title">
            <div className="size-picker">
              <div className="size-picker-header">
                <h3 id="specialita-picker-title">{labelText}</h3>
                <button type="button" className="btn-close" onClick={() => setSpecialitaPicker(null)} aria-label="Chiudi">×</button>
              </div>
              <p>{specialitaPicker.nome}</p>
              <input
                type="text"
                className="specialita-input"
                value={specialitaName}
                onChange={(event) => setSpecialitaName(event.target.value)}
                placeholder={placeholderText}
                autoFocus
              />
              <button
                type="button"
                className="btn-add specialita-confirm"
                disabled={!specialitaName.trim()}
                onClick={() => {
                  const product = specialitaPicker.items[0]
                  handleAdd({ ...product, specialita: specialitaName.trim() })
                  setSpecialitaPicker(null)
                  setSpecialitaName('')
                }}
              >
                {buttonText}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
