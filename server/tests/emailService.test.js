import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {
  buildBookingMessage, buildAdminNotificationMessage, buildBrancaSummaryMessage,
  buildBookingStatusMessage, buildLeaderBookingMessage, buildOrderedItemsMessage,
  initializeEmailService, sendBookingEmail, sendAdminNotification, sendBrancaSummaryEmail,
  sendBookingStatusEmail, sendLeaderBookingEmail, sendOrderedItemsEmail
} from '../emailService.js';

const originalSender = process.env.SMTP_USER;
before(() => { process.env.SMTP_USER = 'admin@example.test'; });
after(() => {
  if (originalSender === undefined) delete process.env.SMTP_USER;
  else process.env.SMTP_USER = originalSender;
});

const booking = {
  id: 'booking-<123>',
  nome_prenotante: '<Persona & famiglia>',
  email_prenotante: 'customer@example.test',
  genitore_di: '<Figlio & figlia>',
  destinatario: 'leader@example.test',
  branca_riferimento: 'Branco <test>',
  data_prenotazione: '2026-11-10T10:00:00Z',
  note: '<Nota>\nSeconda riga & dettagli',
  items: [
    { nome: '<Camicia>', taglia: 'M & L', specialita: '<Patch>', quantita: 2, prezzo_unitario: 25, costo_acquisto: 12 },
    { nome: 'Berretto', quantita: 3, prezzo_unitario: 4, costo_acquisto: 2 }
  ]
};

function messages() {
  return [
    buildBookingMessage('customer@example.test', booking),
    buildAdminNotificationMessage(booking),
    buildBrancaSummaryMessage('summary@example.test', booking.branca_riferimento, [
      { prenotazione: booking, items: booking.items },
      { prenotazione: { ...booking, id: 'second', nome_prenotante: 'Seconda persona' }, items: [booking.items[1]] }
    ]),
    buildBookingStatusMessage({ ...booking, stato: 'ricevuto' }),
    buildBookingStatusMessage({ ...booking, stato: 'non_disponibile' }),
    buildLeaderBookingMessage(booking),
    buildOrderedItemsMessage(booking)
  ];
}

test('every email uses the same inline layout, typography, table styles and automatic footer', () => {
  const built = messages();
  for (const message of built) {
    assert.match(message.html, /^<!doctype html>\n<html lang="it">/);
    assert.match(message.html, /name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(message.html, /max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px/);
    assert.match(message.html, /padding:28px 24px;background-color:#2c5282;border-radius:12px 12px 0 0;color:#ffffff/);
    assert.match(message.html, /font-family:Arial,Helvetica,sans-serif;color:#1e293b/);
    assert.match(message.html, /border-collapse:collapse;font-size:13px;line-height:1.5/);
    assert.match(message.html, /background-color:#f1f5f9;color:#475569/);
    assert.match(message.html, /Notifica automatica di Ordini Scout\./);
    assert.match(message.html, /display:none;max-height:0;overflow:hidden;mso-hide:all/);
    assert.ok(!message.html.includes('<style>'));
    assert.match(message.html, /&lt;Camicia&gt;/);
    assert.match(message.html, /Taglia: M &amp; L/);
    assert.match(message.html, /&lt;Patch&gt;/);
    assert.ok(!message.html.includes('<Persona'));
    assert.ok(!message.html.includes('<Camicia>'));
    assert.ok(!message.html.includes('<Patch>'));
    assert.ok(!message.html.includes('<Figlio'));
    assert.ok(message.text.includes('<Camicia>'));
    assert.ok(message.subject);
    assert.ok(message.to);
  }
  const [customer, admin, summary, received, unavailable, leader, ordered] = built;
  assert.equal(customer.to, 'customer@example.test');
  assert.equal(admin.to, process.env.SMTP_USER);
  assert.equal(summary.to, 'summary@example.test');
  assert.equal(received.to, booking.email_prenotante);
  assert.equal(unavailable.to, booking.email_prenotante);
  assert.equal(leader.to, booking.destinatario);
  assert.equal(ordered.to, booking.destinatario);
});

test('unified templates preserve totals, booking data, optional notes and separate purchase costs', () => {
  const [customer, admin, summary, received, unavailable, leader, ordered] = messages();
  for (const message of [customer, admin, summary, received, unavailable, leader]) {
    assert.match(message.html, /booking-&lt;123&gt;/);
    assert.match(message.html, /&lt;Persona &amp; famiglia&gt;/);
  }
  for (const message of [customer, admin, summary, leader]) {
    assert.match(message.html, /Genitore di<\/td><td[^>]*>&lt;Figlio &amp; figlia&gt;/);
    assert.match(message.text, /Genitore di: <Figlio & figlia>/);
  }
  for (const message of [customer, leader]) {
    assert.match(message.html, /€&nbsp;62\.00/);
    assert.match(message.html, /&lt;Nota&gt;<br>Seconda riga &amp; dettagli/);
    assert.ok(!message.html.includes('Costo di acquisto'));
    assert.ok(!message.text.includes('Costo di acquisto'));
  }
  assert.match(customer.text, /Totale: € 62\.00/);
  assert.match(leader.text, /Totale da pagare: € 62\.00/);
  assert.match(summary.text, /Totale complessivo branca: € 74\.00/);
  assert.match(summary.html, /€&nbsp;74\.00/);
  assert.match(summary.html, /Seconda persona/);
  assert.match(received.text, /concordare il ritiro/);
  assert.match(unavailable.text, /eventuali importi già versati/);
  assert.match(ordered.text, /Totale costo di acquisto: € 30\.00/);
  assert.match(ordered.text, /Totale vendita da chiedere ai clienti: € 62\.00/);
  assert.match(ordered.html, /€&nbsp;30\.00/);
  assert.match(ordered.html, /€&nbsp;62\.00/);
  for (const builder of [
    value => buildBookingMessage('customer@example.test', value), buildLeaderBookingMessage
  ]) {
    assert.ok(!builder({ ...booking, note: '' }).html.includes('Note del prenotante'));
  }
  assert.ok(!buildBookingMessage('customer@example.test', { ...booking, genitore_di: '' }).html.includes('Genitore di'));
  const zero = buildBookingMessage('customer@example.test', { ...booking, items: [{ nome: 'Gratuito', quantita: 1, prezzo_unitario: 0 }] });
  assert.match(zero.html, /€&nbsp;0\.00/);
  assert.ok(!zero.html.includes('Taglia:'));
  assert.ok(!zero.html.includes('NaN'));
});

test('all send functions deliver their shared-layout builders without changing recipients or subjects', async t => {
  const sent = [];
  t.mock.method(nodemailer, 'createTransport', () => ({
    verify: async () => true,
    sendMail: async message => { sent.push(message); return { accepted: [message.to] }; }
  }));
  initializeEmailService();
  assert.equal(await sendBookingEmail('customer@example.test', booking), true);
  assert.equal(await sendAdminNotification(booking), true);
  assert.equal(await sendBrancaSummaryEmail('summary@example.test', booking.branca_riferimento, [
    { prenotazione: booking, items: booking.items }
  ]), true);
  await sendBookingStatusEmail({ ...booking, stato: 'ricevuto' });
  await sendBookingStatusEmail({ ...booking, stato: 'non_disponibile' });
  await sendLeaderBookingEmail(booking);
  await sendOrderedItemsEmail(booking);
  const expected = messages();
  expected[2] = buildBrancaSummaryMessage('summary@example.test', booking.branca_riferimento, [
    { prenotazione: booking, items: booking.items }
  ]);
  assert.deepEqual(sent, expected);
});
