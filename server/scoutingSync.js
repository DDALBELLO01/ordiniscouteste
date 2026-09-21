import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.scoutingfse.it';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parsePrezzo(text) {
  const match = String(text || '').replace(/\s/g, '').match(/([\d.,]+)/);
  if (!match) return null;
  return Number(match[1].replace(/\./g, '').replace(',', '.'));
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'it-IT,it;q=0.9'
    }
  });
  if (!response.ok) {
    throw new Error(`Richiesta a ScoutingFSE fallita (HTTP ${response.status})`);
  }
  return response.text();
}

// Cerca articoli su scoutingfse.it per codice/testo, senza necessità di login.
export async function cercaProdottiScouting(termine) {
  const url = `${BASE_URL}/search.html?search=${encodeURIComponent(termine)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const risultati = [];
  $('.products-list__item').each((_, el) => {
    const card = $(el);
    const link = card.find('.product-card__name a').first();
    const href = link.attr('href') || '';
    const idMatch = href.match(/product_(\d+)_/);
    if (!idMatch) return;

    const codice = card.find('.product-card__meta').text().replace(/^\s*Cod\.\s*/i, '').trim();
    const nome = link.text().trim();
    const disponibile = /disponibile/i.test(card.find('.status-badge__text').first().text());
    const prezzo = parsePrezzo(card.find('.product-card__price--current').first().text());

    risultati.push({
      scouting_id_prodotto: Number(idMatch[1]),
      codice,
      nome,
      prezzo,
      disponibile,
      url: href
    });
  });

  return risultati;
}

// Recupera dettagli di un prodotto (prezzo base + taglie/varianti disponibili) senza login.
export async function ottieniProdottoScouting(idProdotto) {
  if (!/^\d+$/.test(String(idProdotto))) {
    throw new Error('ID prodotto ScoutingFSE non valido');
  }
  const url = `${BASE_URL}/product_${idProdotto}_x.html`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const nome = $('.product__title').first().text().trim();
  const codice = $('.spec__name:contains("Cod.")').first().next('.spec__value').text().trim();
  const prezzoBase = parsePrezzo($('.product__price--current').first().text());
  const disponibileBase = /disponibile/i.test($('.product__prices-stock .status-badge__text').first().text());

  const varianti = [];
  $('#product-tab-versioni table.analogs-table tbody tr').each((_, el) => {
    const row = $(el);
    const codiceVariante = row.find('.analogs-table__sku').first().text().trim();
    const taglia = row.find('.analogs-table__column--vendor h5').first().text().trim();
    const disponibile = /disponibile/i.test(row.find('.status-badge__text').first().text());
    const prezzo = parsePrezzo(row.find('.analogs-table__column--price').last().text());

    if (codiceVariante) {
      varianti.push({ scouting_caratteristica_id: Number(codiceVariante), taglia, disponibile, prezzo });
    }
  });

  return {
    scouting_id_prodotto: Number(idProdotto),
    codice,
    nome,
    prezzo: prezzoBase,
    disponibile: disponibileBase,
    varianti
  };
}
