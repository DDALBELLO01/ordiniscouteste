import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

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
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">€ ${item.prezzo_unitario.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">€ ${(item.quantita * item.prezzo_unitario).toFixed(2)}</td>
      </tr>
    `).join('');

    const totale = bookingData.items.reduce((sum, item) => sum + (item.quantita * item.prezzo_unitario), 0);

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
      from: process.env.SMTP_FROM,
      to: email,
      subject: `Conferma Prenotazione Scout - ${bookingData.id}`,
      html: htmlContent
    });

    console.log(`Email inviata a: ${email}`);
    return true;
  } catch (error) {
    console.error('Errore invio email:', error);
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
      from: process.env.SMTP_FROM,
      to: process.env.ADMIN_EMAIL,
      subject: `[ADMIN] Nuova Prenotazione - ${bookingData.id}`,
      html: htmlContent
    });

    return true;
  } catch (error) {
    console.error('Errore invio notifica admin:', error);
    return false;
  }
}
