import axios from 'axios';
import fs from 'fs';

/**
 * Automates login on Scouting FSE using puppeteer-core / system browser and adds items directly
 */
export async function orderViaPuppeteerBrowser(email, password, items) {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];

  let execPath = possiblePaths.find(p => fs.existsSync(p));
  if (!execPath) {
    throw new Error('Nessun browser Chrome o Edge trovato sul server.');
  }

  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: execPath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36');

    // 1. Perform Login
    await page.goto('https://www.scoutingfse.it/login.html', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.type('#username', email);
    await page.type('input[type="password"]', password);
    await new Promise(r => setTimeout(r, 2000));

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
      page.click('form[name="login"] button[type="submit"]')
    ]);

    const results = [];

    // 2. Add each item to cart directly within the browser context
    for (const item of items) {
      const qty = Number(item.quantita_prenotata) > 0 ? Number(item.quantita_prenotata) : 1;
      let idProdotto = item.scouting_id_prodotto || item.id_prodotto;
      let caratteristica0 = item.scouting_caratteristica_id;

      if (!idProdotto && item.immagine) {
        const match = item.immagine.match(/(\d{3,6})/);
        if (match) idProdotto = match[1];
      }

      if (!idProdotto) {
        results.push({
          item: item.nome,
          status: 'error',
          message: 'ID prodotto Scouting FSE mancante per questo articolo.'
        });
        continue;
      }

      const res = await page.evaluate(async (idProd, qtyNum, caratt) => {
        try {
          const url = `https://www.scoutingfse.it/buy.html?mod=caratteristica&id_prodotto=${idProd}&mod1=insert`;
          const params = new URLSearchParams();
          params.append('qty', qtyNum.toString());
          if (caratt) params.append('caratteristica0', caratt.toString());

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: params.toString()
          });

          return { ok: response.ok, status: response.status };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }, idProdotto, qty, caratteristica0);

      if (res && res.ok) {
        results.push({
          item: `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}`,
          qty,
          status: 'success',
          statusCode: res.status,
          message: 'Aggiunto con successo al carrello Scouting FSE!'
        });
      } else {
        results.push({
          item: `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}`,
          qty,
          status: 'error',
          message: res?.error || `Errore inserimento (HTTP ${res?.status || 'desconocido'})`
        });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    return {
      success: true,
      total: items.length,
      successfulCount: results.filter(r => r.status === 'success').length,
      results
    };
  } finally {
    await browser.close();
  }
}

/**
 * Parses a raw cURL command (copied from browser DevTools, e.g. cmd, bash, or powershell)
 */
