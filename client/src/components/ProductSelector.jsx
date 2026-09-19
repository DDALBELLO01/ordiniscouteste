import { useMemo, useState } from 'react'
import '../styles/components.css'
import { useAppDialog } from './AppDialog'

function sizeSortKey(value) {
  const text = String(value || '').trim().toUpperCase()
  const ageMatch = text.match(/(\d+(?:[.,]\d+)?).*ANNI?/)
  if (ageMatch) return { group: 0, value: Number(ageMatch[1].replace(',', '.')), text }

  const numericMatch = text.match(/\d+(?:[.,]\d+)?/)
  if (numericMatch) return { group: 2, value: Number(numericMatch[0].replace(',', '.')), text }

  const sizeOrder = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
  const sizeIndex = sizeOrder.findIndex(size => text === size || text.startsWith(`${size}/`) || text.startsWith(`${size}-`))
  return { group: 1, value: sizeIndex >= 0 ? sizeIndex : sizeOrder.length, text }
}

function compareSizes(first, second) {
  const firstKey = sizeSortKey(first)
  const secondKey = sizeSortKey(second)
  if (firstKey.group !== secondKey.group) return firstKey.group - secondKey.group
  if (firstKey.value !== secondKey.value) return firstKey.value - secondKey.value
  return firstKey.text.localeCompare(secondKey.text, 'it', { numeric: true })
}

function productHasBranch(product, branch) {
  const branches = String(product.branca || '').split(',').map(item => item.trim()).filter(Boolean)
  return branches.includes(branch) || branches.includes('Tutti')
}

