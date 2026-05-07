const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const COUNTRIES = {
  us: { label: "United States", host: "www.amazon.com" },
  uk: { label: "United Kingdom", host: "www.amazon.co.uk" },
  de: { label: "Germany", host: "www.amazon.de" },
  fr: { label: "France", host: "www.amazon.fr" },
  it: { label: "Italy", host: "www.amazon.it" },
  es: { label: "Spain", host: "www.amazon.es" },
  ca: { label: "Canada", host: "www.amazon.ca" },
  jp: { label: "Japan", host: "www.amazon.co.jp" },
  au: { label: "Australia", host: "www.amazon.com.au" },
  mx: { label: "Mexico", host: "www.amazon.com.mx" },
  nl: { label: "Netherlands", host: "www.amazon.nl" },
  se: { label: "Sweden", host: "www.amazon.se" },
  pl: { label: "Poland", host: "www.amazon.pl" },
  tr: { label: "Turkey", host: "www.amazon.com.tr" },
  ae: { label: "United Arab Emirates", host: "www.amazon.ae" },
  sa: { label: "Saudi Arabia", host: "www.amazon.sa" },
  in: { label: "India", host: "www.amazon.in" },
  sg: { label: "Singapore", host: "www.amazon.sg" },
  br: { label: "Brazil", host: "www.amazon.com.br" }
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream"
    });
    res.end(content);
  });
}

function decodeEntities(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name.toLowerCase()] || `&${name};`);
}

function stripHtml(value = "") {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return stripHtml(match[1]);
    }
  }
  return "";
}

function extractBullets(html) {
  const featureBlock = html.match(/<div[^>]+id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const source = featureBlock ? featureBlock[1] : html;
  const bullets = [];
  const liPattern = /<li[^>]*>\s*<span[^>]*class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi;

  let match;
  while ((match = liPattern.exec(source)) !== null) {
    const text = stripHtml(match[1]);
    if (
      text &&
      !/make sure this fits|javascript is disabled|customer reviews/i.test(text) &&
      !bullets.includes(text)
    ) {
      bullets.push(text);
    }
    if (bullets.length === 5) break;
  }

  return bullets;
}

function extractImage(html) {
  const dynamicImage = html.match(/data-old-hires=["']([^"']+)["']/i);
  if (dynamicImage && dynamicImage[1]) return decodeEntities(dynamicImage[1]);

  const landingImage = html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i);
  if (landingImage && landingImage[1]) return decodeEntities(landingImage[1]);

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return ogImage && ogImage[1] ? decodeEntities(ogImage[1]) : "";
}

function extractRating(html) {
  const rating = firstMatch(html, [
    /<span[^>]+id=["']acrPopover["'][\s\S]*?<span[^>]+class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<i[^>]+class=["'][^"']*a-icon-star[^"']*["'][\s\S]*?<span[^>]+class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]+class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([\s\S]*?out of 5 stars[\s\S]*?)<\/span>/i
  ]);

  const numeric = rating.match(/[\d.,]+/);
  return numeric ? numeric[0].replace(",", ".") : rating;
}

function extractReviewCount(html) {
  const count = firstMatch(html, [
    /<span[^>]+id=["']acrCustomerReviewText["'][^>]*>([\s\S]*?)<\/span>/i,
    /<a[^>]+id=["']acrCustomerReviewLink["'][\s\S]*?>([\s\S]*?)<\/a>/i
  ]);

  const numeric = count.match(/[\d,.]+/);
  return numeric ? numeric[0] : count;
}

function parseProduct(html, country, asin, url) {
  const title = firstMatch(html, [
    /<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i,
    /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i,
    /<title>([\s\S]*?)<\/title>/i
  ]).replace(/\s*:\s*Amazon\.[^:]+.*$/i, "");

  return {
    asin,
    country,
    marketplace: COUNTRIES[country].host,
    url,
    title,
    bullets: extractBullets(html),
    reviewCount: extractReviewCount(html),
    rating: extractRating(html),
    image: extractImage(html)
  };
}

async function fetchProduct(country, asin) {
  const normalizedCountry = country.toLowerCase();
  const marketplace = COUNTRIES[normalizedCountry];
  if (!marketplace) {
    const supported = Object.keys(COUNTRIES).join(", ");
    throw new Error(`Unsupported country. Supported country codes: ${supported}`);
  }

  if (!/^[A-Z0-9]{10}$/i.test(asin)) {
    throw new Error("ASIN must be 10 letters or numbers.");
  }

  const normalizedAsin = asin.toUpperCase();
  const url = `https://${marketplace.host}/dp/${encodeURIComponent(normalizedAsin)}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    },
    redirect: "follow"
  });

  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Amazon returned HTTP ${response.status}.`);
  }

  if (/captcha|robot check|enter the characters you see below/i.test(html)) {
    throw new Error("Amazon returned an anti-bot verification page. Try again later, use a proxy, or connect a scraping API.");
  }

  const product = parseProduct(html, normalizedCountry, normalizedAsin, url);
  if (!product.title && !product.image && product.bullets.length === 0) {
    throw new Error("Could not find product details on the Amazon page.");
  }

  return product;
}

function handleApi(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const country = requestUrl.searchParams.get("country") || "";
  const asin = requestUrl.searchParams.get("asin") || "";

  fetchProduct(country, asin)
    .then((product) => sendJson(res, 200, { ok: true, product }))
    .catch((error) => sendJson(res, 400, { ok: false, error: error.message }));
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (requestUrl.pathname === "/api/product") {
    handleApi(req, res);
    return;
  }

  const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Amazon product scraper running at http://localhost:${PORT}`);
});
