import { useState } from 'react'
import '../styles/components.css'

export default function BookingForm({ items, onSubmit, submitted }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [brancaRiferimento, setBrancaRiferimento] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const brancheRiferimento = ['Cerchio', 'Branco', 'Riparto Ginestra', 'Riparto Sorgente', 'Riparto Atheste', 'Clan', 'Fuoco','RS']

  const total = items.reduce((sum, item) => sum + (item.quantita * item.prezzo), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await onSubmit({
        nome_prenotante: nome,
        email_prenotante: email,
        branca_riferimento: brancaRiferimento,
        note
      })
      setNome('')
      setEmail('')
      setBrancaRiferimento('')
      setNote('')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return null
  }

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      <h3>Dati Prenotante</h3>
      
      <div className="form-group">
        <label>Nome e Cognome:</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          placeholder="Es. Marco Rossi"
        />
      </div>

      <div className="form-group">
        <label>Email:</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="tua.email@esempio.com"
        />
      </div>

      <div className="form-group">
        <label>Branca di riferimento:</label>
        <select
          value={brancaRiferimento}
          onChange={(e) => setBrancaRiferimento(e.target.value)}
          required
        >
          <option value="">Seleziona la branca</option>
          {brancheRiferimento.map(branca => <option key={branca} value={branca}>{branca}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label>Note (opzionale):</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Es. Urgente, Preferenza per ritiro..."
          rows="3"
        />
      </div>

      <div className="booking-total">
        <strong>Totale: € {total.toFixed(2)}</strong>
      </div>

      <button type="submit" className="btn-primary btn-submit" disabled={loading}>
        {loading ? 'Elaborazione...' : '✓ Conferma Prenotazione'}
      </button>
    </form>
  )
}