export function parseCurlCommand(rawCurl) {
  if (!rawCurl || typeof rawCurl !== 'string') return null;

  // Clean up CMD continuation lines (^) and bash line breaks (\)
  let clean = rawCurl
    .replace(/\^\r?\n/g, ' ')
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^([\"&%^\<\>|])/g, '$1')
    .replace(/%^7B/gi, '{')
    .replace(/%^7D/gi, '}');

  const headers = {};
  let url = '';
  let cookies = '';
  let sampleBody = '';

  // Extract URL
  const urlMatch = clean.match(/--(?:url|location)\s+[\"\']?([^\s\"\']+)[\"\']?/) || 
                   clean.match(/curl\s+[\"\']?([^\s\"\']+)[\"\']?/);
  if (urlMatch) {
    url = urlMatch[1];
  }

  // Extract Headers -H "Header-Name: Value"
  const headerRegex = /-H\s+[\"\']([^\"\']+)[\"\']/g;
  let match;
  while ((match = headerRegex.exec(clean)) !== null) {
    const hStr = match[1];
    const colonIdx = hStr.indexOf(':');
    if (colonIdx !== -1) {
      const key = hStr.substring(0, colonIdx).trim();
      const val = hStr.substring(colonIdx + 1).trim();
      if (key.toLowerCase() === 'cookie') {
        cookies = val;
      } else if (key.toLowerCase() !== 'content-length' && key.toLowerCase() !== 'accept-encoding') {
        headers[key] = val;
      }
    }
  }

  // Extract Cookie -b "CookieString"
  const cookieMatch = clean.match(/-b\s+[\"\']([^\"\']+)[\"\']/);
  if (cookieMatch) {
    cookies = cookieMatch[1];
  }

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  // Extract --data-raw "..."
  const bodyMatch = clean.match(/--(?:data-raw|data|data-binary)\s+[\"\']?([^\r\n\"\']+)[\"\']?/);
  if (bodyMatch) {
    sampleBody = bodyMatch[1];
  }

  // Extract id_prodotto and caratteristica0 from URL or sampleBody if available
  let sampleIdProdotto = null;
  let sampleCaratteristica0 = null;

  const urlIdMatch = url.match(/id_prodotto=(\d+)/i);
  if (urlIdMatch) sampleIdProdotto = urlIdMatch[1];

  const bodyQtyMatch = sampleBody.match(/qty=(\d+)/i);
  const bodyCarattMatch = sampleBody.match(/caratteristica0=(\d+)/i);
  if (bodyCarattMatch) sampleCaratteristica0 = bodyCarattMatch[1];

  return {
    rawCurl,
    url,
    headers,
    cookies,
    sampleBody,
    sampleIdProdotto,
    sampleCaratteristica0
  };
}

function isCloudflareResponse(data) {
  if (!data) return false;
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  const lower = str.toLowerCase();
  return lower.includes('just a moment') ||
         lower.includes('cf-challenge') ||
         lower.includes('turnstile') ||
         lower.includes('cloudflare') ||
         (str.trim().toLowerCase().startsWith('<!doctype') && lower.includes('head'));
}

/**
 * Executes add-to-cart requests on Scouting FSE for a list of items.
 * Uses rawCurl cookies if provided; falls back to automatic login if no cURL is present.
 */
export async function sendOrderToScoutingFse(rawCurl, items) {
  // Filter items to only process requested items (quantita_prenotata > 0)
  const requestedItems = items.filter(item => (Number(item.quantita_prenotata) || 0) > 0);

  if (requestedItems.length === 0) {
    return {
      success: true,
      total: 0,
      successfulCount: 0,
      results: []
    };
  }

  let sessionCookies = '';
  let parsedHeaders = {};
  let sampleIdProdotto = null;
  let sampleCaratteristica0 = null;

  if (rawCurl) {
    const parsed = parseCurlCommand(rawCurl);
    if (parsed && parsed.cookies) {
      sessionCookies = parsed.cookies;
      parsedHeaders = parsed.headers || {};
      sampleIdProdotto = parsed.sampleIdProdotto;
      sampleCaratteristica0 = parsed.sampleCaratteristica0;
    }
  }

  // Try Puppeteer headless browser order if credentials & local browser exist
  const email = process.env.SCOUTING_FSE_EMAIL;
  const password = process.env.SCOUTING_FSE_PASSWORD;

  if (email && password) {
    try {
      console.log('Esecuzione ordine in background via Puppeteer Headless Browser...');
      return await orderViaPuppeteerBrowser(email, password, requestedItems);
    } catch (puppetErr) {
      console.warn('Avviso Puppeteer non riuscito, ricorso a cURL/sessione:', puppetErr.message);
    }
  }

  if (!sessionCookies) {
    throw new Error('Impossibile autenticarsi su Scouting FSE: imposta SCOUTING_FSE_EMAIL e SCOUTING_FSE_PASSWORD o fornisci un comando cURL valido.');
  }

  const results = [];
  
  const reqHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': 'https://www.scoutingfse.it',
    'Referer': 'https://www.scoutingfse.it/',
    ...parsedHeaders,
    'Cookie': sessionCookies
  };

  for (let idx = 0; idx < requestedItems.length; idx++) {
    const item = requestedItems[idx];
    try {
      const qty = Number(item.quantita_prenotata) > 0 ? Number(item.quantita_prenotata) : 1;
      let idProdotto = item.scouting_id_prodotto || item.id_prodotto || sampleIdProdotto;
      let caratteristica0 = item.scouting_caratteristica_id || sampleCaratteristica0;

      // Extract id_prodotto from image URL if formatted like product_1018_... or numbers in URL
      if (!idProdotto && item.immagine) {
        const idMatch = item.immagine.match(/(\d{3,6})/);
        if (idMatch) idProdotto = idMatch[1];
      }

      if (!idProdotto) {
        results.push({
          item: item.nome,
          status: 'error',
          message: 'ID prodotto Scouting FSE mancante per questo articolo.'
        });
        continue;
      }

      // Endpoint URL for adding to cart
      const targetUrl = `https://www.scoutingfse.it/buy.html?mod=caratteristica&id_prodotto=${idProdotto}&mod1=insert`;

      // Build form-urlencoded payload
      const payloadParams = new URLSearchParams();
      payloadParams.append('qty', qty.toString());
      if (caratteristica0) {
        payloadParams.append('caratteristica0', caratteristica0.toString());
      }

      const response = await axios.post(targetUrl, payloadParams.toString(), {
        headers: reqHeaders,
        timeout: 10000
      });

      if (isCloudflareResponse(response.data)) {
        const cfMsg = 'Sessione cURL / Cookie scaduti (Blocco Cloudflare). Clicca su "⚙️ cURL Sessione" e incolla un cURL fresco dal browser.';
        results.push({
          item: `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}`,
          qty,
          status: 'error',
          statusCode: response.status,
          message: cfMsg
        });

        // Fail fast for remaining items
        for (let rem = idx + 1; rem < requestedItems.length; rem++) {
          const remItem = requestedItems[rem];
          results.push({
            item: `${remItem.nome}${remItem.taglia ? ` (${remItem.taglia})` : ''}`,
            qty: Number(remItem.quantita_prenotata) || 1,
            status: 'error',
            message: 'Annullato: Sessione cURL scaduta. Aggiorna il cURL per procedere.'
          });
        }
        break;
      }

      results.push({
        item: `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}`,
        qty,
        status: 'success',
        statusCode: response.status,
        message: 'Aggiunto con successo al carrello Scouting FSE!'
      });
    } catch (err) {
      console.error(`Errore invio Scouting FSE per ${item.nome}:`, err.message);
      let errorMsg = err.message;
      let isCfBlock = false;

      if (err.response?.data) {
        const rawData = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
        if (isCloudflareResponse(rawData)) {
          errorMsg = 'Sessione cURL / Cookie scaduti (Blocco Cloudflare). Clicca su "⚙️ cURL Sessione" e incolla un cURL fresco dal browser.';
          isCfBlock = true;
        } else if (rawData.trim().startsWith('<!') || rawData.trim().startsWith('<html')) {
          errorMsg = 'Risposta non valida dal server Scouting FSE (Sessione o Cookie scaduti).';
          isCfBlock = true;
        } else {
          errorMsg = rawData.substring(0, 120);
        }
      }

      results.push({
        item: `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}`,
        qty: Number(item.quantita_prenotata) || 1,
        status: 'error',
        message: errorMsg
      });

      if (isCfBlock) {
        // Fail fast for remaining items if Cloudflare blocked the session
        for (let rem = idx + 1; rem < requestedItems.length; rem++) {
          const remItem = requestedItems[rem];
          results.push({
            item: `${remItem.nome}${remItem.taglia ? ` (${remItem.taglia})` : ''}`,
            qty: Number(remItem.quantita_prenotata) || 1,
            status: 'error',
            message: 'Annullato: Sessione cURL scaduta. Aggiorna il cURL per procedere.'
          });
        }
        break;
      }
    }
  }

  return {
    success: true,
    total: items.filter(i => (Number(i.quantita_prenotata) || 0) > 0).length,
    successfulCount: results.filter(r => r.status === 'success').length,
    results
  };
}

/**
 * Checks and synchronizes stock availability from Scouting FSE site for new products
 */
export async function syncScoutingFseStock(db) {
  const prodotti = await db.all("SELECT id, nome, scouting_id_prodotto, immagine, esaurito_scouting FROM prodotti WHERE usato = 0 OR usato IS NULL");
  let checkedCount = 0;
  let updatedCount = 0;

  for (const p of prodotti) {
    let idProdotto = p.scouting_id_prodotto;
    if (!idProdotto && p.immagine) {
      const match = p.immagine.match(/(\d{3,6})/);
      if (match) idProdotto = parseInt(match[1], 10);
    }
    if (!idProdotto) continue;

    checkedCount++;
    try {
      const pageUrl = `https://www.scoutingfse.it/buy.html?mod=caratteristica&id_prodotto=${idProdotto}`;
      const res = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
        },
        timeout: 6000
      });

      const isOut = /esaurito|non\s+disponibile|non_disponibile/i.test(res.data);
      const newStatus = isOut ? 1 : 0;

      if (p.esaurito_scouting !== newStatus) {
        await db.run("UPDATE prodotti SET esaurito_scouting = ? WHERE id = ?", [newStatus, p.id]);
        updatedCount++;
      }
    } catch (err) {
      if (err.response?.status === 404) {
        if (p.esaurito_scouting !== 1) {
          await db.run("UPDATE prodotti SET esaurito_scouting = 1 WHERE id = ?", [p.id]);
          updatedCount++;
        }
      }
    }
  }

  return { checkedCount, updatedCount };
}
