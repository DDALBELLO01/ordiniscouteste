import { useEffect, useState } from 'react'
import axios from 'axios'
import { useAppDialog } from './AppDialog'
import '../styles/components.css'

const branches = ['Cerchio', 'Branco', 'Riparto Ginestra', 'Riparto Sorgente', 'Riparto Atheste', 'Clan', 'Fuoco', 'RS']

export default function LeaderAccounts() {
  const { showMessage, showConfirm, dialogElement } = useAppDialog()
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState({ nome: '', email: '', password: '', branche: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    try {
      const response = await axios.get('/api/admin/capi-unita')
      setAccounts(response.data)
      setError('')
    } catch (error) {
      console.error('Errore caricamento capi unità:', error)
      setError(error.response?.data?.error || 'Impossibile caricare gli account')
    }
  }
  useEffect(() => { load() }, [])

  const create = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      await axios.post('/api/admin/capi-unita', form)
      setForm({ nome: '', email: '', password: '', branche: [] })
      await load()
      showMessage('Account creato. Comunica le credenziali al capo unità tramite un canale sicuro.', 'Account creato')
    } catch (error) {
      console.error('Errore creazione account:', error)
      showMessage(error.response?.data?.error || 'Errore creazione account', 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const remove = async account => {
    if (!await showConfirm(`Eliminare l’account di ${account.nome}? L’accesso verrà revocato.`)) return
    setBusy(true)
    try {
      await axios.delete(`/api/admin/capi-unita/${account.id}`)
      await load()
    } catch (error) {
      console.error('Errore eliminazione account:', error)
      showMessage(error.response?.data?.error || 'Errore eliminazione account', 'Errore')
    } finally {
      setBusy(false)
    }
  }

  return <div className="booking-management">
    <h3>Account Capi Unità</h3>
    <form onSubmit={create} className="edit-booking-form leader-account-form">
      <div className="form-group-grid leader-account-fields">
        <div className="form-group">
          <label htmlFor="leader-name">Nome</label>
          <input id="leader-name" required placeholder="Nome del capo unità" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} autoComplete="name" disabled={busy} />
        </div>
        <div className="form-group">
          <label htmlFor="leader-email">Email</label>
          <input id="leader-email" type="email" required placeholder="nome@esempio.it" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" disabled={busy} />
        </div>
        <div className="form-group">
          <label htmlFor="leader-password">Password</label>
          <input id="leader-password" type="password" required minLength={10} placeholder="Almeno 10 caratteri" aria-describedby="leader-password-help" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" disabled={busy} />
          <small id="leader-password-help">Usa almeno 10 caratteri e comunica la password tramite un canale sicuro.</small>
        </div>
      </div>
      <fieldset className="leader-branches" disabled={busy}><legend>Branca assegnata</legend>
        <p>Seleziona una sola branca di cui il capo può gestire i pagamenti.</p>
        <div className="leader-branch-options">
          {branches.map(branch => <label key={branch} className={`leader-branch-option${form.branche.includes(branch) ? ' is-selected' : ''}`}>
            <input type="radio" name="leader-branch" value={branch} required checked={form.branche.includes(branch)} onChange={() => setForm({ ...form, branche: [branch] })} />
            <span>{branch}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="form-actions"><button className="btn-primary" disabled={busy || form.branche.length !== 1}>{busy ? 'Operazione in corso...' : 'Crea account'}</button></div>
    </form>
    {error && <div className="error-message" role="alert">{error} <button onClick={load}>Riprova</button></div>}
    <div className="bookings-table"><table><thead><tr><th>Nome</th><th>Email</th><th>Branca</th><th>Azioni</th></tr></thead>
      <tbody>{accounts.map(account => <tr key={account.id}>
        <td>{account.nome}</td><td>{account.email}</td><td>{account.branche.join(', ')}</td>
        <td><button className="btn-small btn-delete" disabled={busy} onClick={() => remove(account)}>Elimina account</button></td>
      </tr>)}</tbody>
    </table></div>
    {dialogElement}
  </div>
}
