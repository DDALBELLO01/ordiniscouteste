import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const money = value => Number(value).toFixed(2);
const itemName = item => `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}${item.specialita ? ` - ${item.specialita}` : ''}`;
const bookingTotal = items => items.reduce((sum, item) => sum + Number(item.quantita) * Number(item.prezzo_unitario), 0);
const paragraph = text => `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;word-break:break-word;">${escapeHtml(text)}</p>`;
const heading = text => `<h2 style="margin:24px 0 14px;font-size:18px;">${escapeHtml(text)}</h2>`;

function emailLayout({ title, subtitle, audience, preheader = subtitle, content, footer = '' }) {
  return `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
        <tr><td style="padding:28px 24px;background-color:#2c5282;border-radius:12px 12px 0 0;color:#ffffff;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;font-weight:bold;">ORDINI SCOUT · ${escapeHtml(audience)}</p>
          <h1 style="margin:0;font-size:26px;line-height:1.3;">${escapeHtml(title)}</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.5;word-break:break-word;">${escapeHtml(subtitle)}</p>
        </td></tr>
        <tr><td style="padding:24px;">${content}</td></tr>
        <tr><td style="padding:18px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;word-break:break-word;">
          ${footer}${footer ? '<br>' : ''}Notifica automatica di Ordini Scout.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function itemsTable(items, mode = 'sales') {
  const headers = mode === 'quantity'
    ? ['Articolo', 'Qtà']
    : mode === 'ordered' ? ['Articolo', 'Qtà', 'Costo di acquisto', 'Vendita ai clienti']
      : ['Articolo', 'Qtà', 'Prezzo', 'Totale'];
  const rows = items.map(item => {
    const values = mode === 'quantity' ? [] : mode === 'ordered'
      ? [Number(item.quantita) * Number(item.costo_acquisto), Number(item.quantita) * Number(item.prezzo_unitario)]
      : [item.prezzo_unitario, Number(item.quantita) * Number(item.prezzo_unitario)];
    return `<tr>
      <td style="padding:14px 10px;border-bottom:1px solid #e2e8f0;word-break:break-word;">
        <strong>${escapeHtml(item.nome)}</strong>
        ${item.taglia ? `<br><span style="color:#64748b;">Taglia: ${escapeHtml(item.taglia)}</span>` : ''}
        ${item.specialita ? `<br><span style="color:#64748b;">${escapeHtml(item.specialita)}</span>` : ''}
      </td>
      <td align="center" style="padding:14px 6px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.quantita)}</td>
      ${values.map(value => `<td align="right" style="padding:14px 10px;border-bottom:1px solid #e2e8f0;">€&nbsp;${money(value)}</td>`).join('')}
    </tr>`;
  }).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;line-height:1.5;">
    <thead><tr style="background-color:#f1f5f9;color:#475569;">
      ${headers.map((label, index) => `<th scope="col" align="${index === 0 ? 'left' : index === 1 ? 'center' : 'right'}" style="padding:10px;">${escapeHtml(label)}</th>`).join('')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalsTable(totals) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background-color:#eff6ff;border-radius:8px;color:#1e3a5f;font-weight:bold;">
    ${totals.map(([label, total]) => `<tr><td style="padding:18px 14px;font-size:14px;">${escapeHtml(label)}</td><td align="right" style="padding:18px 14px;font-size:24px;">€&nbsp;${money(total)}</td></tr>`).join('')}
  </table>`;
}

