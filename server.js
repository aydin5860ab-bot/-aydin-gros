const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const baseDir = 'C:/AYDIN GROS';
const mime = {
  '.html':'text/html','.css':'text/css','.js':'text/javascript',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.gif':'image/gif','.ico':'image/x-icon','.svg':'image/svg+xml'
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
  });
}

const zlib = require('zlib');

// Erenler Cep'ten fiyat çek (proxy) — redirect + gzip destekli
function fetchErenler(slug, page) {
  return new Promise((resolve, reject) => {
    const fullUrl = `https://www.erenlercep.com/${encodeURIComponent(slug)}?page=${page}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      }
    };

    function doRequest(reqUrl, redirectCount) {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      const mod = reqUrl.startsWith('https') ? https : require('http');
      const reqOptions = Object.assign({}, options);
      try {
        const u = new URL(reqUrl);
        reqOptions.hostname = u.hostname;
        reqOptions.path = u.pathname + u.search;
        reqOptions.port = u.port || (reqUrl.startsWith('https') ? 443 : 80);
      } catch(e) { return reject(e); }

      const request = mod.request(reqOptions, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const loc = res.headers.location;
          const nextUrl = loc.startsWith('http') ? loc : `https://www.erenlercep.com${loc}`;
          res.resume();
          return doRequest(nextUrl, redirectCount + 1);
        }

        const chunks = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const enc = (res.headers['content-encoding'] || '').toLowerCase();
          if (enc.includes('gzip')) {
            zlib.gunzip(buf, (e, d) => e ? resolve('') : resolve(d.toString('utf8')));
          } else if (enc.includes('br')) {
            zlib.brotliDecompress(buf, (e, d) => e ? resolve('') : resolve(d.toString('utf8')));
          } else if (enc.includes('deflate')) {
            zlib.inflate(buf, (e, d) => e ? resolve('') : resolve(d.toString('utf8')));
          } else {
            resolve(buf.toString('utf8'));
          }
        });
        res.on('error', () => resolve(''));
      });
      request.on('error', () => resolve(''));
      request.setTimeout(10000, () => { request.destroy(); resolve(''); });
      request.end();
    }

    doRequest(fullUrl, 0);
  });
}

function parseErenlerHTML(html) {
  // .name a ve .price-normal class içeriğini regex ile çıkar
  const products = [];
  const productBlocks = html.split('class="product-thumb"');
  for (let i = 1; i < productBlocks.length; i++) {
    const block = productBlocks[i].substring(0, 2000);
    const nameMatch = block.match(/class="name"[^>]*>(?:<[^>]+>)*([^<]{2,80})(?:<\/|<[^>]+>)/);
    const nameMatch2 = block.match(/class="name"><a[^>]*>([^<]{2,80})<\/a>/);
    const priceMatch = block.match(/class="price-normal"[^>]*>([\d.,]+\s*₺)/);
    const name = (nameMatch2 && nameMatch2[1]) || (nameMatch && nameMatch[1]);
    if (name && priceMatch) {
      const price = parseFloat(priceMatch[1].replace(',','.').replace(/[^0-9.]/g,''));
      if (price > 0) products.push({name: name.trim(), price});
    }
  }
  return products;
}

http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost:8080');
  const pathname = url.pathname;

  // === API: Erenler ürünlerini kaydet ===
  if (pathname === '/api/save-erenler' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const data = JSON.parse(body);
      const existing = fs.existsSync(`${baseDir}/erenler-products.json`)
        ? JSON.parse(fs.readFileSync(`${baseDir}/erenler-products.json`,'utf8'))
        : [];
      const merged = existing.concat(data);
      fs.writeFileSync(`${baseDir}/erenler-products.json`, JSON.stringify(merged));
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true, total: merged.length}));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({error:e.message}));
    }
    return;
  }

  // === API: Erenler ürünlerini oku ===
  if (pathname === '/api/erenler-products' && req.method === 'GET') {
    try {
      const data = fs.existsSync(`${baseDir}/erenler-products.json`)
        ? fs.readFileSync(`${baseDir}/erenler-products.json`,'utf8')
        : '[]';
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(data);
    } catch(e) { res.writeHead(500); res.end('[]'); }
    return;
  }

  // === API: Erenler CANLI fiyat proxy (yönetim paneli için) ===
  if (pathname === '/api/erenler-live' && req.method === 'GET') {
    const slug = url.searchParams.get('slug') || 'gida';
    const page = parseInt(url.searchParams.get('page') || '1');
    try {
      const html = await fetchErenler(slug, page);
      const products = parseErenlerHTML(html);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({products, count: products.length}));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({error:e.message, products:[]}));
    }
    return;
  }

  // === API: DEBUG - raw status ===
  if (pathname === '/api/erenler-debug' && req.method === 'GET') {
    const slug = url.searchParams.get('slug') || 'meyve-sebze';
    const reqUrl = `https://www.erenlercep.com/${encodeURIComponent(slug)}`;
    const result = await new Promise(resolve => {
      https.request({
        hostname: 'www.erenlercep.com',
        path: `/${encodeURIComponent(slug)}`,
        port: 443,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
          'Accept': 'text/html',
          'Accept-Encoding': 'identity'
        },
        timeout: 12000
      }, r => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => resolve({status: r.statusCode, headers: r.headers, bodyLen: body.length, first300: body.substring(0,300), hasThumb: body.includes('product-thumb')}));
      }).on('error', e => resolve({error: e.message}))
        .on('timeout', () => resolve({error:'timeout'}))
        .end();
    });
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify(result));
    return;
  }

  // === API: Erenler sayfa sayısı ===
  if (pathname === '/api/erenler-info' && req.method === 'GET') {
    const slug = url.searchParams.get('slug') || 'gida';
    try {
      const html = await fetchErenler(slug, 1);
      const m = html.match(/toplam:\s*(\d+)\s*\((\d+)\s*Sayfa\)/);
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({total: m ? parseInt(m[1]) : 0, pages: m ? parseInt(m[2]) : 1}));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({error:e.message}));
    }
    return;
  }

  // === API: Yeni ürünleri ver (admin senkronizasyon için) ===
  if (pathname === '/api/new-products' && req.method === 'GET') {
    try {
      const data = fs.existsSync(`${baseDir}/new-products.json`)
        ? fs.readFileSync(`${baseDir}/new-products.json`, 'utf8')
        : '[]';
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(data);
    } catch(e) { res.writeHead(500); res.end('[]'); }
    return;
  }

  // === Statik dosya sunucu ===
  let urlPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(baseDir, urlPath);
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {'Content-Type': mime[ext] || 'text/plain'});
    res.end(data);
  } catch(e) {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(8080, () => {
  fs.writeFileSync(`${baseDir}/server.ready`, '1');
  console.log('Server running on port 8080');
});
