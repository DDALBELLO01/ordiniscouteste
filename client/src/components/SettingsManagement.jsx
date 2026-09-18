import { useState, useEffect } from 'react'
import axios from 'axios'
import '../styles/components.css'
import { useAppDialog } from './AppDialog'

const branches = ['Cerchio', 'Branco', 'Riparto Ginestra', 'Riparto Sorgente', 'Riparto Atheste', 'Clan', 'Fuoco', 'RS']

export default function SettingsManagement() {
  const { showMessage, dialogElement } = useAppDialog()
  const [emails, setEmails] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchEmails()
  }, [])

  const fetchEmails = async () => {
    try {
      const response = await axios.get('/api/admin/config/email-branche')
      const savedEmails = response.data.emails || {}
      setEmails({
        ...savedEmails,
        Branco: savedEmails.Branco || savedEmails.Lupetti || '',
        Cerchio: savedEmails.Cerchio || savedEmails.Coccinelle || '',
        Clan: savedEmails.Clan || savedEmails.Rover || '',
        RS: savedEmails.RS || savedEmails.Capi || ''
      })
      setLoading(false)
    } catch (error) {
      console.error('Errore caricamento email branche:', error)
      setLoading(false)
    }
  }

  const handleChange = (branca, value) => {
    setEmails(prev => ({ ...prev, [branca]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const normalizedEmails = { ...emails }
      const legacyBranches = ['Coccinelle', 'Lupetti', 'Guide', 'Esploratori', 'Scolte', 'Rover', 'Capi', 'Tutti']
      legacyBranches.forEach(legacyBranch => {
        delete normalizedEmails[legacyBranch]
      })
      await axios.put('/api/admin/config/email-branche', { emails: normalizedEmails })
      showMessage('Email dei capi unità salvate con successo!', 'Salvataggio completato')
    } catch (error) {
      console.error('Errore salvataggio email branche:', error)
      showMessage('Errore salvataggio: ' + (error.response?.data?.error || error.message), 'Errore')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="loading">Caricamento impostazioni...</div>
  }

  return (
    <>
    <div className="settings-management">
      <div className="management-header">
        <h3>⚙️ Impostazioni</h3>
      </div>

      <div className="detail-section">
        <h4>📧 Email Capi Unità per Branca</h4>
        <div className="form-group-grid">
          {branches.map(branca => (
            <div className="form-group" key={branca}>
              <label>{branca}:</label>
              <input
                type="email"
                placeholder="email@esempio.it"
                value={emails[branca] || ''}
                onChange={(e) => handleChange(branca, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Salvataggio...' : '💾 Salva Email Branche'}
          </button>
        </div>
      </div>

    </div>
    {dialogElement}
    </>
  )
}
