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
    <form onSubmit={create} className="edit-booking-form">
      <div className="form-group-grid">
        <label>Nome<input required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} autoComplete="name" /></label>
        <label>Email<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" /></label>
        <label>Password (minimo 10 caratteri)<input type="password" required minLength={10} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></label>
      </div>
      <fieldset><legend>Branche assegnate</legend>
        {branches.map(branch => <label key={branch} style={{ display: 'block' }}>
          <input type="checkbox" checked={form.branche.includes(branch)} onChange={e => setForm({ ...form,
            branche: e.target.checked ? [...form.branche, branch] : form.branche.filter(value => value !== branch) })} /> {branch}
        </label>)}
      </fieldset>
      <button className="btn-primary" disabled={busy || !form.branche.length}>Crea account</button>
    </form>
    {error && <div className="error-message" role="alert">{error} <button onClick={load}>Riprova</button></div>}
    <div className="bookings-table"><table><thead><tr><th>Nome</th><th>Email</th><th>Branche</th><th>Azioni</th></tr></thead>
      <tbody>{accounts.map(account => <tr key={account.id}>
        <td>{account.nome}</td><td>{account.email}</td><td>{account.branche.join(', ')}</td>
        <td><button className="btn-small btn-delete" disabled={busy} onClick={() => remove(account)}>Elimina account</button></td>
      </tr>)}</tbody>
    </table></div>
    {dialogElement}
  </div>
}
