import axios from 'axios';

/**
 * Automates login on Scouting FSE and returns active session cookies
 */
export async function loginToScoutingFse(email, password) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

  // 1. Fetch login page to get initial cookies & CSRF token
  const pageRes = await axios.get('https://www.scoutingfse.it/login.html', {
    headers: { 'User-Agent': userAgent }
  });

  const initCookies = pageRes.headers['set-cookie']
    ? pageRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ')
    : '';

  const tokenMatch = pageRes.data.match(/name="token"\s+value="([^"]+)"/i);
  const csrfToken = tokenMatch ? tokenMatch[1] : '';

  // 2. Submit login form
  const params = new URLSearchParams();
  if (csrfToken) params.append('token', csrfToken);
  params.append('username', email);
  params.append('password', password);

  const loginRes = await axios.post('https://www.scoutingfse.it/login.html?mod=login', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
      'Origin': 'https://www.scoutingfse.it',
      'Referer': 'https://www.scoutingfse.it/login.html',
      'Cookie': initCookies
    },
    maxRedirects: 0,
    validateStatus: s => s >= 200 && s < 400
  });

  let sessionCookies = initCookies;
  if (loginRes.headers['set-cookie']) {
    const newCookies = loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    sessionCookies = `${sessionCookies}; ${newCookies}`;
  }

  return sessionCookies;
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

/**
 * Executes add-to-cart requests on Scouting FSE for a list of items.
 * If rawCurl is omitted or session expired, automatically logs in using env credentials.
 */
export async function sendOrderToScoutingFse(rawCurl, items) {
  let sessionCookies = '';
  let parsedHeaders = {};
  let sampleIdProdotto = null;
  let sampleCaratteristica0 = null;

  if (rawCurl) {
    const parsed = parseCurlCommand(rawCurl);
    if (parsed) {
      sessionCookies = parsed.cookies;
      parsedHeaders = parsed.headers || {};
      sampleIdProdotto = parsed.sampleIdProdotto;
      sampleCaratteristica0 = parsed.sampleCaratteristica0;
    }
  }

  // If no cookies or credentials configured, perform automatic login
  const email = process.env.SCOUTING_FSE_EMAIL;
  const password = process.env.SCOUTING_FSE_PASSWORD;

  if (email && password) {
    try {
      console.log('Autenticazione automatica su Scouting FSE...');
      sessionCookies = await loginToScoutingFse(email, password);
    } catch (err) {
      console.error('Errore login automatico:', err.message);
      if (!sessionCookies) {
        throw new Error(`Login automatico fallito: ${err.message}`);
      }
    }
  }

  if (!sessionCookies) {
    throw new Error('Impossibile autenticarsi su Scouting FSE: imposta SCOUTING_FSE_EMAIL e SCOUTING_FSE_PASSWORD o fornisci un cURL valido.');
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

  for (const item of items) {
    try {
      const qty = item.quantita_prenotata > 0 ? item.quantita_prenotata : 1;
      let idProdotto = item.scouting_id_prodotto || item.id_prodotto || parsed.sampleIdProdotto;
      let caratteristica0 = item.scouting_caratteristica_id || parsed.sampleCaratteristica0;

      // Extract id_prodotto from image URL if formatted like product_1018_...
      if (!idProdotto && item.immagine) {
        const idMatch = item.immagine.match(/product_(\d+)_/i);
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

      results.push({
        item: `${item.nome}${item.taglia ? ` (${item.taglia})` : ''}`,
        qty,
        status: 'success',
        statusCode: response.status,
        message: 'Aggiunto con successo al carrello Scouting FSE!'
      });
    } catch (err) {
      console.error(`Errore invio Scouting FSE per ${item.nome}:`, err.message);
      results.push({
        item: item.nome,
        status: 'error',
        message: err.response?.data ? String(err.response.data).substring(0, 100) : err.message
      });
    }
  }

  return {
    success: true,
    total: items.length,
    successfulCount: results.filter(r => r.status === 'success').length,
    results
  };
}