function bookingDetails(booking) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
    ${[
      ['Nome', booking.nome_prenotante], ['Email', booking.email_prenotante],
      ['Branca', booking.branca_riferimento],
      ...(booking.genitore_di ? [['Genitore di', booking.genitore_di]] : []),
      ['Data', new Date(booking.data_prenotazione).toLocaleString('it-IT')]
    ].map(([label, value]) => `<tr><td style="padding:5px 12px 5px 0;color:#64748b;width:85px;">${label}</td><td style="padding:5px 0;word-break:break-word;">${escapeHtml(value)}</td></tr>`).join('')}
  </table>`;
}

function bookingNotes(note) {
  return note ? `<div style="margin-top:22px;padding:16px;background-color:#f8fafc;border-left:3px solid #94a3b8;border-radius:4px;">
    <h2 style="margin:0 0 8px;font-size:15px;">Note del prenotante</h2>
    <p style="margin:0;font-size:14px;line-height:1.6;word-break:break-word;">${escapeHtml(note).replaceAll('\n', '<br>')}</p>
  </div>` : '';
}

function bookingFooter(booking) {
  return `<strong>Numero prenotazione</strong><br>${escapeHtml(booking.id)}`;
}

function statusBadge(label) {
  return `<p style="margin:0 0 20px;"><span style="display:inline-block;padding:7px 12px;background-color:#eff6ff;color:#1e3a5f;border-radius:6px;font-size:13px;font-weight:bold;">${escapeHtml(label)}</span></p>`;
}

function bookingText(booking) {
  return [
    `Nome: ${booking.nome_prenotante}`, `Email: ${booking.email_prenotante}`,
    ...(booking.genitore_di ? [`Genitore di: ${booking.genitore_di}`] : []),
    `Branca: ${booking.branca_riferimento}`, `Prenotazione: ${booking.id}`,
    `Data: ${new Date(booking.data_prenotazione).toLocaleString('it-IT')}`
  ];
}

function salesText(items) {
  return items.map(item => `${itemName(item)}: ${item.quantita} × € ${money(item.prezzo_unitario)}`);
}

export function buildBookingStatusMessage(booking) {
  const messages = {
    ricevuto: ['Articoli ricevuti', 'I seguenti articoli sono arrivati. Contatta i responsabili per concordare il ritiro.'],
    non_disponibile: ['Articoli non disponibili', 'I seguenti articoli non sono disponibili. Contatta i responsabili per informazioni e per eventuali importi già versati.']
  };
  const message = messages[booking.stato];
  if (!message) throw new Error('Stato email non valido');
  return {
    from: process.env.SMTP_USER,
    to: booking.email_prenotante,
    subject: `${message[0]} - Prenotazione Scout ${booking.id}`,
    text: `Ciao ${booking.nome_prenotante},\n\n${message[1]}\n\n${booking.items.map(item => `${itemName(item)}: ${item.quantita}`).join('\n')}\n\nPrenotazione: ${booking.id}`,
    html: emailLayout({
      title: message[0], subtitle: message[1], audience: 'PRENOTAZIONI',
      content: statusBadge(booking.stato === 'ricevuto' ? 'ARTICOLI RICEVUTI' : 'NON DISPONIBILI') +
        paragraph(`Ciao ${booking.nome_prenotante},`) + heading('Articoli') + itemsTable(booking.items, 'quantity'),
      footer: bookingFooter(booking)
    })
  };
}

export function buildLeaderBookingMessage(booking) {
  const total = bookingTotal(booking.items);
  return {
    from: process.env.SMTP_USER,
    to: booking.destinatario,
    subject: `[CAPO UNITÀ] Nuova prenotazione - ${booking.id}`,
    text: [
      'Nuova prenotazione confermata dal carrello.', ...bookingText(booking),
      '', ...salesText(booking.items), '', `Totale da pagare: € ${money(total)}`,
      ...(booking.note ? [`Note: ${booking.note}`] : [])
    ].join('\n'),
    html: emailLayout({
      title: 'Nuova prenotazione', audience: 'CAPI UNITÀ',
      subtitle: 'Una persona ha confermato il proprio ordine dal carrello.',
      preheader: `Nuova prenotazione per ${booking.branca_riferimento}. Totale da pagare: € ${money(total)}.`,
      content: statusBadge('DA PAGARE') + heading('Dati del prenotante') + bookingDetails(booking) +
        heading('Articoli prenotati') + itemsTable(booking.items) + totalsTable([['Totale da pagare', total]]) +
        bookingNotes(booking.note) +
        paragraph('Accedi alla sezione Prenotazioni con il tuo account capo unità per gestire l’ordine e registrare il pagamento.'),
      footer: `${bookingFooter(booking)}<br>Notifica automatica per la branca ${escapeHtml(booking.branca_riferimento)}.`
    })
  };
}

export function buildOrderedItemsMessage(booking) {
  const purchaseTotal = booking.items.reduce((sum, item) => sum + Number(item.quantita) * Number(item.costo_acquisto), 0);
  const salesTotal = bookingTotal(booking.items);
  return {
    from: process.env.SMTP_USER,
    to: booking.destinatario,
    subject: `[CAPO UNITÀ] Articoli ordinati - ${booking.branca_riferimento}`,
    text: [
      `Articoli appena ordinati - Branca ${booking.branca_riferimento}`, '',
      ...booking.items.map(item => `${itemName(item)}: ${item.quantita}` +
        ` | Costo di acquisto: € ${money(Number(item.quantita) * Number(item.costo_acquisto))}` +
        ` | Vendita ai clienti: € ${money(Number(item.quantita) * Number(item.prezzo_unitario))}`),
      '', `Totale costo di acquisto: € ${money(purchaseTotal)}`,
      `Totale vendita da chiedere ai clienti: € ${money(salesTotal)}`
    ].join('\n'),
    html: emailLayout({
      title: 'Articoli ordinati', subtitle: `Branca ${booking.branca_riferimento}`, audience: 'CAPI UNITÀ',
      content: paragraph('Questi articoli sono appena passati allo stato Ordinato. Gli importi riguardano soltanto questa operazione.') +
        itemsTable(booking.items, 'ordered') +
        totalsTable([['Totale costo di acquisto', purchaseTotal], ['Totale vendita da chiedere ai clienti', salesTotal]]),
      footer: `Branca ${escapeHtml(booking.branca_riferimento)}`
    })
  };
}

export function buildBookingMessage(email, booking) {
  const total = bookingTotal(booking.items);
  const contact = process.env.SMTP_FROM;
  return {
    from: process.env.SMTP_USER,
    to: email,
    subject: `Conferma Prenotazione Scout - ${booking.id}`,
    text: [
      `Ciao ${booking.nome_prenotante},`, 'Grazie per la tua prenotazione! Ecco il riepilogo:',
      ...bookingText(booking), '', ...salesText(booking.items), '', `Totale: € ${money(total)}`,
      ...(booking.note ? [`Note: ${booking.note}`] : []),
      ...(contact ? [`Se hai domande contattaci a: ${contact}`] : [])
    ].join('\n'),
    html: emailLayout({
      title: 'Conferma Prenotazione Scout', audience: 'PRENOTAZIONI',
      subtitle: 'Grazie per la tua prenotazione! Ecco il riepilogo:',
      content: paragraph(`Ciao ${booking.nome_prenotante},`) + bookingDetails(booking) +
        heading('Articoli prenotati') + itemsTable(booking.items) + totalsTable([['Totale', total]]) +
        bookingNotes(booking.note) + (contact ? paragraph(`Se hai domande contattaci a: ${contact}`) : ''),
      footer: bookingFooter(booking)
    })
  };
}

export function buildAdminNotificationMessage(booking) {
  return {
    from: process.env.SMTP_USER,
    to: process.env.SMTP_USER,
    subject: `[ADMIN] Nuova Prenotazione - ${booking.id}`,
    text: ['Nuova prenotazione ricevuta:', ...bookingText(booking), '',
      ...booking.items.map(item => `${itemName(item)}: ${item.quantita}`)].join('\n'),
    html: emailLayout({
      title: 'Nuova Prenotazione - Notifica Admin', audience: 'ADMIN',
      subtitle: 'Nuova prenotazione ricevuta:',
      content: heading('Dati del prenotante') + bookingDetails(booking) +
        heading('Articoli prenotati') + itemsTable(booking.items, 'quantity'),
      footer: bookingFooter(booking)
    })
  };
}

export function buildBrancaSummaryMessage(email, branca, bookings) {
  const total = bookings.reduce((sum, booking) => sum + bookingTotal(booking.items), 0);
  return {
    from: process.env.SMTP_USER,
    to: email,
    subject: `Riepilogo Ordini Chiusura Prenotazioni - ${branca}`,
    text: [
      `Riepilogo Ordini - Branca ${branca}`, 'Le prenotazioni sono state chiuse.', '',
      ...bookings.flatMap(({ prenotazione, items }) => [
        ...bookingText(prenotazione), ...salesText(items),
        `Totale prenotazione: € ${money(bookingTotal(items))}`, ''
      ]),
      `Totale complessivo branca: € ${money(total)}`
    ].join('\n'),
    html: emailLayout({
      title: `Riepilogo Ordini - Branca ${branca}`, audience: 'CAPI UNITÀ',
      subtitle: 'Le prenotazioni sono state chiuse. Ecco il riepilogo di tutti gli ordini.',
      content: bookings.map(({ prenotazione, items }) =>
        heading(prenotazione.nome_prenotante) + bookingDetails(prenotazione) +
        paragraph(`Numero prenotazione: ${prenotazione.id}`) + itemsTable(items) +
        totalsTable([['Totale prenotazione', bookingTotal(items)]])
      ).join('') + totalsTable([['Totale complessivo branca', total]]),
      footer: `Branca ${escapeHtml(branca)}`
    })
  };
}

export async function sendBookingStatusEmail(booking) {
  if (!transporter) throw new Error('Servizio email non inizializzato');
  await sendMailWithRetry(buildBookingStatusMessage(booking));
}

export async function sendLeaderBookingEmail(booking) {
  if (!transporter) throw new Error('Servizio email non inizializzato');
  await sendMailWithRetry(buildLeaderBookingMessage(booking));
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
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  transporter.verify()
    .then(() => console.log(`SMTP pronto: ${process.env.SMTP_USER}`))
    .catch(error => console.error('Errore verifica SMTP:', {
      code: error.code, responseCode: error.responseCode, response: error.response, message: error.message
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
    await sendMailWithRetry(buildBookingMessage(email, bookingData));
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
    await sendMailWithRetry(buildAdminNotificationMessage(bookingData));
    return true;
  } catch (error) {
    console.error('Errore invio notifica admin:', { code: error.code, responseCode: error.responseCode, response: error.response, message: error.message });
    return false;
  }
}

export async function sendBrancaSummaryEmail(email, branca, bookings) {
  if (!transporter) {
    console.error('Email service not initialized');
    return false;
  }
  try {
    await sendMailWithRetry(buildBrancaSummaryMessage(email, branca, bookings));
    console.log(`Riepilogo branca ${branca} inviato a: ${email}`);
    return true;
  } catch (error) {
    console.error(`Errore invio riepilogo branca ${branca}:`, { code: error.code, responseCode: error.responseCode, response: error.response, message: error.message });
    return false;
  }
}