export default function ProductSelector({ products, onAddItem }) {
  const { showMessage, dialogElement } = useAppDialog()
  const [quantities, setQuantities] = useState({})
  const [sizePicker, setSizePicker] = useState(null)
  const [specialitaPicker, setSpecialitaPicker] = useState(null)
  const [specialitaName, setSpecialitaName] = useState('')
  const [sizeGuideUrl, setSizeGuideUrl] = useState(null)
  const [selectedBranch, setSelectedBranch] = useState(null)
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
    const isUsato = product.usato === 1 || product.usato === true

    if (isUsato) {
      if (product.quantita_magazzino !== null && product.quantita_magazzino !== undefined) {
        if (product.quantita_magazzino <= 0) {
          showMessage('Articolo usato non disponibile', 'Articolo non disponibile')
          return
        }
        if (quantity > product.quantita_magazzino) {
          showMessage(`Quantità usata massima disponibile: ${product.quantita_magazzino}`, 'Quantità non disponibile')
          return
        }
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
    taglie: [...new Set(products.map(product => product.taglia).filter(Boolean))].sort(compareSizes)
  }), [products])

  const availableBranches = useMemo(() => (
    [...new Set(products.flatMap(product => String(product.branca || '').split(',').map(branch => branch.trim()).filter(branch => branch && branch !== 'Tutti')))].sort((first, second) => {
      const order = ['Coccinelle', 'Lupetti', 'Guide', 'Esploratori', 'Scolte', 'Rover', 'Capi']
      const firstIndex = order.indexOf(first)
      const secondIndex = order.indexOf(second)
      if (firstIndex >= 0 && secondIndex >= 0) return firstIndex - secondIndex
      if (firstIndex >= 0) return -1
      if (secondIndex >= 0) return 1
      return first.localeCompare(second, 'it')
    })
  ), [products])

  const branchLabel = (branch) => {
    if (branch === 'Guide') return 'Riparto Guide'
    if (branch === 'Esploratori') return 'Riparto Esploratori'
    return branch
  }

  const branchSymbol = (branch) => {
    const symbols = {
      Coccinelle: '🐞',
      Lupetti: '🐺',
      Guide: '🧭',
      Esploratori: '⛺',
      Scolte: '✦',
      Rover: '🛰️',
      Capi: '★',
      Tutti: '✦'
    }
    return symbols[branch] || '✦'
  }

  const filteredProducts = useMemo(() => products.filter(product => {
    // Nascondi automaticamente i pezzi usati esauriti (quantita_magazzino <= 0)
    const isUsato = product.usato === 1 || product.usato === true
    const isOutLocal = product.quantita_magazzino !== null && product.quantita_magazzino !== undefined && Number(product.quantita_magazzino) <= 0
    if (isUsato && isOutLocal) return false

    const search = filters.search.trim().toLowerCase()
    const matchesSearch = !search || [product.nome, product.tipologia, product.branca, product.taglia]
      .filter(Boolean)
      .some(value => value.toLowerCase().includes(search))

    const isAvailable = !isUsato || !isOutLocal
    const matchesAvailability = !filters.disponibilita || (
      filters.disponibilita === 'disponibile' ? isAvailable : !isAvailable
    )

    return matchesSearch &&
      (!filters.tipologia || product.tipologia === filters.tipologia) &&
      (!filters.branca || productHasBranch(product, filters.branca)) &&
      (!filters.taglia || product.taglia === filters.taglia) &&
      (!filters.usato || (filters.usato === 'usato' ? isUsato : !isUsato)) &&
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
      search: '', tipologia: '', branca: selectedBranch || '', taglia: '', usato: '', disponibilita: ''
    })
    setSortField('nome')
    setSortDirection('asc')
  }

  const chooseBranch = (branch) => {
    setSelectedBranch(branch)
    setFilters(current => ({ ...current, branca: branch === 'Tutti' ? '' : branch }))
  }

  if (!selectedBranch) {
    return (
      <div className="branch-welcome">
        <div className="branch-welcome-content">
          <span className="branch-welcome-kicker">Ordini Scout</span>
          <h3>Scegli il materiale da esplorare</h3>
          <p>Seleziona una branca per vedere subito gli articoli disponibili.</p>
          <div className="branch-choice-grid">
            {availableBranches.map(branch => (
              <button key={branch} type="button" className="branch-choice" onClick={() => chooseBranch(branch)}>
                <span className="branch-choice-icon">{branchSymbol(branch)}</span>
                <span>{branchLabel(branch)}</span>
                <small>{products.filter(product => productHasBranch(product, branch)).length} articoli</small>
              </button>
            ))}
            <button type="button" className="branch-choice branch-choice-all" onClick={() => chooseBranch('Tutti')}>
              <span className="branch-choice-icon">{branchSymbol('Tutti')}</span>
              <span>Tutto il materiale</span>
              <small>{products.length} articoli</small>
            </button>
          </div>
        </div>
      </div>
    )
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
          <span>🔍 {showFilters ? 'Nascondi filtri e ricerca' : 'Mostra filtri e ricerca'} · {selectedBranch === 'Tutti' ? 'Tutto il materiale' : selectedBranch}</span>
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
      <button type="button" className="branch-change-button" onClick={() => setSelectedBranch(null)}>
        Cambia branca
      </button>

      <div className="products-list">
        {groupedProducts.map(product => {
          const availableItems = product.items.filter(item => {
            const isUsatoItem = item.usato === 1 || item.usato === true
            const isOutLocalItem = item.quantita_magazzino !== null && item.quantita_magazzino !== undefined && item.quantita_magazzino <= 0
            if (isUsatoItem && isOutLocalItem) return false
            return true
          })

          const available = availableItems.length > 0
          const sortedItems = [...product.items].sort((first, second) => compareSizes(first.taglia, second.taglia))
          const sizes = sortedItems.map(item => item.taglia).filter(Boolean)
          const isUsato = product.usato === 1 || product.usato === true
          const localStock = product.quantita_magazzino

          let stockText = ''
          if (isUsato) {
            stockText = localStock ? `Disponibili usati: ${localStock}` : 'Usato disponibile'
          } else {
            if (localStock !== null && localStock !== undefined && localStock > 0) {
              stockText = `Disponibile in magazzino (${localStock} pz)`
            } else {
              stockText = 'Ordinabile su richiesta'
            }
          }

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
                  {isUsato && <span className="badge-usato">Articolo usato</span>}
                </div>
                <p className="product-stock">{stockText}</p>
                {product.guida_taglie_url && (
                  <button type="button" className="size-guide-button" onClick={() => setSizeGuideUrl(product.guida_taglie_url)}>
                    Guida alle taglie
                  </button>
                )}
              </div>
              <div className="product-order">
                <p className="product-price">€ {product.prezzo.toFixed(2)}</p>
                {available ? (
                  <div className="product-footer">
                    <input type="number" min="1" max={isUsato ? (product.quantita_magazzino || undefined) : undefined} value={quantities[product.id] || 1} onChange={(e) => handleQuantityChange(product.id, e.target.value)} className="qty-input" aria-label={`Quantità ${product.nome}`} />
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
              {[...sizePicker.items].sort((first, second) => compareSizes(first.taglia, second.taglia)).map(item => {
                const isUsatoItem = item.usato === 1 || item.usato === true
                const isOutLocalItem = item.quantita_magazzino !== null && item.quantita_magazzino !== undefined && item.quantita_magazzino <= 0
                const itemAvailable = !(isUsatoItem && isOutLocalItem)

                return (
                  <button key={item.id} type="button" disabled={!itemAvailable} onClick={() => { handleAdd(item); setSizePicker(null) }}>
                    {item.taglia || 'Taglia unica'}
                    {!itemAvailable ? ' - Esaurita' : ''}
                  </button>
                )
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
      {sizeGuideUrl && (
        <div className="size-guide-overlay" role="dialog" aria-modal="true" aria-label="Guida alle taglie" onClick={() => setSizeGuideUrl(null)}>
          <button type="button" className="size-guide-close" onClick={() => setSizeGuideUrl(null)} aria-label="Chiudi guida taglie">×</button>
          <img src={sizeGuideUrl} alt="Guida alle taglie" className="size-guide-image" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
      {dialogElement}
    </div>
  )
}
