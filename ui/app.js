// Az iroda felülete. Külső könyvtár és beágyazott script nélkül; minden szöveg textContent-tel kerül az oldalra.
(() => {
  'use strict';
  const state = { iroda: null, tenant: null };
  let routeToken = 0; // minden oldalváltáskor nő; a lassan érkező régi nézet nem írhatja felül az újat
  const mainSet = (my, ...nodes) => { if (my === routeToken) $main.replaceChildren(...nodes.flat(Infinity).filter(Boolean)); };
  const $main = document.getElementById('fo');
  const $head = document.getElementById('fejlec');
  const $toast = document.getElementById('toast');
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------- segédek
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const icon = (d) => { const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '22'); s.setAttribute('height', '22'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.append(p); return s; };
  const PERSON = 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7';
  const when = (iso) => iso ? new Date(iso).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' }) : '';
  let toastTimer;
  const toast = (msg, err) => { $toast.textContent = msg; $toast.className = `toast latszik${err ? ' hiba' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $toast.className = 'toast'; }, 4500); };

  const withTenant = (path) => { const sep = path.includes('?') ? '&' : '?'; return state.tenant && (state.iroda?.ugyfelek || []).length > 1 ? `${path}${sep}ugyfel=${encodeURIComponent(state.tenant)}` : path; };
  async function api(method, path, body) {
    const raw = typeof Blob !== 'undefined' && body instanceof Blob; // fájlfeltöltés: a fájl tartalma megy, nem JSON
    let res;
    try { res = await fetch(withTenant(path), { method, headers: { 'X-Requested-With': 'iroda', ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }); }
    catch { throw new Error('Nincs kapcsolat a szerverrel. A bizalmas adatok miatt az iroda kapcsolat nélkül nem mutat tartalmat; az oldal a kapcsolat visszatértével újratölthető.'); }
    const ct = res.headers.get('Content-Type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.hiba) || `Hiba (${res.status})`);
    return data;
  }
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

  // Egyszerű, biztonságos szövegmegjelenítő (a jelentések „markdown-szerű” szövegéhez): DOM-csomópontokat épít.
  function inline(text) {
    return text.split(/(\*\*[^*]+\*\*|https:\/\/[^\s)]+)/).filter(Boolean).map(part => {
      if (part.startsWith('**')) return h('strong', { text: part.slice(2, -2) });
      if (part.startsWith('https://')) return h('a', { href: part, target: '_blank', rel: 'noopener noreferrer', text: part });
      return part.replace(/^\*|\*$/g, '');
    });
  }
  function renderText(text) {
    const box = h('div', { class: 'tartalom' });
    let list = null, item = null;
    const flush = () => { list = null; item = null; };
    for (const line of String(text).split('\n')) {
      let m;
      if ((m = line.match(/^(#{1,2})\s+(.*)$/))) { flush(); box.append(h(m[1].length === 1 ? 'h2' : 'h3', {}, inline(m[2]))); }
      else if ((m = line.match(/^-\s+(.*)$/))) { if (!list || list.tagName !== 'UL') { list = h('ul'); box.append(list); } item = h('li', {}, inline(m[1])); list.append(item); }
      else if ((m = line.match(/^(\d+)\.\s+(.*)$/))) { if (!list || list.tagName !== 'OL') { list = h('ol'); box.append(list); } item = h('li', { value: m[1] }, inline(m[2])); list.append(item); }
      else if (/^\s{2,}\S/.test(line) && item) { item.append(h('br'), ...inline(line.trim())); }
      else if (line.trim()) { flush(); box.append(h('p', {}, inline(line.trim()))); }
      else flush();
    }
    return box;
  }

  // ---------- fejléc és útválasztás
  const NAV = [['#/', 'Iroda'], ['#/bejovo', 'Bejövő', 'vezeto'], ['#/jelentesek', 'Jelentések'], ['#/atadasok', 'Átadások'], ['#/dokumentumok', 'Dokumentumtár'], ['#/naplo', 'Napló'], ['#/beallitasok', 'Beállítások']];
  function renderHeader(route) {
    const i = state.iroda;
    $head.replaceChildren(
      h('span', { class: 'cim', text: i.ugyfel.megnevezes }),
      h('nav', { 'aria-label': 'Fő menü' }, NAV.filter(([, , only]) => !only || i.felhasznalo.szerep === only).map(([href, label]) => h('a', { href, ...(isCurrent(href, route) ? { 'aria-current': 'page' } : {}), text: label }))),
      h('div', { class: 'jobb' },
        i.mod.elo ? h('span', { class: 'jelveny jo', text: 'Éles üzem' }) : h('span', { class: 'jelveny figy', text: 'Próbaüzem: levél nem megy ki' }),
        i.mod.ai === 'mock' ? h('span', { class: 'jelveny', title: 'Az AI-kapcsolat nincs bekapcsolva; szabályalapú elemzés fut.', text: 'AI nélkül (szabályalapú)' }) : null,
        i.ugyfelek.length > 1 ? h('select', { 'aria-label': 'Ügyfél', onchange: (e) => { state.tenant = e.target.value; boot(); } }, i.ugyfelek.map(u => h('option', { value: u, ...(u === i.ugyfel.id ? { selected: true } : {}), text: u }))) : null,
        installEvent ? h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { installEvent.prompt(); await installEvent.userChoice; installEvent = null; renderHeader((location.hash || '#/').slice(2)); }), text: 'Telepítés a gépre' }) : null,
        h('span', { text: `${i.felhasznalo.email} (${i.felhasznalo.szerep === 'uzemelteto' ? 'üzemeltető' : 'vezető'})` })));
  }
  const isCurrent = (href, route) => (href === '#/' ? route === '' || route.startsWith('asztal') : route.startsWith(href.slice(2)));

  async function boot() {
    try {
      state.iroda = await api('GET', '/api/iroda');
      state.tenant = state.iroda.ugyfel.id;
      document.title = `${state.iroda.ugyfel.megnevezes}: sajtóiroda`;
      route();
    } catch (e) { $main.replaceChildren(h('p', { class: 'toltes', role: 'alert', text: e.message })); }
  }
  const route = guard(async () => {
    if (!state.iroda) return;
    routeToken++;
    const r = (location.hash || '#/').slice(2);
    renderHeader(r);
    let m;
    if (r === '') await viewIroda();
    else if ((m = r.match(/^asztal\/([a-z]+)$/))) await viewAsztal(m[1]);
    else if ((m = r.match(/^bejovo(?:\/(.+))?$/))) await viewBejovo(m[1] ? decodeURIComponent(m[1]) : null);
    else if (r === 'jelentesek') await viewJelentesek();
    else if (r === 'atadasok') await viewAtadasok();
    else if (r === 'dokumentumok') await viewDokumentumok();
    else if (r === 'naplo') await viewNaplo();
    else if (r === 'beallitasok') await viewBeallitasok();
    else location.hash = '#/';
    $main.focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', route);

  // ---------- az iroda (asztalok, húzható kártyák)
  const ALLAPOT = { dolgozik: 'Dolgozik', szunetel: 'Szünetel', ures: 'Üres asztal' };
  async function viewIroda(my = routeToken) {
    state.iroda = await api('GET', '/api/iroda');
    const { ugynokok, elrendezes } = state.iroda;
    const floor = h('div', { class: 'padlo', role: 'group', 'aria-label': 'Az iroda alaprajza' });
    const moved = {};
    let saveTimer;
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(guard(async () => { await api('PUT', '/api/iroda/elrendezes', { pozicio: { ...moved } }); }), 400); };

    // Keskeny képernyőn (nincs alaprajz) a dolgozó ügynökök kerülnek előre.
    const sorrend = window.innerWidth <= 760 ? [...ugynokok].sort((x, y) => Number(y.elerheto) - Number(x.elerheto)) : ugynokok;
    for (const a of sorrend) {
      const pos = elrendezes[a.id];
      const fogo = h('div', { class: 'fogo', tabindex: window.innerWidth > 760 ? '0' : null, role: 'group', 'aria-label': `${a.nev}: az asztal mozgatásához használja a nyílbillentyűket` },
        h('span', { class: 'avatar' }, icon(PERSON)),
        h('div', {}, h('div', { class: 'nev', text: a.nev }), h('div', { class: 'munkanev', text: a.munkanev })));
      const body = h('div', { class: 'torzs' },
        h('div', { class: 'allapot' }, h('span', { class: `fenyjel ${a.allapot}` }), ALLAPOT[a.allapot] + (a.szunet_ig ? ` (${a.szunet_ig}-ig)` : '')),
        a.elerheto
          ? h('div', { class: 'utolso', text: a.utolso ? `Utolsó munka: ${a.utolso.cim} (${when(a.utolso.ido)})` : 'Még nem készített anyagot.' })
          : h('div', { class: 'utolso', text: `Az asztal üres. Bevezetés: ${a.szakasz === 'kiegészítő' ? 'igény szerint' : `${a.szakasz}. szakasz`}.` }),
        a.elerheto ? h('div', { class: 'sor' },
          h('a', { class: 'gomb fo', href: `#/asztal/${a.id}`, text: 'Az asztalhoz' }),
          a.olvasatlan ? h('span', { class: 'pont kek', title: 'Olvasatlan jelentés', text: `${a.olvasatlan} új` }) : null,
          a.jovahagyasra_var ? h('span', { class: 'pont', title: 'Jóváhagyásra váró javaslat', text: `${a.jovahagyasra_var} jóváhagyásra vár` }) : null,
          a.atadas_nyitott ? h('a', { class: 'pont kek', href: `#/asztal/${a.id}`, title: 'Más ügynöktől érkezett átadás', text: `${a.atadas_nyitott} átadás` }) : null) : (a.atadas_nyitott ? h('a', { class: 'pont kek', href: `#/asztal/${a.id}`, title: 'Az átadás várja, hogy az ügynök megérkezzen', text: `${a.atadas_nyitott} átadás vár az érkezésére` }) : null));
      const card = h('article', { class: `asztal${a.elerheto ? '' : ' ures-asztal'}`, 'data-id': a.id }, fogo, body);
      card.style.left = `${pos.x}px`; card.style.top = `${pos.y}px`;
      floor.append(card);
      makeDraggable(card, fogo, floor, (x, y) => { moved[a.id] = { x, y }; save(); });
    }
    mainSet(my, 
      h('div', { class: 'iroda-fej' }, h('div', {}, h('h1', { text: 'Az iroda' }), h('p', { text: 'Minden munkatárs a saját asztalánál dolgozik. Az asztalokat áthúzhatja, ahova kényelmes; az „Az asztalhoz” gombbal utasítást adhat, megnézheti a munkát és elolvashatja a jelentéseket.' }))),
      floor);
    const maxY = Math.max(...Object.values(elrendezes).map(p => p.y)) + 230;
    if (window.innerWidth > 760) floor.style.minHeight = `${Math.max(640, maxY)}px`;
  }
  function makeDraggable(card, handle, floor, onMove) {
    let s = null;
    const place = (x, y) => {
      x = Math.max(0, Math.min(x, floor.clientWidth - card.offsetWidth)); y = Math.max(0, y);
      card.style.left = `${x}px`; card.style.top = `${y}px`; return [Math.round(x), Math.round(y)];
    };
    handle.addEventListener('pointerdown', (e) => { if (window.innerWidth <= 760 || e.button !== 0) return; s = { px: e.clientX, py: e.clientY, x: card.offsetLeft, y: card.offsetTop }; handle.setPointerCapture(e.pointerId); card.classList.add('hozott'); });
    handle.addEventListener('pointermove', (e) => { if (s) place(s.x + e.clientX - s.px, s.y + e.clientY - s.py); });
    const end = () => { if (!s) return; s = null; card.classList.remove('hozott'); onMove(card.offsetLeft, card.offsetTop); };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[e.key];
      if (!d) return; e.preventDefault(); const [x, y] = place(card.offsetLeft + d[0], card.offsetTop + d[1]); onMove(x, y);
    });
  }

  // ---------- egy ügynök asztala
  const UT_CIMKE = { javaslat: 'Jóváhagyásra vár', vegrehajtva: 'Végrehajtva', elvetve: 'Elvetve', kesz: 'Kész', visszakerdez: 'Visszakérdezés', hiba: 'Nem sikerült' };
  const TIPPEK = ['Javasolj kulcsszavakat a feltöltött dokumentumok alapján', 'Figyeld a várólista témát is', 'Mi történt a héten az ápolóhiány körül?', 'Szólj azonnal, ha a vezérigazgató nevét említik', 'Szüneteltesd 2026-11-05-ig'];
  async function viewAsztal(id, my = routeToken) {
    const d = await api('GET', `/api/ugynok/${id}`);
    const a = d.ugynok;
    const head = h('div', { class: 'asztal-fej' },
      h('a', { class: 'gomb vissza', href: '#/', text: '← Iroda' }),
      h('div', {}, h('h1', { text: a.nev }), h('div', { class: 'munkanev', text: a.munkanev })),
      h('span', { class: 'allapot' }, h('span', { class: `fenyjel ${d.allapot}` }), ALLAPOT[d.allapot] + (d.szunet_ig ? ` (${d.szunet_ig}-ig)` : '')),
      a.elerheto ? h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { await api('PUT', `/api/ugynok/${id}/allapot`, { aktiv: d.allapot !== 'dolgozik' }); toast(d.allapot === 'dolgozik' ? 'Az ügynök szünetel.' : 'Az ügynök újra dolgozik.'); await viewAsztal(id); renderHeader(`asztal/${id}`); }), text: d.allapot === 'dolgozik' ? 'Szünet' : 'Munka újraindítása' }) : null);
    if (!a.elerheto) {
      mainSet(my, head, h('div', { class: 'kartya' }, h('p', { text: 'Ennél az asztalnál még nem ül senki. Az ügynök a bevezetési sorrend szerint kerül sorra; addig az asztal üres, de a többi ügynök már küldhet ide átadást: az várakozik, és az ügynök megérkezésekor kézbesül.' })),
        h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások' }), atadasLista(d.atadasok, id, () => viewAsztal(id))));
      return;
    }
    if (d.munka?.tipus === 'kapcsolattarto') { mainSet(my, head, kapcsolattartoAsztal(d, id)); return; }
    const input = h('textarea', { id: 'utasitas', 'aria-label': 'Utasítás az ügynöknek', maxlength: '500', placeholder: 'Írja le magyarul, mit szeretne… (Ctrl+Enter: küldés)' });
    const send = guard(async () => {
      const szoveg = input.value.trim(); if (!szoveg) return;
      const r = await api('POST', `/api/ugynok/${id}/utasitas`, { szoveg });
      input.value = ''; await viewAsztal(id);
      if (r.allapot === 'kesz') toast('Elkészült: az anyag a Jelentések között van.');
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    const szal = h('div', { class: 'uzenetek', tabindex: '0', 'aria-label': 'Utasítások és válaszok' },
      d.utasitasok.length ? d.utasitasok.map(u => [
        h('div', { class: 'buborek en', text: u.szoveg }),
        h('div', { class: `buborek ugynok${u.allapot === 'javaslat' ? ' javaslat' : ''}` }, u.valasz || '',
          h('span', { class: 'allapotcimke', text: `${UT_CIMKE[u.allapot]} · ${when(u.ido)}` }),
          u.allapot === 'javaslat' && u.muvelet?.muvelet === 'kifejezesek_hozzaad' ? kijelolo(u, id) : null,
          u.allapot === 'javaslat' && u.muvelet?.muvelet !== 'kifejezesek_hozzaad' ? h('div', { class: 'sor' },
            h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => { const r = await api('POST', `/api/utasitasok/${encodeURIComponent(u.id)}/dontes`, { dontes: 'jovahagyva' }); toast(r.allapot === 'vegrehajtva' ? 'Végrehajtva.' : `Nem sikerült: ${r.valasz}`, r.allapot !== 'vegrehajtva'); await viewAsztal(id); }), text: 'Jóváhagyom' }),
            h('button', { class: 'gomb rossz', type: 'button', onclick: guard(async () => { await api('POST', `/api/utasitasok/${encodeURIComponent(u.id)}/dontes`, { dontes: 'elvetve' }); toast('Elvetve.'); await viewAsztal(id); }), text: 'Elvetem' })) : null,
          u.anyag_id ? h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(u.anyag_id), text: 'Megnyitás' })) : null)])
        : h('p', { class: 'ures-szoveg', text: 'Még nem adott utasítást ennek az ügynöknek.' }));
    const utasitasSav = h('section', { class: 'sav', 'aria-labelledby': 'h-ut' }, h('h2', { id: 'h-ut', text: 'Utasítás' }), szal,
      h('div', { class: 'urlap-sor' }, input,
        h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: send, text: 'Küldés' })),
        h('div', { class: 'tippek', 'aria-label': 'Példák' }, TIPPEK.map(t => h('button', { class: 'tipp', type: 'button', onclick: () => { input.value = t; input.focus(); }, text: t })))),
      h('p', { class: 'sugo' }, 'Az ügynök a módosításokat javaslatként mutatja, és csak az Ön jóváhagyása után hajtja végre. Kifelé nem küld semmit.'));

    const m = d.munka, tot = Math.max(1, m.hangnem.pozitiv + m.hangnem.semleges + m.hangnem.negativ);
    const sav = (cls, n) => { const i = h('i', { class: cls, title: `${n}` }); i.style.width = `${(n / tot) * 100}%`; return i; };
    const munkaSav = h('section', { class: 'sav', 'aria-labelledby': 'h-mu' }, h('h2', { id: 'h-mu', text: 'Munka' }),
      h('div', { class: 'szamok' }, h('div', {}, h('b', { text: m.ma }), h('span', { text: 'mai cikk' })), h('div', {}, h('b', { text: m.hangnem.negativ }), h('span', { text: 'negatív' })), h('div', {}, h('b', { text: m.hangnem.pozitiv }), h('span', { text: 'pozitív' }))),
      h('div', { class: 'savos', role: 'img', 'aria-label': `Hangnem: ${m.hangnem.negativ} negatív, ${m.hangnem.semleges} semleges, ${m.hangnem.pozitiv} pozitív` }, sav('n', m.hangnem.negativ), sav('s', m.hangnem.semleges), sav('p', m.hangnem.pozitiv)),
      h('h3', { text: 'Trendek' }),
      m.trendek.length ? h('ul', { class: 'lista' }, m.trendek.map(t => h('li', {}, h('strong', { text: t.term }), ` – ma ${t.today}, átlag ${t.mean}`, t.signal ? h('span', { class: 'jelveny figy', text: ' felerősödött' }) : null, !t.enough_history ? h('span', { class: 'meta', text: 'Még kevés az előzmény a jelzéshez.' }) : null))) : h('p', { class: 'ures-szoveg', text: 'Ma még nincs találat.' }),
      h('h3', { text: 'Legutóbbi találatok' }),
      m.legutobbi.length ? h('ul', { class: 'lista' }, m.legutobbi.map(x => h('li', {}, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer', text: x.cim }), h('span', { class: 'meta', text: `${x.medium} · ${x.hangnem}` })))) : h('p', { class: 'ures-szoveg', text: 'Még nincs tárolt találat.' }));

    const anyagSav = h('section', { class: 'sav', 'aria-labelledby': 'h-je' }, h('h2', { id: 'h-je', text: 'Jelentések' }),
      d.anyagok.length ? anyagLista(d.anyagok) : h('p', { class: 'ures-szoveg', text: 'Még nincs elkészült anyag.' }));
    mainSet(my, head, h('div', { class: 'harom' }, utasitasSav, munkaSav, anyagSav),
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, id, () => viewAsztal(id))));
    szal.scrollTop = szal.scrollHeight;
  }
  const CSOPORT = { szervezet: 'szervezet', szemelyek: 'személy', temak: 'téma', kizaro: 'kizáró szó' };
  // Kulcsszójavaslat: tételenként kijelölhető, mit vegyen fel az ügynök.
  function kijelolo(u, agentId) {
    const boxes = u.muvelet.parameterek.tetelek.map((t, i) => ({ t, i, el: h('input', { type: 'checkbox', id: `t-${u.id}-${i}`, checked: true }) }));
    return h('div', { class: 'kijelolo' },
      h('ul', { class: 'lista' }, boxes.map(({ t, el, i }) => h('li', {}, h('label', { for: `t-${u.id}-${i}` }, el, ` ${t.ertek} `, h('span', { class: 'meta', text: `${CSOPORT[t.csoport]}${t.forras ? ` · ${t.forras}` : ''}` }))))),
      h('div', { class: 'sor' },
        h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => {
          const kivalasztott = boxes.filter(b => b.el.checked).map(b => b.i);
          if (!kivalasztott.length) { toast('Jelöljön ki legalább egy kifejezést, vagy vesse el a javaslatot.', true); return; }
          const r = await api('POST', `/api/utasitasok/${encodeURIComponent(u.id)}/dontes`, { dontes: 'jovahagyva', kivalasztott });
          toast(r.allapot === 'vegrehajtva' ? `${kivalasztott.length} kifejezés felvéve.` : `Nem sikerült: ${r.valasz}`, r.allapot !== 'vegrehajtva'); await viewAsztal(agentId);
        }), text: 'A kijelölteket jóváhagyom' }),
        h('button', { class: 'gomb rossz', type: 'button', onclick: guard(async () => { await api('POST', `/api/utasitasok/${encodeURIComponent(u.id)}/dontes`, { dontes: 'elvetve' }); toast('Elvetve.'); await viewAsztal(agentId); }), text: 'Mindet elvetem' })));
  }
  const TIPUS = { szemle: 'Szemle', riasztas: 'Riasztás', jelentes: 'Jelentés', valasz_tervezet: 'Választervezet' };
  const AT_TIPUS = { jelzes: 'Jelzés', kerelem: 'Kérelem', anyag_atadas: 'Anyag-átadás', kerdes: 'Kérdés' };
  const AT_ALLAPOT = { varakozik: 'Vár a címzettre', kezbesitve: 'Kézbesítve', feldolgozva: 'Feldolgozva', lezarva: 'Lezárva', megallitva: 'Megállítva', lejart: 'Lejárt' };
  const rovid = (id) => (state.iroda.ugynokok.find(a => a.id === id)?.nev || id).replace(/ Ügynök$/, '');
  // Átadások listája. `self`: melyik asztalnál nézzük (irány jelzéséhez); nélküle az összes.
  function atadasLista(items, self, refresh) {
    if (!items.length) return h('p', { class: 'ures-szoveg', text: 'Még nem volt átadás.' });
    return h('ul', { class: 'lista' }, items.map(x => h('li', {},
      h('strong', { text: x.targy }),
      h('span', { class: 'meta', text: `${AT_TIPUS[x.tipus] || x.tipus} · ${self ? (x.hova === self ? `← ${rovid(x.honnan)}` : `→ ${rovid(x.hova)}`) : `${rovid(x.honnan)} → ${rovid(x.hova)}`} · ${AT_ALLAPOT[x.allapot] || x.allapot} · ${when(x.ido)}` }),
      h('span', { text: x.szoveg }),
      x.valasz ? h('span', { class: 'meta', text: `Válasz: ${x.valasz}` }) : null,
      h('div', { class: 'sor' },
        x.anyag_id ? h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(x.anyag_id), text: 'Az anyag megnyitása' }) : null,
        ['varakozik', 'kezbesitve'].includes(x.allapot) ? h('button', { class: 'gomb rossz', type: 'button', onclick: guard(async () => { await api('POST', `/api/atadasok/${encodeURIComponent(x.id)}/megallit`, {}); toast('Az átadás megállítva.'); await refresh(); }), text: 'Megállít' }) : null))));
  }
  async function viewAtadasok(my = routeToken) {
    const filter = h('select', { 'aria-label': 'Állapot' }, h('option', { value: '', text: 'Minden átadás' }), Object.entries(AT_ALLAPOT).map(([k, v]) => h('option', { value: k, text: v })));
    const holder = h('div', { class: 'kartya' });
    const load = guard(async () => { const { atadasok } = await api('GET', `/api/atadasok${filter.value ? `?allapot=${filter.value}` : ''}`); holder.replaceChildren(atadasLista(atadasok, null, load)); });
    filter.addEventListener('change', load);
    mainSet(my, h('h1', { text: 'Átadások' }), h('p', { class: 'sugo', text: 'Így dolgoznak együtt az ügynökök: egymásnak jelzést, kérelmet, anyagot vagy kérdést adnak át. Minden átadás itt látszik, bármelyiket megállíthatja. Kifelé semmi nem megy, az átadás csak belső.' }), h('div', { class: 'sor' }, filter), holder);
    await load();
  }
  function anyagLista(anyagok) {
    return h('ul', { class: 'lista' }, anyagok.map(a => h('li', { class: `kattinthato${a.olvasott ? '' : ' olvasatlan'}`, tabindex: '0', role: 'button', onclick: () => openAnyag(a.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAnyag(a.id); } } },
      h('strong', { text: a.cim }), h('span', { class: 'meta', text: `${TIPUS[a.tipus] || a.tipus} · ${when(a.ido)}${a.olvasott ? '' : ' · új'}` }))));
  }

  // ---------- anyag megnyitása, rákérdezés
  let lastFocus = null;
  const openAnyag = guard(async (id) => {
    const { anyag, uzenetek } = await api('GET', `/api/anyagok/${encodeURIComponent(id)}`);
    lastFocus = document.activeElement;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (lastFocus && lastFocus.focus) lastFocus.focus(); route(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const thread = h('div', { class: 'uzenetek' });
    const paint = (list) => { thread.replaceChildren(...list.map(u => h('div', { class: `buborek ${u.szerep === 'vezeto' ? 'en' : 'ugynok'}`, text: u.szoveg }))); thread.scrollTop = thread.scrollHeight; };
    paint(uzenetek);
    const q = h('textarea', { 'aria-label': 'Kérdés az anyagról', maxlength: '500', placeholder: 'Kérdezzen rá erre az anyagra… (Ctrl+Enter: küldés)' });
    const ask = guard(async () => { const szoveg = q.value.trim(); if (!szoveg) return; const r = await api('POST', `/api/anyagok/${encodeURIComponent(id)}/kerdes`, { szoveg }); q.value = ''; paint(r.uzenetek); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(); } });
    const closeBtn = h('button', { class: 'gomb', type: 'button', onclick: close, text: 'Bezár' });
    const overlay = h('div', { class: 'nezo' }, h('div', { class: 'lap', role: 'dialog', 'aria-modal': 'true', 'aria-label': anyag.cim },
      h('div', { class: 'sor' }, h('span', { class: 'jelveny', text: TIPUS[anyag.tipus] || anyag.tipus }), h('span', { class: 'meta', text: when(anyag.ido) }), closeBtn),
      h('h2', { text: anyag.cim }), renderText(anyag.szoveg),
      h('div', { class: 'kerdesek' }, h('h3', { text: 'Rákérdezés' }), thread, h('div', { class: 'urlap-sor' }, q, h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: ask, text: 'Kérdés küldése' }))))));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    closeBtn.focus();
  });


  // ---------- Kapcsolattartó: az asztal és a Bejövő nézet
  const LEVEL_ALLAPOT = { uj: 'Feldolgozásra vár', tervezet_kesz: 'Tervezet kész', jovahagyva: 'Jóváhagyva', elvetve: 'Elvetve', halasztva: 'Később dönt', tovabbitva: 'Továbbítva', hiba: 'Feldolgozás sikertelen' };
  const NYITOTT = ['uj', 'tervezet_kesz', 'halasztva', 'hiba'];
  const LEVEL_TIPUS = { interju_keres: 'Interjúkérés', adatkeres: 'Adatkérés', reakcio_kerese: 'Reakciókérés', meghivas: 'Meghívás', panasz: 'Panasz', tomeges: 'Tömeges levél', egyeb: 'Egyéb' };
  const MOD = { lekerdezes: 'a postafiókot óránként lekérdezi', hid: 'a levélhíd küldi be a leveleket', kezi: 'a leveleket kézzel viszi fel' };
  const SZOLG = { icloud: 'iCloud', gmail: 'Gmail', exchange: 'Exchange / Microsoft 365', imap: 'Általános IMAP', proba: 'Próba (kézi felvitel)' };
  const levelJelek = (b) => b ? [
    b.surgossag === 'surgos' ? h('span', { class: 'jelveny figy', text: 'Sürgős' }) : null,
    b.voros_vonal ? h('span', { class: 'jelveny figy', text: 'Vörös vonal' }) : null,
    b.jogi_gyanu ? h('span', { class: 'jelveny figy', text: 'Jogi vonatkozás' }) : null,
    b.gyanus_utasitas ? h('span', { class: 'jelveny figy', text: 'Gyanús szöveg' }) : null,
    h('span', { class: 'jelveny', text: LEVEL_TIPUS[b.tipus] || b.tipus })] : [];
  const postafiokSor = (pf) => !pf.beallitva ? 'Nincs postafiók bekötve: a leveleket kézzel viheti fel a Bejövő nézetben.'
    : `${SZOLG[pf.szolgaltato]} · ${pf.cim}${pf.mappa ? ` · mappa: ${pf.mappa}` : ''} · ${MOD[pf.mod]}${pf.mod !== 'kezi' && !pf.titok_megvan ? ' · a hozzáférési titok még nincs beállítva' : ''}`;

  function kapcsolattartoAsztal(d, agentId) {
    const m = d.munka, sz = m.szamok;
    const nyitott = NYITOTT.reduce((n, k) => n + (sz[k] || 0), 0);
    const pf = m.postafiok;
    const szamSav = h('section', { class: 'sav', 'aria-labelledby': 'h-lv' }, h('h2', { id: 'h-lv', text: 'Levelek' }),
      h('div', { class: 'szamok' }, h('div', {}, h('b', { text: nyitott }), h('span', { text: 'nyitott' })), h('div', {}, h('b', { text: sz.jovahagyva || 0 }), h('span', { text: 'jóváhagyva' })), h('div', {}, h('b', { text: sz.elvetve || 0 }), h('span', { text: 'elvetve' }))),
      m.tartalom_lathato ? [h('div', { class: 'sor' }, h('a', { class: 'gomb fo', href: '#/bejovo', text: 'A Bejövő megnyitása' })),
        h('h3', { text: 'Legutóbbi levelek' }),
        m.legutobbi.length ? h('ul', { class: 'lista' }, m.legutobbi.map(l => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => { location.hash = `#/bejovo/${encodeURIComponent(l.id)}`; }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/bejovo/${encodeURIComponent(l.id)}`; } },
          h('strong', { text: l.targy }), h('span', { class: 'meta', text: `${l.felado_nev || l.felado} · ${LEVEL_ALLAPOT[l.allapot]} · ${when(l.ido)}` })))) : h('p', { class: 'ures-szoveg', text: 'Még nem érkezett levél.' })]
        : h('p', { class: 'sugo', text: 'A levelek tartalmát csak a vezető látja; üzemeltetőként a darabszámokat és a postafiók állapotát látja.' }));
    const pfSav = h('section', { class: 'sav', 'aria-labelledby': 'h-pf' }, h('h2', { id: 'h-pf', text: 'Postafiók' }),
      h('p', { text: postafiokSor(pf) }),
      pf.utolso_siker ? h('p', { class: 'meta', text: `Utolsó sikeres beolvasás: ${when(pf.utolso_siker)}` }) : null,
      pf.utolso_hiba ? h('p', { class: 'jelveny figy', role: 'alert', text: `Utolsó hiba (${when(pf.utolso_hiba_ido)}): ${pf.utolso_hiba}` }) : null,
      h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { const r = await api('POST', '/api/postafiok/beolvasas', {}); toast(r.hiba ? `Hiba: ${r.hiba}` : `Beolvasva: ${r.fogadott || 0} új levél.`, !!r.hiba); await viewAsztal(agentId); }), text: 'Beolvasás most' })),
      h('p', { class: 'sugo', text: 'Az ügynök a postafiókot csak olvassa. Kifelé semmit nem küld: a választervezet a Bejövőben vár az Ön döntésére.' }));
    const anyagSav = h('section', { class: 'sav', 'aria-labelledby': 'h-je' }, h('h2', { id: 'h-je', text: 'Tervezetek' }),
      d.anyagok.length ? anyagLista(d.anyagok) : h('p', { class: 'ures-szoveg', text: 'Még nincs elkészült tervezet.' }));
    return [h('div', { class: 'harom' }, szamSav, pfSav, anyagSav),
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, agentId, () => viewAsztal(agentId)))];
  }

  async function viewBejovo(openId, my = routeToken) {
    const filter = h('select', { id: 'lv-szuro', 'aria-label': 'Állapot' }, h('option', { value: 'nyitott', text: 'Nyitott levelek' }), h('option', { value: '', text: 'Minden levél' }), Object.entries(LEVEL_ALLAPOT).map(([k, v]) => h('option', { value: k, text: v })));
    const listBox = h('div', { class: 'kartya level-lista', 'aria-label': 'Levelek' });
    const detail = h('div', { class: 'level-reszlet', 'aria-live': 'polite' });
    const pf = await api('GET', '/api/postafiok');

    const paintList = guard(async () => {
      const r = await api('GET', '/api/levelek');
      const v = filter.value;
      const rows = r.levelek.filter(l => v === '' ? true : v === 'nyitott' ? NYITOTT.includes(l.allapot) : l.allapot === v);
      listBox.replaceChildren(rows.length ? h('ul', { class: 'lista' }, rows.map(l => h('li', { class: `kattinthato${l.olvasott ? '' : ' olvasatlan'}${l.id === openId ? ' kivalasztott' : ''}`, tabindex: '0', role: 'button',
        onclick: () => { location.hash = `#/bejovo/${encodeURIComponent(l.id)}`; }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.hash = `#/bejovo/${encodeURIComponent(l.id)}`; } } },
        h('strong', { text: l.targy }), h('span', { class: 'meta', text: `${l.felado_nev || l.felado} · ${when(l.ido)} · ${LEVEL_ALLAPOT[l.allapot]}` }), h('span', { class: 'cimke-sor' }, levelJelek(l.besorolas))))) : h('p', { class: 'ures-szoveg', text: v === 'nyitott' ? 'Nincs nyitott levél.' : 'Nincs ilyen levél.' }));
    });
    filter.addEventListener('change', paintList);

    // -- új levél felvétele
    const f = { felado: h('input', { type: 'email', id: 'nl-felado', maxlength: '200', placeholder: 'feladó@pelda.hu' }), nev: h('input', { type: 'text', id: 'nl-nev', maxlength: '120', placeholder: 'A feladó neve (nem kötelező)' }),
      targy: h('input', { type: 'text', id: 'nl-targy', maxlength: '300' }), szoveg: h('textarea', { id: 'nl-szoveg', maxlength: '20000', rows: '6', placeholder: 'A levél szövege, vagy egy telefonhívás jegyzete' }) };
    const urlap = h('div', { class: 'kartya rejtett', id: 'uj-level' }, h('h2', { text: 'Új levél vagy jegyzet felvétele' }),
      h('div', { class: 'mezo' }, h('label', { for: 'nl-felado', text: 'Feladó e-mail-címe' }), f.felado), h('div', { class: 'mezo' }, h('label', { for: 'nl-nev', text: 'Feladó neve' }), f.nev),
      h('div', { class: 'mezo' }, h('label', { for: 'nl-targy', text: 'Tárgy' }), f.targy), h('div', { class: 'mezo' }, h('label', { for: 'nl-szoveg', text: 'Szöveg' }), f.szoveg),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => {
        const r = await api('POST', '/api/levelek', { felado: f.felado.value, felado_nev: f.nev.value, targy: f.targy.value, szoveg: f.szoveg.value });
        toast(r.feldolgozva ? 'A levél felvéve, a tervezet elkészült.' : 'A levél felvéve; feldolgozásra vár.'); await viewBejovo(openId);
      }), text: 'Felvétel' })));
    const ujGomb = h('button', { class: 'gomb', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'uj-level', onclick: (e) => { const nyitva = urlap.classList.toggle('rejtett') === false; e.target.setAttribute('aria-expanded', String(nyitva)); if (nyitva) f.felado.focus(); }, text: '+ Új levél felvétele' });
    const beolvas = pf.beallitva && pf.mod === 'lekerdezes' ? h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { const r = await api('POST', '/api/postafiok/beolvasas', {}); toast(r.hiba ? `Hiba: ${r.hiba}` : `Beolvasva: ${r.fogadott || 0} új levél.`, !!r.hiba); await viewBejovo(openId); }), text: 'Postafiók beolvasása most' }) : null;

    mainSet(my, h('h1', { text: 'Bejövő' }),
      h('p', { class: 'sugo', text: 'A Kommunikációs Kapcsolattartó itt gyűjti a beérkező megkereséseket, és mindegyikhez választervezetet készít. Kifelé semmi nem megy az Ön jóváhagyása nélkül.' }),
      h('p', { class: 'meta', text: postafiokSor(pf) }),
      h('div', { class: 'sor' }, filter, ujGomb, beolvas), urlap,
      h('div', { class: 'level-rács' }, listBox, detail));
    await paintList();
    if (openId) await paintDetail(detail, openId, () => viewBejovo(openId));
    else detail.replaceChildren(h('div', { class: 'kartya' }, h('p', { class: 'ures-szoveg', text: 'Válasszon egy levelet a listából.' })));
  }

  async function paintDetail(box, id, refresh) {
    let d;
    try { d = await api('GET', `/api/levelek/${encodeURIComponent(id)}`); } catch (e) { box.replaceChildren(h('div', { class: 'kartya' }, h('p', { class: 'jelveny figy', role: 'alert', text: e.message }))); return; }
    const l = d.level, t = d.tervezet, b = l.besorolas;
    const nyitott = NYITOTT.includes(l.allapot);
    const lezar = async () => { await refresh(); };
    const parts = [];
    parts.push(h('div', { class: 'kartya' },
      h('div', { class: 'sor' }, h('span', { class: 'jelveny', text: LEVEL_ALLAPOT[l.allapot] }), h('span', { class: 'meta', text: `Érkezett: ${when(l.ido)} · ${l.forras === 'kezi' ? 'kézzel felvitt' : l.forras === 'hid' ? 'levélhídról' : 'postafiókból'}` })),
      h('h2', { text: l.targy }), h('p', { class: 'meta', text: `Feladó: ${l.felado_nev ? `${l.felado_nev} <${l.felado}>` : l.felado}` }),
      b?.gyanus_utasitas ? h('p', { class: 'jelveny figy', role: 'alert', text: 'A levél a rendszernek szóló utasításnak tűnő szöveget tartalmaz. Az ügynök ezt nem követte (a levél tartalma adat, nem utasítás), de a levelet óvatosan kezelje.' }) : null,
      h('div', { class: 'cimke-sor' }, levelJelek(b), b?.hatarido ? h('span', { class: 'jelveny', text: `Határidő: ${b.hatarido}` }) : null, b?.hangnem === 'feszult' ? h('span', { class: 'jelveny', text: 'Feszült hangnem' }) : null),
      h('pre', { class: 'level-szoveg', tabindex: '0', 'aria-label': 'A levél szövege', text: l.szoveg }),
      b ? h('p', { class: 'meta', text: `Téma: ${b.tema} · ${b.indoklas}${b.bizonytalan ? ' · A besorolás bizonytalan.' : ''}` }) : null));

    if (l.allapot === 'hiba') {
      parts.push(h('div', { class: 'kartya' }, h('p', { text: 'A tervezet elkészítése nem sikerült. Próbálja újra, vagy kezelje a levelet kézzel.' }),
        h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => { const r = await api('POST', `/api/levelek/${encodeURIComponent(id)}/ujra`, {}); toast(r.ok ? 'Elkészült a tervezet.' : 'Most sem sikerült.', !r.ok); await lezar(); }), text: 'Újrapróbálom' }))));
    }
    if (t) {
      const kock = t.kockazatok.length ? h('div', {}, h('h3', { text: 'Kockázatok és hiányzó információ' }), h('ul', { class: 'lista' }, t.kockazatok.map(k => h('li', { text: k })))) : null;
      const alap = (t.alapja.length || t.forrasok.length) ? h('div', {}, h('h3', { text: 'Amire a tervezet épül' }),
        h('ul', { class: 'lista' }, t.alapja.map(x => h('li', {}, h('strong', { text: `[${x.forras}] ` }), x.allitas)), t.forrasok.map(f => h('li', {}, h('span', { class: 'meta', text: `[${f.ref}] ${f.dokumentum_cim}${f.szakasz_cim ? ` – ${f.szakasz_cim}` : ''}` }))))) : null;
      let current = t.opciok[l.valasz?.opcio ? t.opciok.findIndex(o => o.kod === l.valasz.opcio) : 0] || t.opciok[0];
      const subj = h('input', { type: 'text', id: 'lv-targy', maxlength: '300', value: l.valasz?.targy || current.targy });
      const body = h('textarea', { id: 'lv-szoveg', rows: '12', maxlength: '5000', 'aria-label': 'A válasz szövege' }); body.value = l.valasz?.szoveg || current.szoveg;
      const radios = t.opciok.map((o, i) => ({ o, el: h('input', { type: 'radio', name: 'lv-opcio', id: `lv-o-${o.kod}`, ...(o === current ? { checked: true } : {}), ...(nyitott ? {} : { disabled: true }) }) }));
      const sync = () => { const nv = current.kod === 'nem_valaszolunk'; subj.disabled = body.disabled = !nyitott || nv; subj.parentElement?.classList.toggle('rejtett', nv); body.parentElement?.classList.toggle('rejtett', nv); };
      radios.forEach(({ o, el }) => el.addEventListener('change', () => { current = o; subj.value = o.targy; body.value = o.szoveg; sync(); }));
      const elo = d.elo;
      const hova = h('select', { id: 'lv-hova', 'aria-label': 'Továbbítás címzettje' }, [['jogi', 'Jogi és Kockázatfigyelő'], ['proaktiv', 'Proaktív Stratégia'], ['felkeszito', 'Sajtófelkészítő']].map(([k, v]) => h('option', { value: k, text: v })));
      const atirKer = h('input', { type: 'text', id: 'lv-atiras', maxlength: '300', placeholder: 'Pl.: legyen rövidebb és határozottabb', ...(d.ai ? {} : { disabled: true }) });
      const dontes = (dontesKod, extra = {}) => guard(async () => {
        const r = await api('POST', `/api/levelek/${encodeURIComponent(id)}/dontes`, { dontes: dontesKod, ...extra });
        toast(dontesKod === 'valasz' || dontesKod === 'kesobb' ? (r.kiment ? 'A válasz elment.' : 'Jóváhagyva. Próbaüzem: a válasz a kimenő mappába került, nem ment ki.') : 'Rögzítve.'); await lezar();
      });
      parts.push(h('div', { class: 'kartya' }, h('h2', { text: nyitott ? 'Választervezet' : 'A döntés' }), kock, alap,
        h('fieldset', { class: 'opciok' }, h('legend', { text: 'Mit tegyen az iroda?' }), radios.map(({ o, el }) => h('label', { for: el.id, class: 'cimke' }, el, ` ${o.cim}`))),
        h('div', { class: 'mezo' }, h('label', { for: 'lv-targy', text: 'Tárgy' }), subj), h('div', { class: 'mezo' }, h('label', { for: 'lv-szoveg', text: `A válasz szövege (a címzett: ${l.felado})` }), body),
        t.modell === 'mock' ? h('p', { class: 'sugo', text: 'Szabályalapú tervezet (nem AI). A tartalmi választ Önnek kell megírnia; a [KITÖLTENDŐ: …] jelölésű rész nélkül hagyható jóvá.' }) : null,
        nyitott ? h('div', { class: 'sor' },
          h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => {
            if (current.kod === 'nem_valaszolunk') return dontes('nem_valaszolunk')();
            return dontes(current.kod, { targy: subj.value, szoveg: body.value })();
          }), text: elo ? 'Jóváhagyom és elküldöm' : 'Jóváhagyom (próbaüzem: nem megy ki)' }),
          h('button', { class: 'gomb rossz', type: 'button', onclick: dontes('nem_valaszolunk'), text: 'Nem válaszolunk' }),
          l.allapot !== 'halasztva' ? h('button', { class: 'gomb', type: 'button', onclick: dontes('halaszt'), text: 'Később döntök' }) : null) : h('p', { class: 'meta', text: `${LEVEL_ALLAPOT[l.allapot]} · ${l.dontes_by || ''} · ${when(l.dontes_ido)}` }),
        nyitott ? h('div', { class: 'sor' }, h('label', { for: 'lv-hova', class: 'meta', text: 'Továbbítás belső átadásként:' }), hova, h('button', { class: 'gomb', type: 'button', onclick: guard(async () => dontes('tovabbit', { hova: hova.value })()), text: 'Továbbítom' })) : null,
        nyitott ? h('div', { class: 'sor' }, h('label', { for: 'lv-atiras', class: 'meta', text: 'Átírást kérek:' }), atirKer,
          h('button', { class: 'gomb', type: 'button', ...(d.ai ? {} : { disabled: true }), onclick: guard(async () => { if (!atirKer.value.trim()) return; await api('POST', `/api/levelek/${encodeURIComponent(id)}/atiras`, { utasitas: atirKer.value.trim() }); toast('Az új tervezet elkészült.'); await lezar(); }), text: 'Átírás' }),
          d.ai ? null : h('span', { class: 'sugo', text: 'Átírást csak bekapcsolt AI-val lehet kérni; AI nélkül szerkessze kézzel a szöveget.' })) : null));
      sync();
    }
    box.replaceChildren(...parts);
  }

  // ---------- összesített jelentések
  async function viewJelentesek(my = routeToken) {
    const { anyagok } = await api('GET', '/api/jelentesek');
    const nevek = Object.fromEntries(state.iroda.ugynokok.map(a => [a.id, a.nev]));
    mainSet(my, h('h1', { text: 'Jelentések' }), h('p', { class: 'sugo', text: 'Az összes ügynök elkészült anyaga időrendben.' }),
      anyagok.length ? h('div', { class: 'kartya' }, h('ul', { class: 'lista' }, anyagok.map(a => h('li', { class: `kattinthato${a.olvasott ? '' : ' olvasatlan'}`, tabindex: '0', role: 'button', onclick: () => openAnyag(a.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAnyag(a.id); } } },
        h('strong', { text: a.cim }), h('span', { class: 'meta', text: `${nevek[a.ugynok] || a.ugynok} · ${TIPUS[a.tipus] || a.tipus} · ${when(a.ido)}` }))))) : h('p', { class: 'ures-szoveg', text: 'Még nincs elkészült anyag.' }));
  }

  // ---------- dokumentumtár
  const meret = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  async function viewDokumentumok(my = routeToken) {
    const d = await api('GET', '/api/dokumentumok');
    const kat = d.kategoriak;
    const nevek = Object.fromEntries(d.ugynokok.map(a => [a.id, a.nev.replace(/ Ügynök$/, '')]));
    const refresh = () => viewDokumentumok();

    // -- feltöltés
    const fileInput = h('input', { type: 'file', id: 'fajl', multiple: true, accept: '.txt,.md,.csv,.docx,.pdf', class: 'rejtett' });
    const katSel = h('select', { id: 'f-kat', 'aria-label': 'Kategória' }, Object.entries(kat).map(([k, v]) => h('option', { value: k, text: v })));
    const cimIn = h('input', { type: 'text', id: 'f-cim', maxlength: '200', placeholder: 'Cím (nem kötelező; alapértelmezés: a fájl neve)' });
    const mind = h('input', { type: 'checkbox', id: 'f-mind', checked: true });
    const agentBoxes = d.ugynokok.map(a => ({ a, el: h('input', { type: 'checkbox', id: `f-a-${a.id}` }) }));
    const agentWrap = h('div', { class: 'cimkek rejtett' }, agentBoxes.map(({ a, el }) => h('label', { class: 'cimke', for: `f-a-${a.id}` }, el, ` ${nevek[a.id]}`)));
    mind.addEventListener('change', () => agentWrap.classList.toggle('rejtett', mind.checked));
    const aiBox = h('input', { type: 'checkbox', id: 'f-ai' });
    const eredmeny = h('ul', { class: 'lista', 'aria-live': 'polite' });
    const feltolt = guard(async (files) => {
      for (const f of [...files]) {
        const q = new URLSearchParams({ fajlnev: f.name, kategoria: katSel.value });
        if (cimIn.value.trim() && files.length === 1) q.set('cim', cimIn.value.trim());
        const scope = mind.checked ? [] : agentBoxes.filter(b => b.el.checked).map(b => b.a.id);
        if (scope.length) q.set('hatokor', scope.join(','));
        if (aiBox.checked) q.set('ai_tiltott', '1');
        const li = h('li', { text: `${f.name}: feltöltés…` }); eredmeny.prepend(li);
        try { const r = await api('POST', `/api/dokumentumok?${q}`, f); li.textContent = `${f.name}: feltöltve (${r.dokumentum.szakaszok} szakasz).`; }
        catch (e) { li.textContent = `${f.name}: ${e.message}`; li.classList.add('hibas'); }
      }
      cimIn.value = ''; fileInput.value = '';
      const fresh = await api('GET', '/api/dokumentumok'); renderList(fresh);
    });
    fileInput.addEventListener('change', () => feltolt(fileInput.files));
    const drop = h('div', { class: 'dropzona', tabindex: '0', role: 'button', 'aria-label': 'Dokumentumok feltöltése: kattintson, vagy húzza ide a fájlokat', onclick: () => fileInput.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } },
      h('strong', { text: 'Húzza ide a dokumentumokat, vagy kattintson a kiválasztáshoz' }), h('span', { class: 'meta', text: `txt, md, csv, docx, szöveges PDF · legfeljebb ${meret(d.hasznalat.korlat.fajl)} / fájl` }));
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('rajta'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('rajta'); }));
    drop.addEventListener('drop', (e) => feltolt(e.dataTransfer.files));

    // -- kérdés és keresés
    const kerdes = h('textarea', { id: 'dok-kerdes', 'aria-label': 'Kérdés a dokumentumokból', maxlength: '500', placeholder: 'Kérdezzen a feltöltött dokumentumokból… (Ctrl+Enter: küldés)' });
    const valasz = h('div', { 'aria-live': 'polite' });
    const kerd = guard(async () => {
      const szoveg = kerdes.value.trim(); if (!szoveg) return;
      const r = await api('POST', '/api/dokumentumok/kerdes', { szoveg });
      valasz.replaceChildren(h('div', { class: 'buborek ugynok', text: r.valasz }), r.forrasok.length ? h('ul', { class: 'lista' }, r.forrasok.map(f => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => openDok(f.dokumentum_id, refresh), onkeydown: (e) => { if (e.key === 'Enter') openDok(f.dokumentum_id, refresh); } }, h('strong', { text: `[${f.ref}] ${f.dokumentum_cim}` }), h('span', { class: 'meta', text: f.szakasz_cim || `${f.sorszam}. szakasz` })))) : null);
    });
    kerdes.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); kerd(); } });
    const keresIn = h('input', { type: 'text', id: 'dok-kereses', 'aria-label': 'Keresés a dokumentumokban', placeholder: 'Keresés a dokumentumokban (ragozott alakot is megtalál)' });
    const talalat = h('div');
    let keresTimer;
    keresIn.addEventListener('input', () => { clearTimeout(keresTimer); keresTimer = setTimeout(guard(async () => {
      const q = keresIn.value.trim(); if (q.length < 3) { talalat.replaceChildren(); return; }
      const r = await api('GET', `/api/dokumentumok/kereses?q=${encodeURIComponent(q)}`);
      talalat.replaceChildren(r.talalatok.length ? h('ul', { class: 'lista' }, r.talalatok.map(t => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => openDok(t.dokumentum_id, refresh), onkeydown: (e) => { if (e.key === 'Enter') openDok(t.dokumentum_id, refresh); } }, h('strong', { text: t.dokumentum_cim }), h('span', { class: 'meta', text: `${t.szakasz_cim || `${t.sorszam}. szakasz`}` }), h('span', { text: t.szoveg.slice(0, 220) + (t.szoveg.length > 220 ? '…' : '') })))) : h('p', { class: 'ures-szoveg', text: 'Nincs találat.' }));
    }), 300); });

    // -- lista
    const listBox = h('div');
    const usage = h('p', { class: 'sugo' });
    function renderList(data) {
      usage.textContent = `${data.hasznalat.darab} / ${data.hasznalat.korlat.darab} dokumentum · ${meret(data.hasznalat.bajt)} / ${meret(data.hasznalat.korlat.bajt)}`;
      listBox.replaceChildren(data.dokumentumok.length ? h('ul', { class: 'lista' }, data.dokumentumok.map(x => h('li', {},
        h('strong', { text: x.cim }),
        h('span', { class: 'meta', text: `${kat[x.kategoria]} · ${x.fajlnev} · ${meret(x.meret)} · ${x.szakaszok} szakasz · ${x.feltolto.replace(/^ember:/, '')} · ${when(x.ido)}` }),
        h('div', { class: 'sor' },
          x.ai_tiltott ? h('span', { class: 'jelveny figy', text: 'Nem küldhető AI-nak' }) : null,
          h('span', { class: 'jelveny', text: x.hatokor ? `Használja: ${x.hatokor.map(i => nevek[i] || i).join(', ')}` : 'Minden ügynök használhatja' }),
          !x.eredeti ? h('span', { class: 'jelveny', title: 'Az eredeti fájl nincs megőrizve, csak a kinyert szöveg.', text: 'Csak szöveg' }) : null),
        h('div', { class: 'sor' },
          h('button', { class: 'gomb', type: 'button', onclick: () => openDok(x.id, refresh), text: 'Megnyitás és beállítások' }),
          x.eredeti ? h('a', { class: 'gomb', href: withTenant(`/api/dokumentumok/${encodeURIComponent(x.id)}/eredeti`), text: 'Letöltés' }) : null,
          h('button', { class: 'gomb rossz', type: 'button', onclick: guard(async () => { if (!confirm(`Biztosan törli ezt a dokumentumot: „${x.cim}”? Az eredeti fájl, a szöveg és a keresési index is törlődik.`)) return; await api('DELETE', `/api/dokumentumok/${encodeURIComponent(x.id)}`); toast('A dokumentum törölve.'); await refresh(); }), text: 'Törlés' }))))) : h('p', { class: 'ures-szoveg', text: 'Még nincs feltöltött dokumentum.' }));
    }
    renderList(d);

    mainSet(my, h('h1', { text: 'Dokumentumtár' }),
      h('p', { class: 'sugo', text: 'Az itt tárolt dokumentumokból dolgoznak az ügynökök: a válaszaik mellett mindig látszik, melyik dokumentum melyik részére támaszkodtak.' }),
      d.eredeti_megorzes ? null : h('p', { class: 'sugo', role: 'note', text: 'Az eredeti fájlok tárolása nincs bekapcsolva: csak a kinyert szöveg marad meg, az eredeti nem tölthető vissza.' }),
      h('div', { class: 'kartya' }, h('h2', { text: 'Feltöltés' }), drop, fileInput,
        h('div', { class: 'mezo' }, h('label', { for: 'f-kat', text: 'Kategória' }), katSel),
        h('div', { class: 'mezo' }, h('label', { for: 'f-cim', text: 'Cím' }), cimIn),
        h('div', { class: 'mezo' }, h('span', { class: 'felirat', text: 'Melyik ügynökök használhatják?' }), h('label', {}, mind, ' Mindegyik'), agentWrap),
        h('div', { class: 'mezo' }, h('label', {}, aiBox, ' Nem küldhető AI-nak'), h('span', { class: 'sugo', text: d.ai ? 'Az AI be van kapcsolva: a nem jelölt dokumentumok részletei az AI-szolgáltatóhoz kerülhetnek.' : 'Az AI most nincs bekapcsolva. Bekapcsolás után a nem jelölt dokumentumok részletei az AI-szolgáltatóhoz kerülhetnek; a jelölt dokumentum tartalma sosem.' })),
        eredmeny),
      h('div', { class: 'kartya' }, h('h2', { text: 'Kérdés a dokumentumokból' }), kerdes, h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: kerd, text: 'Kérdés küldése' })), valasz),
      h('div', { class: 'kartya' }, h('h2', { text: 'Keresés' }), keresIn, talalat),
      h('div', { class: 'kartya' }, h('h2', { text: 'A tár tartalma' }), usage, listBox));
  }

  // Egy dokumentum megnyitása: szakaszok és beállítások (cím, kategória, hatókör, AI-jelölés).
  const openDok = guard(async (id, refresh) => {
    const [{ dokumentum: x }, meta] = await Promise.all([api('GET', `/api/dokumentumok/${encodeURIComponent(id)}`), api('GET', '/api/dokumentumok')]);
    const kat = meta.kategoriak;
    lastFocus = document.activeElement;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (lastFocus && lastFocus.focus) lastFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const cim = h('input', { type: 'text', id: 'd-cim', value: x.cim, maxlength: '200' });
    const ks = h('select', { id: 'd-kat' }, Object.entries(kat).map(([k, v]) => h('option', { value: k, ...(k === x.kategoria ? { selected: true } : {}), text: v })));
    const mind = h('input', { type: 'checkbox', id: 'd-mind', ...(x.hatokor ? {} : { checked: true }) });
    const boxes = meta.ugynokok.map(a => ({ a, el: h('input', { type: 'checkbox', id: `d-a-${a.id}`, ...(x.hatokor?.includes(a.id) ? { checked: true } : {}) }) }));
    const wrap = h('div', { class: `cimkek${x.hatokor ? '' : ' rejtett'}` }, boxes.map(({ a, el }) => h('label', { class: 'cimke', for: `d-a-${a.id}` }, el, ` ${a.nev.replace(/ Ügynök$/, '')}`)));
    mind.addEventListener('change', () => wrap.classList.toggle('rejtett', mind.checked));
    const ai = h('input', { type: 'checkbox', id: 'd-ai', ...(x.ai_tiltott ? { checked: true } : {}) });
    const mentes = guard(async () => {
      const scope = mind.checked ? [] : boxes.filter(b => b.el.checked).map(b => b.a.id);
      await api('PUT', `/api/dokumentumok/${encodeURIComponent(id)}`, { cim: cim.value, kategoria: ks.value, hatokor: scope, ai_tiltott: ai.checked });
      toast('Mentve.'); close(); await refresh();
    });
    const closeBtn = h('button', { class: 'gomb', type: 'button', onclick: close, text: 'Bezár' });
    const overlay = h('div', { class: 'nezo' }, h('div', { class: 'lap', role: 'dialog', 'aria-modal': 'true', 'aria-label': x.cim },
      h('div', { class: 'sor' }, h('span', { class: 'jelveny', text: kat[x.kategoria] }), h('span', { class: 'meta', text: `${x.fajlnev} · ${meret(x.meret)} · ${when(x.ido)}` }), closeBtn),
      h('h2', { text: x.cim }),
      h('div', { class: 'mezo' }, h('label', { for: 'd-cim', text: 'Cím' }), cim),
      h('div', { class: 'mezo' }, h('label', { for: 'd-kat', text: 'Kategória' }), ks),
      h('div', { class: 'mezo' }, h('span', { class: 'felirat', text: 'Melyik ügynökök használhatják?' }), h('label', {}, mind, ' Mindegyik'), wrap),
      h('div', { class: 'mezo' }, h('label', {}, ai, ' Nem küldhető AI-nak')),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: mentes, text: 'Mentés' })),
      h('h3', { text: `Szakaszok (${x.szakaszLista.length})` }),
      h('div', { class: 'tartalom' }, x.szakaszLista.map(s => h('section', {}, h('h3', { text: `${s.sorszam}. szakasz${s.cim ? `: ${s.cim}` : ''}` }), ...s.szoveg.split(/\n{2,}/).map(p => h('p', { class: 'szakasz-szoveg', text: p })))))));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    closeBtn.focus();
  });

  // ---------- napló
  async function viewNaplo(my = routeToken) {
    const filter = h('select', { id: 'naplo-szuro', 'aria-label': 'Eseménytípus' }, h('option', { value: '', text: 'Minden esemény' }),
      ['utasitas', 'javaslat', 'dontes', 'kerdes', 'profil_modositas', 'ugynok_ki_be_kapcsolas', 'szemle_elkuldve', 'riasztas_elkuldve', 'hiba', 'kimeno_elutasitva'].map(t => h('option', { value: t, text: t })));
    const holder = h('div', { class: 'kartya' });
    const load = guard(async () => {
      const t = filter.value; const { naplo } = await api('GET', `/api/naplo?limit=200${t ? `&tipus=${t}` : ''}`);
      holder.replaceChildren(naplo.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Idő', 'Szereplő', 'Esemény', 'Tárgy', 'Tartalom'].map(x => h('th', { text: x })))),
        h('tbody', {}, naplo.map(e => h('tr', {}, h('td', { text: when(e.ido) }), h('td', { text: e.szereplo }), h('td', { text: e.tipus }), h('td', { text: e.hivatkozas || '' }), h('td', { text: e.tartalom ? JSON.stringify(e.tartalom).slice(0, 220) : '' }))))) : h('p', { class: 'ures-szoveg', text: 'Nincs bejegyzés.' }));
    });
    filter.addEventListener('change', load);
    const csvLink = h('a', { class: 'gomb', href: state.tenant && state.iroda.ugyfelek.length > 1 ? `/api/naplo.csv?ugyfel=${encodeURIComponent(state.tenant)}&limit=500` : '/api/naplo.csv?limit=500', text: 'Letöltés CSV-ben' });
    mainSet(my, h('h1', { text: 'Napló' }), h('p', { class: 'sugo', text: 'Minden javaslat és döntés itt van: ki mit kért, mit javasolt az ügynök, és mit hagyott jóvá. A napló nem módosítható.' }), h('div', { class: 'sor' }, filter, csvLink), holder);
    await load();
  }

  // ---------- beállítások
  function tagInput(label, values, help) {
    let list = [...values];
    const wrap = h('div', { class: 'cimkek' });
    const input = h('input', { type: 'text', 'aria-label': label, placeholder: 'Írjon be egy kifejezést, Enter' });
    const paint = () => {
      const chips = list.map((v, i) => h('span', { class: 'cimke' }, v, h('button', { type: 'button', 'aria-label': `${v} eltávolítása`, onclick: () => { list.splice(i, 1); paint(); }, text: '×' })));
      wrap.replaceChildren(...chips, input);
    };
    const add = () => { const v = input.value.trim().replace(/,$/, '').trim(); if (v && !list.includes(v)) { list.push(v); } input.value = ''; paint(); input.focus(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); paint(); input.focus(); } });
    input.addEventListener('blur', () => { if (input.value.trim()) add(); });
    paint();
    return { el: h('div', { class: 'mezo' }, h('span', { class: 'felirat', text: label }), wrap, help ? h('span', { class: 'sugo', text: help }) : null), get: () => { if (input.value.trim()) add(); return [...list]; } };
  }
  async function viewBeallitasok(my = routeToken) {
    const { profil: p, szerep } = await api('GET', '/api/profil');
    const op = szerep === 'uzemelteto';
    const nev = h('input', { type: 'text', id: 'f-nev', value: p.megnevezes, maxlength: '120' });
    const kw = { szervezet: tagInput('Szervezeti nevek', p.kulcsszavak.szervezet, 'A szervezet neve és rövidítései.'), szemelyek: tagInput('Személyek', p.kulcsszavak.szemelyek, 'Vezetők, szóvivők, figyelt személyek.'), temak: tagInput('Témák', p.kulcsszavak.temak, 'Ragozott alakot is megtalál („ápolóhiány” – „ápolóhiányról”).'), kizaro: tagInput('Kizáró szavak', p.kulcsszavak.kizaro, 'Az ilyen szót tartalmazó találatot kihagyja.') };
    const keres = tagInput('Kulcsszavas keresések', p.forrasok.hirkereso, 'Hírkereső-lekérdezések; idézőjellel pontos kifejezést keres.');
    const voros = tagInput('Vörös vonalak', p.vorosvonalak, 'Ha ilyen téma megjelenik, azonnal értesítést kap, nem várja meg a reggeli szemlét.');
    let rss = p.forrasok.rss.map(s => ({ ...s }));
    const rssBox = h('div');
    const paintRss = () => { rssBox.replaceChildren(...rss.map((s, i) => h('div', { class: 'forras-sor' },
      h('input', { type: 'text', 'aria-label': 'Forrás neve', value: s.nev, oninput: (e) => { s.nev = e.target.value; } }),
      h('input', { type: 'text', 'aria-label': 'Forrás címe (https://…)', value: s.url, oninput: (e) => { s.url = e.target.value; } }),
      h('button', { class: 'gomb rossz', type: 'button', onclick: () => { rss.splice(i, 1); paintRss(); }, text: 'Töröl' }))),
      h('button', { class: 'gomb', type: 'button', onclick: () => { rss.push({ nev: '', url: 'https://' }); paintRss(); }, text: '+ Forrás hozzáadása' })); };
    paintRss();
    const ido = h('input', { type: 'time', id: 'f-ido', value: p.utemezes.szemle || '07:30' });
    const email = h('input', { type: 'email', id: 'f-email', value: p.vezeto.email, ...(op ? {} : { readonly: true }) });
    const ai = h('textarea', { id: 'f-ai', ...(op ? {} : { readonly: true }) }, p.ai_jelzes);
    ai.value = p.ai_jelzes;
    const alairas = h('textarea', { id: 'f-alairas', rows: '4', maxlength: '400', placeholder: 'Pl.: Üdvözlettel:\nSzabó Anna, sajtófőnök' }); alairas.value = p.kapcsolattarto?.alairas || '';
    const hangnem = h('textarea', { id: 'f-hangnem', rows: '3', maxlength: '300', placeholder: 'Pl.: udvarias, tárgyilagos, tömör; nem védekező' }); hangnem.value = p.kapcsolattarto?.hangnem || '';
    const pfs = p.postafiok || {};
    const pf = { szolg: h('select', { id: 'f-pf-szolg' }, h('option', { value: '', text: 'Nincs (kézi felvitel)' }), Object.entries(SZOLG).map(([k, v]) => h('option', { value: k, text: v, ...(pfs.szolgaltato === k ? { selected: true } : {}) }))),
      cim: h('input', { type: 'email', id: 'f-pf-cim', value: pfs.cim || '', maxlength: '200' }), mappa: h('input', { type: 'text', id: 'f-pf-mappa', value: pfs.mappa || 'Sajtó', maxlength: '100' }), titok: h('input', { type: 'text', id: 'f-pf-titok', value: pfs.titok || '', maxlength: '64', placeholder: 'Pl.: POSTAFIOK_NULLADIK' }) };
    const mentes = guard(async () => {
      const patch = { megnevezes: nev.value, kulcsszavak: { szervezet: kw.szervezet.get(), szemelyek: kw.szemelyek.get(), temak: kw.temak.get(), kizaro: kw.kizaro.get() }, forrasok: { rss, hirkereso: keres.get() }, vorosvonalak: voros.get(), utemezes: { szemle: ido.value } };
      patch.kapcsolattarto = { alairas: alairas.value, hangnem: hangnem.value };
      if (op) {
        patch.vezeto = { email: email.value.trim() }; patch.ai_jelzes = ai.value;
        patch.postafiok = pf.szolg.value ? { szolgaltato: pf.szolg.value, cim: pf.cim.value.trim(), mappa: pf.mappa.value.trim() || 'Sajtó', ...(pf.szolg.value === 'proba' ? {} : { titok: pf.titok.value.trim() }) } : null;
      }
      const r = await api('PUT', '/api/profil', patch);
      toast(`Mentve (${r.verzio}. változat).`); state.iroda = await api('GET', '/api/iroda'); renderHeader('beallitasok');
    });
    mainSet(my, h('h1', { text: 'Beállítások' }), h('p', { class: 'sugo', text: 'Itt adhatja meg, mit figyeljen az iroda. A módosítás a következő futástól él; minden módosítás naplózódik.' }),
      h('div', { class: 'kartya' }, h('h2', { text: 'A szervezet' }), h('div', { class: 'mezo' }, h('label', { for: 'f-nev', text: 'Szervezet neve' }), nev)),
      h('div', { class: 'kartya' }, h('h2', { text: 'Kulcsszavak' }), kw.szervezet.el, kw.szemelyek.el, kw.temak.el, kw.kizaro.el),
      h('div', { class: 'kartya' }, h('h2', { text: 'Források' }), h('div', { class: 'mezo' }, h('span', { class: 'felirat', text: 'Hírportálok (RSS)' }), rssBox, h('span', { class: 'sugo', text: 'Csak https:// címek adhatók meg.' })), keres.el),
      h('div', { class: 'kartya' }, h('h2', { text: 'Riasztás' }), voros.el),
      h('div', { class: 'kartya' }, h('h2', { text: 'Időzítés és címzett' }),
        h('div', { class: 'mezo' }, h('label', { for: 'f-ido', text: 'A napi szemle időpontja (az ügyfél időzónájában)' }), ido),
        h('div', { class: 'mezo' }, h('label', { for: 'f-email', text: 'A jelentések címzettje' }), email, h('span', { class: 'sugo', text: op ? 'Üzemeltetőként módosíthatja; a változás naplózódik.' : 'A címzett módosítását az üzemeltető végzi, mert ez dönti el, kihez érkeznek a jelentések.' })),
        h('div', { class: 'mezo' }, h('label', { for: 'f-ai', text: 'AI-jelzés a jelentések alján' }), ai, h('span', { class: 'sugo', text: op ? 'Az átláthatóság miatt nem hagyható el.' : 'Az átláthatóság miatt rögzített szöveg.' }))),
      h('div', { class: 'kartya' }, h('h2', { text: 'Kapcsolattartó: a válaszok hangja' }),
        h('div', { class: 'mezo' }, h('label', { for: 'f-alairas', text: 'Aláírás a válaszok végén' }), alairas, h('span', { class: 'sugo', text: 'Üresen hagyva a vezető neve és a szervezet neve kerül a tervezet aljára.' })),
        h('div', { class: 'mezo' }, h('label', { for: 'f-hangnem', text: 'A válaszok hangneme' }), hangnem, h('span', { class: 'sugo', text: 'Az AI ezt követi a tervezeteknél. A tervezet minden esetben csak javaslat.' }))),
      h('div', { class: 'kartya' }, h('h2', { text: 'Postafiók' }),
        op ? [h('div', { class: 'mezo' }, h('label', { for: 'f-pf-szolg', text: 'Szolgáltató' }), pf.szolg), h('div', { class: 'mezo' }, h('label', { for: 'f-pf-cim', text: 'A sajtós postafiók címe' }), pf.cim),
          h('div', { class: 'mezo' }, h('label', { for: 'f-pf-mappa', text: 'Mappa vagy címke, amelyet az iroda olvas' }), pf.mappa, h('span', { class: 'sugo', text: 'Csak ezt a mappát olvassa, a postafiók többi része nem kerül be a rendszerbe.' })),
          h('div', { class: 'mezo' }, h('label', { for: 'f-pf-titok', text: 'A hozzáférési titok NEVE' }), pf.titok, h('span', { class: 'sugo', text: 'Maga a jelszó vagy token nem ide kerül, hanem a Cloudflare titokkezelőjébe (wrangler secret put). iCloudnál alkalmazás-specifikus jelszó kell.' }))]
          : h('p', { text: p.postafiok ? `${SZOLG[p.postafiok.szolgaltato]} · ${p.postafiok.cim} · mappa: ${p.postafiok.mappa}` : 'Nincs postafiók bekötve (kézi felvitel).' }),
        op ? null : h('p', { class: 'sugo', text: 'A postafiók bekötését az üzemeltető végzi, mert a hozzáférési adatok az ő kezelésében vannak.' })),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: mentes, text: 'Mentés' })));
  }

  // ---------- telepíthetőség (PWA)
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if (state.iroda) renderHeader((location.hash || '#/').slice(2)); });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('Az iroda telepítve van.'); if (state.iroda) renderHeader((location.hash || '#/').slice(2)); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  boot();
})();
