import { useState } from 'react'

export function useAppDialog() {
  const [dialog, setDialog] = useState(null)

  const showMessage = (message, title = 'Avviso') => new Promise(resolve => {
    setDialog({ type: 'message', title, message, resolve })
  })

  const showConfirm = (message, title = 'Conferma') => new Promise(resolve => {
    setDialog({ type: 'confirm', title, message, resolve })
  })

  const closeDialog = (result) => {
    dialog?.resolve(result)
    setDialog(null)
  }

  const dialogElement = dialog && (
    <div className="app-dialog-overlay" role="presentation" onClick={() => closeDialog(false)}>
      <div className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" onClick={event => event.stopPropagation()}>
        <div className="app-dialog-header">
          <h3 id="app-dialog-title">{dialog.title}</h3>
          <button type="button" className="btn-close" onClick={() => closeDialog(false)} aria-label="Chiudi">×</button>
        </div>
        <p className="app-dialog-message">{dialog.message}</p>
        <div className="app-dialog-actions">
          {dialog.type === 'confirm' && <button type="button" className="btn-secondary" onClick={() => closeDialog(false)}>Annulla</button>}
          <button type="button" className="btn-primary" onClick={() => closeDialog(true)}>{dialog.type === 'confirm' ? 'Conferma' : 'OK'}</button>
        </div>
      </div>
    </div>
  )

  return { showMessage, showConfirm, dialogElement }
}