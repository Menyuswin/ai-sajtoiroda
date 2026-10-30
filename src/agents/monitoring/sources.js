// Források lekérése és a hírcsatornák értelmezése.
// A feed-értelmező a manyai.hu sajtófigyelőjéből (functions/api/press.js) származik, de itt a TELJES csatornát
// feldolgozzuk (nem csak az első 6 tételt), mert a kulcsszavas szűréshez ez kell.
import { createHash } from 'node:crypto';

const MAX_PER_FEED = 60;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
};

function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}
function plain(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ocid|mc_)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.toLowerCase();
    let out = u.toString();
    if (u.pathname.length > 1 && out.endsWith('/') && !u.search) out = out.slice(0, -1);
    return out;
  } catch { return raw; }
}

export function articleId(url) {
  return createHash('sha1').update(canonicalUrl(url)).digest('hex').slice(0, 16);
}

export function parseFeed(xml, medium, fetchedAt, extra = {}) {
  const out = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    if (out.length >= MAX_PER_FEED) break;
    const title = plain(tag(b, 'title'));
    let link = tag(b, 'link');
    if (!link) {
      const h = b.match(/<link[^>]+href=["']([^"']+)["']/i);
      link = h ? decode(h[1]) : '';
    }
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const summary = plain(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400);
    const dateRaw = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = Date.parse(dateRaw);
    out.push({
      id: articleId(link),
      url: canonicalUrl(link),
      title,
      summary,
      medium,
      published: Number.isNaN(t) ? null : new Date(t).toISOString(),
      fetchedAt,
      ...extra,
    });
  }
  return out;
}

// Kulcsszavas hírkereső-csatorna (Google News RSS-kereső). FIGYELEM: nem garantált szolgáltatás,
// a működését és a felhasználási feltételeit éles használat előtt ellenőrizni kell (docs/06, 4.3).
export function newsSearchUrl(query, lang = 'hu') {
  const country = lang === 'hu' ? 'HU' : 'US';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${country}&ceid=${country}:${lang}`;
}

export async function defaultFetchText(url, { timeoutMs = 10000 } = {}) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Érthető magyarázat egy lekérési hibához (a felület forrásállapot-paneljéhez).
export function explainError(msg) {
  const m = String(msg || '');
  if (/HTTP 403/.test(m)) return 'A portál elutasítja az automatikus lekérést (403); valószínűleg blokkolja a felhőszolgáltatók címeit.';
  if (/HTTP 404|HTTP 410/.test(m)) return 'A cím nem létezik (404); ellenőrizze az RSS-címet.';
  if (/HTTP 429|HTTP 503/.test(m)) return 'A szolgáltató túlterhelt, vagy elutasítja az automatikus kéréseket (429/503).';
  if (/HTTP 5\d\d/.test(m)) return 'A szolgáltató hibát jelzett (5xx); később újra próbálható.';
  if (/timeout|aborted|TimeoutError/i.test(m)) return 'A szolgáltató nem válaszolt időben.';
  if (/nincs cikk/.test(m)) return 'A csatorna elérhető, de nincs benne cikk (nem hírcsatorna, vagy üres).';
  return m.slice(0, 160);
}

// Visszaad: { articles, errors, report } – egy hibás forrás nem állítja le a futást; a report minden forrásról szól.
export async function collectArticles(profile, { fetchText = defaultFetchText, now = () => new Date() } = {}) {
  const fetchedAt = now().toISOString();
  const jobs = [
    ...profile.forrasok.rss.map(s => ({ medium: s.nev || s.url, url: s.url, tipus: 'rss', nev: s.nev || s.url })),
    ...profile.forrasok.sajat.map(s => ({ medium: s.nev || s.url, url: s.url, tipus: 'sajat', nev: s.nev || s.url })),
    ...profile.forrasok.hirkereso.map(q => ({ medium: 'Hírkereső', url: newsSearchUrl(q, profile.nyelv), tipus: 'hirkereso', nev: `Keresés: ${q}` })),
    // Közösségi csatorna: nyilvános hírcsatornák (YouTube, Reddit, Mastodon, Bluesky stb.); a bejegyzések `csatorna: 'kozossegi'` jelölést kapnak.
    ...(profile.forrasok.kozossegi || []).map(s => ({ medium: s.nev || s.url, url: s.url, tipus: 'kozossegi', nev: s.nev || s.url, extra: { csatorna: 'kozossegi', platform: s.platform || 'egyeb' } })),
  ];
  const articles = [];
  const errors = [];
  const report = [];
  await Promise.all(jobs.map(async (j) => {
    try {
      const items = parseFeed(await fetchText(j.url), j.medium, fetchedAt, j.extra || {});
      if (!items.length) throw new Error('nincs cikk a csatornában');
      articles.push(...items);
      report.push({ url: j.url, nev: j.nev, tipus: j.tipus, ok: true, db: items.length });
    } catch (e) {
      errors.push({ forras: j.url, hiba: String(e.message || e) });
      report.push({ url: j.url, nev: j.nev, tipus: j.tipus, ok: false, hiba: String(e.message || e) });
    }
  }));
  return { articles, errors, report };
}
