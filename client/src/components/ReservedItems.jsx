import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useAppDialog } from './AppDialog'
import '../styles/components.css'

const states = {
  prenotato: 'Prenotato', pagato: 'Pagato', non_disponibile: 'Non disponibile',
  non_pagato: 'Non pagato', ordinato: 'Ordinato', ricevuto: 'Ricevuto'
}
const money = value => `€ ${Number(value).toFixed(2)}`
const date = value => new Date(value).toLocaleString('it-IT')
const paid = row => Number(row.pagamento_registrato) === 1

export default function ReservedItems({ user }) {
  const isAdmin = user.ruolo === 'admin'
  const { showMessage, showConfirm, dialogElement } = useAppDialog()
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState([])
  const [filters, setFilters] = useState({ search: '', branca: '', stato: '', da: '', a: '' })
  const [archived, setArchived] = useState(false)
  const [details, setDetails] = useState(null)
  const [targetState, setTargetState] = useState('prenotato')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get(isAdmin
        ? `/api/admin/articoli-prenotati?archiviate=${archived}`
        : '/api/admin/prenotazioni-capo')
      setRows(response.data)
      setSelected([])
    } catch (error) {
      console.error('Errore caricamento articoli prenotati:', error)
      setError(error.response?.data?.error || 'Impossibile caricare le prenotazioni')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [archived, isAdmin])
  useEffect(() => {
    if (!isAdmin) return
    const check = () => axios.get('/api/admin/notifiche-stato')
      .then(response => setNotifications(response.data))
      .catch(error => {
        console.error('Errore lettura notifiche:', error)
        setNotifications({ errore: 'Impossibile verificare la coda email' })
      })
    check()
    const timer = setInterval(check, 10000)
    return () => clearInterval(timer)
  }, [isAdmin])

  const visible = useMemo(() => rows.filter(row => {
    const text = [row.nome, row.taglia, row.specialita, row.nome_prenotante, row.email_prenotante, row.branca_riferimento].join(' ').toLowerCase()
    const day = new Date(row.data_prenotazione).toISOString().slice(0, 10)
    return text.includes(filters.search.toLowerCase().trim()) &&
      (!filters.branca || row.branca_riferimento === filters.branca) &&
      (!isAdmin || !filters.stato || row.stato === filters.stato) &&
      (!filters.da || day >= filters.da) && (!filters.a || day <= filters.a)
  }), [rows, filters, isAdmin])

  const groups = useMemo(() => {
    const result = new Map()
    // Leaders always see and pay complete bookings, even when a search matches one item.
    const matchingBookings = new Set(visible.map(row => row.prenotazione_id))
    const source = isAdmin ? visible : rows.filter(row => matchingBookings.has(row.prenotazione_id))
    for (const row of source) {
      const key = isAdmin ? JSON.stringify([row.nome, row.taglia || '', row.specialita || '', Number(row.usato || 0)]) : row.prenotazione_id
      if (!result.has(key)) result.set(key, { key, ...row, items: [] })
      result.get(key).items.push(row)
    }
    return [...result.values()]
  }, [visible, rows, isAdmin])

  useEffect(() => { setSelected([]) }, [filters])
  const detailGroup = groups.find(group => group.key === details)
  const eligible = group => !archived && (isAdmin || group.items.some(item => !paid(item)))
  const idsFor = group => isAdmin ? group.items.map(item => item.id) : [group.key]
  const selection = group => idsFor(group).every(id => selected.includes(id))
  const toggle = (ids, checked) => setSelected(current => checked
    ? [...new Set([...current, ...ids])]
    : current.filter(id => !ids.includes(id)))
  const allIds = groups.filter(eligible).flatMap(idsFor)
  const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id))
  const summary = items => Object.entries(states).map(([state, label]) => {
    const quantity = items.filter(item => item.stato === state).reduce((total, item) => total + Number(item.quantita), 0)
    return quantity ? `${label}: ${quantity}` : null
  }).filter(Boolean).join(' · ')

  const apply = async () => {
    if (!selected.length) return
    const label = isAdmin ? states[targetState] : 'Pagato (intera prenotazione)'
    if (!await showConfirm(`Confermi lo stato "${label}" per ${selected.length} ${isAdmin ? 'righe articolo' : 'prenotazioni'} selezionate?`)) return
    setBusy(true)
    try {
      const response = await axios.post(isAdmin ? '/api/admin/articoli-prenotati/stato' : '/api/admin/prenotazioni-capo/paga',
        isAdmin ? { ids: selected, stato: targetState } : { prenotazioneIds: selected })
      await load()
      showMessage(`${response.data.aggiornati} articoli aggiornati.${response.data.emailInCoda ? ` ${response.data.emailInCoda} email in coda per l’invio automatico.` : ''}`, 'Aggiornamento completato')
    } catch (error) {
      console.error('Errore modifica stato:', error)
      showMessage(error.response?.data?.error || 'Errore aggiornamento stato', 'Errore')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="booking-management">
      <div className="management-header">
        <h3>{isAdmin ? 'Articoli prenotati per taglia' : 'Prenotazioni delle tue branche'}</h3>
        {isAdmin && <div className="header-controls">
          <button className="btn-secondary" onClick={() => { setArchived(!archived); setDetails(null) }} disabled={busy}>
            {archived ? 'Mostra attive' : 'Storico archiviate'}
          </button>
          <Link className="btn-secondary" to="/admin/per-prenotazione">Gestisci per prenotazione</Link>
        </div>}
      </div>
      {isAdmin && notifications && <p role="status">
        {notifications.errore || `Email in coda: ${notifications.inCoda}. Invii con errore: ${notifications.conErrore} (ritentati automaticamente).`}
      </p>}
      {!isAdmin && <p>Il pagamento riguarda tutta la prenotazione. Gli stati Ordinato, Ricevuto e Non disponibile vengono conservati.</p>}
      <div className="catalog-filters admin-filters">
        <div className="filter-row">
          <input type="search" aria-label="Cerca prenotazioni" placeholder={isAdmin ? 'Articolo, taglia, nome o email' : 'Nome o email'} value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
          <select aria-label="Branca" value={filters.branca} onChange={e => setFilters({ ...filters, branca: e.target.value })}>
            <option value="">Tutte le branche</option>
            {[...new Set(rows.map(row => row.branca_riferimento))].filter(Boolean).sort().map(branch => <option key={branch}>{branch}</option>)}
          </select>
          {isAdmin && <select aria-label="Filtra stato" value={filters.stato} onChange={e => setFilters({ ...filters, stato: e.target.value })}>
            <option value="">Tutti gli stati</option>
            {Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>}
          <input type="date" aria-label="Data da" value={filters.da} onChange={e => setFilters({ ...filters, da: e.target.value })} />
          <input type="date" aria-label="Data a" value={filters.a} onChange={e => setFilters({ ...filters, a: e.target.value })} />
        </div>
      </div>
      {!archived && <div className="header-controls">
        <span>{selected.length} {isAdmin ? 'righe articolo' : 'prenotazioni'} selezionate</span>
        {isAdmin && <select aria-label="Nuovo stato" value={targetState} onChange={e => setTargetState(e.target.value)} disabled={busy}>
          {Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>}
        <button className="btn-primary" disabled={!selected.length || busy || loading} onClick={apply}>
          {busy ? 'Aggiornamento...' : isAdmin ? 'Modifica stato selezionati' : 'Segna prenotazioni pagate'}
        </button>
      </div>}
      {error && <div className="error-message" role="alert">{error} <button onClick={load}>Riprova</button></div>}
      {loading ? <div className="loading">Caricamento prenotazioni...</div> : !error && <div className="bookings-table">
        <table>
          <thead><tr>
            {!archived && <th><input type="checkbox" aria-label="Seleziona tutti i risultati" checked={allSelected} disabled={busy || !allIds.length} onChange={e => toggle(allIds, e.target.checked)} /></th>}
            {isAdmin ? <><th>Articolo</th><th>Taglia</th><th>Quantità</th><th>Stati</th></> : <><th>Nome</th><th>Email</th><th>Branca</th><th>Data</th><th>Totale</th><th>Pagamento</th></>}
            <th>Dettagli</th>
          </tr></thead>
          <tbody>{groups.map(group => <tr key={group.key}>
            {!archived && <td><input type="checkbox" aria-label={`Seleziona ${isAdmin ? group.nome : group.nome_prenotante}`} checked={selection(group)} disabled={busy || !eligible(group)} onChange={e => toggle(idsFor(group), e.target.checked)} /></td>}
            {isAdmin ? <>
              <td>{group.nome}{group.specialita ? ` — ${group.specialita}` : ''}{Number(group.usato) === 1 ? ' (Usato)' : ''}</td>
              <td>{group.taglia || 'Taglia unica'}</td>
              <td>{group.items.reduce((sum, item) => sum + Number(item.quantita), 0)}</td>
              <td>{summary(group.items)}</td>
            </> : <>
              <td>{group.nome_prenotante}</td><td>{group.email_prenotante}</td><td>{group.branca_riferimento}</td><td>{date(group.data_prenotazione)}</td>
              <td>{money(group.items.reduce((sum, item) => sum + item.quantita * item.prezzo_unitario, 0))}</td>
              <td>{group.items.every(paid) ? 'Pagato' : group.items.some(paid) ? 'Parzialmente pagato' : 'Da pagare'}</td>
            </>}
            <td><button className="btn-small btn-view" onClick={() => setDetails(group.key)}>Dettagli</button></td>
          </tr>)}</tbody>
        </table>
        {!groups.length && <p>Nessuna prenotazione trovata.</p>}
      </div>}
      {detailGroup && <div className="modal-overlay" onClick={() => setDetails(null)}>
        <div className="modal modal-large" role="dialog" aria-modal="true" aria-label="Dettagli prenotazioni" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>{isAdmin ? `${detailGroup.nome} — ${detailGroup.taglia || 'Taglia unica'}` : detailGroup.nome_prenotante}</h3>
            <button className="btn-close" aria-label="Chiudi dettagli" onClick={() => setDetails(null)}>×</button>
          </div>
          <div className="modal-content bookings-table"><table className="detail-table">
            <thead><tr>{isAdmin && !archived && <th>Seleziona</th>}<th>{isAdmin ? 'Nome' : 'Articolo'}</th>{isAdmin && <><th>Email</th><th>Branca</th><th>Data</th></>}<th>Quantità</th><th>Stato</th><th>Pagamento</th></tr></thead>
            <tbody>{detailGroup.items.map(item => <tr key={item.id}>
              {isAdmin && !archived && <td><input type="checkbox" aria-label={`Seleziona ordine di ${item.nome_prenotante}`} checked={selected.includes(item.id)} disabled={busy} onChange={e => toggle([item.id], e.target.checked)} /></td>}
              <td>{isAdmin ? item.nome_prenotante : `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}${item.specialita ? ` — ${item.specialita}` : ''}`}</td>
              {isAdmin && <><td>{item.email_prenotante}</td><td>{item.branca_riferimento}</td><td>{date(item.data_prenotazione)}</td></>}
              <td>{item.quantita}</td><td>{states[item.stato]}</td><td>{paid(item) ? 'Pagato' : 'Da pagare'}</td>
            </tr>)}</tbody>
          </table></div>
          {isAdmin && !archived && <button className="btn-primary" disabled={busy || !selected.length} onClick={apply}>Applica {states[targetState]} ai selezionati ({selected.length})</button>}
        </div>
      </div>}
      {dialogElement}
    </div>
  )
}
