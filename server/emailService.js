import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function buildBookingStatusMessage(booking) {
  const messages = {
    ricevuto: ['Articoli ricevuti', 'I seguenti articoli sono arrivati. Contatta i responsabili per concordare il ritiro.'],
    non_disponibile: ['Articoli non disponibili', 'I seguenti articoli non sono disponibili. Contatta i responsabili per informazioni e per eventuali importi già versati.']
  };
  const message = messages[booking.stato];
  if (!message) throw new Error('Stato email non valido');
  const items = booking.items.map(item =>
    `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}${item.specialita ? ` - ${item.specialita}` : ''}: ${item.quantita}`
  );
  const itemRows = booking.items.map(item => `
    <tr>
      <td style="padding:14px 10px;border-bottom:1px solid #e2e8f0;word-break:break-word;">
        <strong>${escapeHtml(item.nome)}</strong>
        ${item.taglia ? `<br><span style="color:#64748b;">Taglia: ${escapeHtml(item.taglia)}</span>` : ''}
        ${item.specialita ? `<br><span style="color:#64748b;">${escapeHtml(item.specialita)}</span>` : ''}
      </td>
      <td align="center" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.quantita)}</td>
    </tr>`).join('');
  const received = booking.stato === 'ricevuto';
  const statusLabel = received ? 'ARTICOLI RICEVUTI' : 'NON DISPONIBILI';
  const statusStyle = received
    ? 'background-color:#f0fdf4;color:#166534;'
    : 'background-color:#fef2f2;color:#991b1b;';
  const text = `Ciao ${booking.nome_prenotante},\n\n${message[1]}\n\n${items.join('\n')}\n\nPrenotazione: ${booking.id}`;
  return {
    from: process.env.SMTP_USER,
    to: booking.email_prenotante,
    subject: `${message[0]} - Prenotazione Scout ${booking.id}`,
    text,
    html: `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(message[1])}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
        <tr><td style="padding:28px 24px;background-color:#2c5282;border-radius:12px 12px 0 0;color:#ffffff;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;font-weight:bold;">ORDINI SCOUT · PRENOTAZIONI</p>
          <h1 style="margin:0;font-size:26px;line-height:1.3;">${escapeHtml(message[0])}</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.5;">${escapeHtml(message[1])}</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 20px;"><span style="display:inline-block;padding:7px 12px;${statusStyle}border-radius:6px;font-size:13px;font-weight:bold;">${statusLabel}</span></p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Ciao ${escapeHtml(booking.nome_prenotante)},</p>
          <h2 style="margin:0 0 14px;font-size:18px;">Articoli</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;line-height:1.5;">
            <thead><tr style="background-color:#f1f5f9;color:#475569;">
              <th scope="col" align="left" style="padding:10px;">Articolo</th>
              <th scope="col" align="center" style="padding:10px;">Qtà</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:18px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;word-break:break-word;">
          <strong>Numero prenotazione</strong><br>${escapeHtml(booking.id)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  };
}

export async function sendBookingStatusEmail(booking) {
  if (!transporter) throw new Error('Servizio email non inizializzato');
  await sendMailWithRetry(buildBookingStatusMessage(booking));
}

export function buildLeaderBookingMessage(booking) {
  const total = booking.items.reduce((sum, item) => sum + Number(item.quantita) * Number(item.prezzo_unitario), 0);
  const items = booking.items.map(item =>
    `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}${item.specialita ? ` - ${item.specialita}` : ''}: ${item.quantita} × € ${Number(item.prezzo_unitario).toFixed(2)}`
  );
  const text = [
    'Nuova prenotazione confermata dal carrello.',
    `Nome: ${booking.nome_prenotante}`,
    `Email: ${booking.email_prenotante}`,
    `Branca: ${booking.branca_riferimento}`,
    `Prenotazione: ${booking.id}`,
    `Data: ${new Date(booking.data_prenotazione).toLocaleString('it-IT')}`,
    '', ...items, '', `Totale da pagare: € ${total.toFixed(2)}`,
    ...(booking.note ? [`Note: ${booking.note}`] : [])
  ].join('\n');
  const itemRows = booking.items.map(item => `
    <tr>
      <td style="padding:14px 10px;border-bottom:1px solid #e2e8f0;word-break:break-word;">
        <strong>${escapeHtml(item.nome)}</strong>
        ${item.taglia ? `<br><span style="color:#64748b;">Taglia: ${escapeHtml(item.taglia)}</span>` : ''}
        ${item.specialita ? `<br><span style="color:#64748b;">${escapeHtml(item.specialita)}</span>` : ''}
      </td>
      <td align="center" style="padding:14px 6px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.quantita)}</td>
      <td align="right" style="padding:14px 6px;border-bottom:1px solid #e2e8f0;">€&nbsp;${Number(item.prezzo_unitario).toFixed(2)}</td>
      <td align="right" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">€&nbsp;${(Number(item.quantita) * Number(item.prezzo_unitario)).toFixed(2)}</td>
    </tr>`).join('');
  return {
    from: process.env.SMTP_USER,
    to: booking.destinatario,
    subject: `[CAPO UNITÀ] Nuova prenotazione - ${booking.id}`,
    text,
    html: `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Nuova prenotazione per ${escapeHtml(booking.branca_riferimento)}. Totale da pagare: € ${total.toFixed(2)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
        <tr><td style="padding:28px 24px;background-color:#2c5282;border-radius:12px 12px 0 0;color:#ffffff;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;font-weight:bold;">ORDINI SCOUT · CAPI UNITÀ</p>
          <h1 style="margin:0;font-size:26px;line-height:1.3;">Nuova prenotazione</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.5;">Una persona ha confermato il proprio ordine dal carrello.</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 20px;"><span style="display:inline-block;padding:7px 12px;background-color:#fff7ed;color:#9a3412;border-radius:6px;font-size:13px;font-weight:bold;">DA PAGARE</span></p>
          <h2 style="margin:0 0 14px;font-size:18px;">Dati del prenotante</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
            <tr><td style="padding:5px 12px 5px 0;color:#64748b;width:85px;">Nome</td><td style="padding:5px 0;word-break:break-word;"><strong>${escapeHtml(booking.nome_prenotante)}</strong></td></tr>
            <tr><td style="padding:5px 12px 5px 0;color:#64748b;">Email</td><td style="padding:5px 0;word-break:break-word;">${escapeHtml(booking.email_prenotante)}</td></tr>
            <tr><td style="padding:5px 12px 5px 0;color:#64748b;">Branca</td><td style="padding:5px 0;">${escapeHtml(booking.branca_riferimento)}</td></tr>
            <tr><td style="padding:5px 12px 5px 0;color:#64748b;">Data</td><td style="padding:5px 0;">${escapeHtml(new Date(booking.data_prenotazione).toLocaleString('it-IT'))}</td></tr>
          </table>
          <h2 style="margin:26px 0 14px;font-size:18px;">Articoli prenotati</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;line-height:1.5;">
            <thead><tr style="background-color:#f1f5f9;color:#475569;">
              <th scope="col" align="left" style="padding:10px;">Articolo</th>
              <th scope="col" align="center" style="padding:10px 6px;">Qtà</th>
              <th scope="col" align="right" style="padding:10px 6px;">Prezzo</th>
              <th scope="col" align="right" style="padding:10px;">Totale</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background-color:#eff6ff;border-radius:8px;">
            <tr><td style="padding:18px 14px;color:#1e3a5f;font-size:14px;font-weight:bold;">Totale da pagare</td><td align="right" style="padding:18px 14px;color:#1e3a5f;font-size:24px;font-weight:bold;">€&nbsp;${total.toFixed(2)}</td></tr>
          </table>
          ${booking.note ? `<div style="margin-top:22px;padding:16px;background-color:#f8fafc;border-left:3px solid #94a3b8;border-radius:4px;"><h2 style="margin:0 0 8px;font-size:15px;">Note del prenotante</h2><p style="margin:0;font-size:14px;line-height:1.6;word-break:break-word;">${escapeHtml(booking.note).replaceAll('\n', '<br>')}</p></div>` : ''}
          <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#475569;">Accedi alla sezione Prenotazioni con il tuo account capo unità per gestire l’ordine e registrare il pagamento.</p>
        </td></tr>
        <tr><td style="padding:18px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;word-break:break-word;">
          <strong>Numero prenotazione</strong><br>${escapeHtml(booking.id)}<br>
          Notifica automatica per la branca ${escapeHtml(booking.branca_riferimento)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  };
}

export async function sendLeaderBookingEmail(booking) {
  if (!transporter) throw new Error('Servizio email non inizializzato');
  await sendMailWithRetry(buildLeaderBookingMessage(booking));
}

export function buildOrderedItemsMessage(booking) {
  const purchaseTotal = booking.items.reduce((sum, item) => sum + Number(item.quantita) * Number(item.costo_acquisto), 0);
  const salesTotal = booking.items.reduce((sum, item) => sum + Number(item.quantita) * Number(item.prezzo_unitario), 0);
  const text = [
    `Articoli appena ordinati - Branca ${booking.branca_riferimento}`,
    '',
    ...booking.items.map(item =>
      `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}${item.specialita ? ` - ${item.specialita}` : ''}: ${item.quantita}` +
      ` | Costo di acquisto: € ${(Number(item.quantita) * Number(item.costo_acquisto)).toFixed(2)}` +
      ` | Vendita ai clienti: € ${(Number(item.quantita) * Number(item.prezzo_unitario)).toFixed(2)}`
    ),
    '',
    `Totale costo di acquisto: € ${purchaseTotal.toFixed(2)}`,
    `Totale vendita da chiedere ai clienti: € ${salesTotal.toFixed(2)}`
  ].join('\n');
  const itemRows = booking.items.map(item => `
    <tr>
      <td style="padding:14px 10px;border-bottom:1px solid #e2e8f0;word-break:break-word;">
        <strong>${escapeHtml(item.nome)}</strong>
        ${item.taglia ? `<br><span style="color:#64748b;">Taglia: ${escapeHtml(item.taglia)}</span>` : ''}
        ${item.specialita ? `<br><span style="color:#64748b;">${escapeHtml(item.specialita)}</span>` : ''}
      </td>
      <td align="center" style="padding:14px 6px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.quantita)}</td>
      <td align="right" style="padding:14px 6px;border-bottom:1px solid #e2e8f0;">€&nbsp;${(Number(item.quantita) * Number(item.costo_acquisto)).toFixed(2)}</td>
      <td align="right" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;">€&nbsp;${(Number(item.quantita) * Number(item.prezzo_unitario)).toFixed(2)}</td>
    </tr>`).join('');
  return {
    from: process.env.SMTP_USER,
    to: booking.destinatario,
    subject: `[CAPO UNITÀ] Articoli ordinati - ${booking.branca_riferimento}`,
    text,
    html: `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
        <tr><td style="padding:28px 24px;background-color:#2c5282;border-radius:12px 12px 0 0;color:#ffffff;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;font-weight:bold;">ORDINI SCOUT · CAPI UNITÀ</p>
          <h1 style="margin:0;font-size:26px;line-height:1.3;">Articoli ordinati</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.5;">Branca ${escapeHtml(booking.branca_riferimento)}</p>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Questi articoli sono appena passati allo stato Ordinato. Gli importi riguardano soltanto questa operazione.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;line-height:1.5;">
            <thead><tr style="background-color:#f1f5f9;color:#475569;">
              <th scope="col" align="left" style="padding:10px;">Articolo</th>
              <th scope="col" align="center" style="padding:10px 6px;">Qtà</th>
              <th scope="col" align="right" style="padding:10px 6px;">Costo di acquisto</th>
              <th scope="col" align="right" style="padding:10px;">Vendita ai clienti</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background-color:#eff6ff;border-radius:8px;font-size:14px;font-weight:bold;color:#1e3a5f;">
            <tr><td style="padding:18px 14px;">Totale costo di acquisto</td><td align="right" style="padding:18px 14px;font-size:22px;">€&nbsp;${purchaseTotal.toFixed(2)}</td></tr>
            <tr><td style="padding:18px 14px;">Totale vendita da chiedere ai clienti</td><td align="right" style="padding:18px 14px;font-size:22px;">€&nbsp;${salesTotal.toFixed(2)}</td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  };
}

export async function sendOrderedItemsEmail(booking) {
  if (!transporter) throw new Error('Servizio email non inizializzato');
  await sendMailWithRetry(buildOrderedItemsMessage(booking));
}

export function initializeEmailService() {
  const port = Number(process.env.SMTP_PORT || 587);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });

  transporter.verify()
    .then(() => console.log(`SMTP pronto: ${process.env.SMTP_USER}`))
    .catch(error => console.error('Errore verifica SMTP:', {
      code: error.code,
      responseCode: error.responseCode,
      response: error.response,
      message: error.message
    }));

  return transporter;
}

async function sendMailWithRetry(message) {
  try {
    return await transporter.sendMail(message);
  } catch (firstError) {
    if (firstError.code !== 'ETIMEDOUT') throw firstError;
    transporter = initializeEmailService();
    return transporter.sendMail(message);
  }
}

export async function sendBookingEmail(email, bookingData) {
  if (!transporter) {
    console.error('Email service not initialized');
    return false;
  }

  try {
    const itemsHtml = bookingData.items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.nome}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.quantita}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">€ ${Number(item.prezzo_unitario || 0).toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">€ ${(Number(item.quantita || 0) * Number(item.prezzo_unitario || 0)).toFixed(2)}</td>
      </tr>
    `).join('');

    const totale = bookingData.items.reduce((sum, item) => sum + (Number(item.quantita || 0) * Number(item.prezzo_unitario || 0)), 0);

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c5282; color: white; padding: 20px; border-radius: 5px; }
            .content { padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .footer { background-color: #f7fafc; padding: 15px; border-radius: 5px; margin-top: 20px; }
            .total { font-size: 18px; font-weight: bold; text-align: right; padding: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Conferma Prenotazione Scout</h2>
            </div>
            <div class="content">
              <p>Ciao ${bookingData.nome_prenotante},</p>
              <p><strong>Branca di riferimento:</strong> ${bookingData.branca_riferimento}</p>
              <p>Grazie per la tua prenotazione! Ecco il riepilogo:</p>
              
              <table>
                <thead>
                  <tr style="background-color: #e2e8f0;">
                    <th style="padding: 10px; text-align: left;">Prodotto</th>
                    <th style="padding: 10px; text-align: left;">Quantità</th>
                    <th style="padding: 10px; text-align: left;">Prezzo Unit.</th>
                    <th style="padding: 10px; text-align: left;">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <div class="total">
                Totale: € ${totale.toFixed(2)}
              </div>

              <div class="footer">
                <p><strong>Numero Prenotazione:</strong> ${bookingData.id}</p>
                <p><strong>Data:</strong> ${new Date(bookingData.data_prenotazione).toLocaleDateString('it-IT')}</p>
                ${bookingData.note ? `<p><strong>Note:</strong> ${bookingData.note}</p>` : ''}
              </div>

              <p style="margin-top: 20px; color: #666;">
                Se hai domande contattaci a: ${process.env.SMTP_FROM}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    await sendMailWithRetry({
      from: process.env.SMTP_USER,
      to: email,
      subject: `Conferma Prenotazione Scout - ${bookingData.id}`,
      html: htmlContent
    });

    console.log(`Email inviata a: ${email}`);
    return true;
  } catch (error) {
    console.error('Errore invio email:', { code: error.code, responseCode: error.responseCode, response: error.response, message: error.message });
    return false;
  }
}

export async function sendAdminNotification(bookingData) {
  if (!transporter) {
    console.error('Email service not initialized');
    return false;
  }

  try {
    const itemsHtml = bookingData.items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.nome}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.quantita}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #c53030; color: white; padding: 20px; border-radius: 5px; }
            .content { padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Nuova Prenotazione - Notifica Admin</h2>
            </div>
            <div class="content">
              <p>Nuova prenotazione ricevuta:</p>
              <p><strong>Nome:</strong> ${bookingData.nome_prenotante}</p>
              <p><strong>Email:</strong> ${bookingData.email_prenotante}</p>
              <p><strong>Branca di riferimento:</strong> ${bookingData.branca_riferimento}</p>
              <p><strong>ID Prenotazione:</strong> ${bookingData.id}</p>
              
              <table>
                <thead>
                  <tr style="background-color: #e2e8f0;">
                    <th style="padding: 10px; text-align: left;">Prodotto</th>
                    <th style="padding: 10px; text-align: left;">Quantità</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;

    await sendMailWithRetry({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: `[ADMIN] Nuova Prenotazione - ${bookingData.id}`,
      html: htmlContent
    });

    return true;
  } catch (error) {
    console.error('Errore invio notifica admin:', { code: error.code, responseCode: error.responseCode, response: error.response, message: error.message });
    return false;
  }
}

// Riepilogo inviato al capo unità di una branca quando le prenotazioni vengono chiuse
export async function sendBrancaSummaryEmail(email, branca, bookings) {
  if (!transporter) {
    console.error('Email service not initialized');
    return false;
  }

  try {
    const totaleGenerale = bookings.reduce(
      (sum, b) => sum + b.items.reduce((s, i) => s + Number(i.quantita || 0) * Number(i.prezzo_unitario || 0), 0),
      0
    );

    const bookingsHtml = bookings.map(b => {
      const itemsHtml = b.items.map(item => `
        <tr>
          <td style="padding: 6px; border-bottom: 1px solid #ddd;">${item.nome}${item.specialita ? ` - ${item.specialita}` : ''}</td>
          <td style="padding: 6px; border-bottom: 1px solid #ddd;">${item.quantita}</td>
          <td style="padding: 6px; border-bottom: 1px solid #ddd;">€ ${Number(item.prezzo_unitario || 0).toFixed(2)}</td>
          <td style="padding: 6px; border-bottom: 1px solid #ddd;">€ ${(Number(item.quantita || 0) * Number(item.prezzo_unitario || 0)).toFixed(2)}</td>
        </tr>
      `).join('');
      const totaleBooking = b.items.reduce((s, i) => s + Number(i.quantita || 0) * Number(i.prezzo_unitario || 0), 0);

      return `
        <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px;">
          <p style="margin: 0 0 8px;"><strong>${b.prenotazione.nome_prenotante}</strong> (${b.prenotazione.email_prenotante})</p>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #e2e8f0;">
                <th style="padding: 6px; text-align: left;">Prodotto</th>
                <th style="padding: 6px; text-align: left;">Quantità</th>
                <th style="padding: 6px; text-align: left;">Prezzo Unit.</th>
                <th style="padding: 6px; text-align: left;">Totale</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <p style="margin: 8px 0 0; text-align: right;"><strong>Totale prenotazione: € ${totaleBooking.toFixed(2)}</strong></p>
        </div>
      `;
    }).join('');

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 700px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c5282; color: white; padding: 20px; border-radius: 5px; }
            .total { font-size: 18px; font-weight: bold; text-align: right; padding: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Riepilogo Ordini - Branca ${branca}</h2>
            </div>
            <div class="content" style="padding: 20px 0;">
              <p>Le prenotazioni sono state chiuse. Ecco il riepilogo di tutti gli ordini per la branca <strong>${branca}</strong>:</p>
              ${bookingsHtml}
              <div class="total">
                Totale complessivo branca: € ${totaleGenerale.toFixed(2)}
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await sendMailWithRetry({
      from: process.env.SMTP_USER,
      to: email,
      subject: `Riepilogo Ordini Chiusura Prenotazioni - ${branca}`,
      html: htmlContent
    });

    console.log(`Riepilogo branca ${branca} inviato a: ${email}`);
    return true;
  } catch (error) {
    console.error(`Errore invio riepilogo branca ${branca}:`, { code: error.code, responseCode: error.responseCode, response: error.response, message: error.message });
    return false;
  }
}
