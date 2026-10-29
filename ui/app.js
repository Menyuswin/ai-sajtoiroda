// Az iroda felülete. Külső könyvtár és beágyazott script nélkül; minden szöveg textContent-tel kerül az oldalra.
(() => {
  'use strict';
  const state = { iroda: null, tenant: null };
  let routeToken = 0; // minden oldalváltáskor nő; a lassan érkező régi nézet nem írhatja felül az újat
  const mainSet = (my, ...nodes) => { if (my === routeToken) $main.replaceChildren(...nodes); };
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

  async function api(method, path, body) {
    const sep = path.includes('?') ? '&' : '?';
    const url = state.tenant && (state.iroda?.ugyfelek || []).length > 1 ? `${path}${sep}ugyfel=${encodeURIComponent(state.tenant)}` : path;
    let res;
    try { res = await fetch(url, { method, headers: { 'X-Requested-With': 'iroda', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }); }
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
  const NAV = [['#/', 'Iroda'], ['#/jelentesek', 'Jelentések'], ['#/atadasok', 'Átadások'], ['#/naplo', 'Napló'], ['#/beallitasok', 'Beállítások']];
  function renderHeader(route) {
    const i = state.iroda;
    $head.replaceChildren(
      h('span', { class: 'cim', text: i.ugyfel.megnevezes }),
      h('nav', { 'aria-label': 'Fő menü' }, NAV.map(([href, label]) => h('a', { href, ...(isCurrent(href, route) ? { 'aria-current': 'page' } : {}), text: label }))),
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
    else if (r === 'jelentesek') await viewJelentesek();
    else if (r === 'atadasok') await viewAtadasok();
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
  const TIPPEK = ['Figyeld a várólista témát is', 'Mi történt a héten az ápolóhiány körül?', 'Szólj azonnal, ha a vezérigazgató nevét említik', 'Szüneteltesd 2026-11-05-ig'];
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
          u.allapot === 'javaslat' ? h('div', { class: 'sor' },
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
  const TIPUS = { szemle: 'Szemle', riasztas: 'Riasztás', jelentes: 'Jelentés' };
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

  // ---------- összesített jelentések
  async function viewJelentesek(my = routeToken) {
    const { anyagok } = await api('GET', '/api/jelentesek');
    const nevek = Object.fromEntries(state.iroda.ugynokok.map(a => [a.id, a.nev]));
    mainSet(my, h('h1', { text: 'Jelentések' }), h('p', { class: 'sugo', text: 'Az összes ügynök elkészült anyaga időrendben.' }),
      anyagok.length ? h('div', { class: 'kartya' }, h('ul', { class: 'lista' }, anyagok.map(a => h('li', { class: `kattinthato${a.olvasott ? '' : ' olvasatlan'}`, tabindex: '0', role: 'button', onclick: () => openAnyag(a.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAnyag(a.id); } } },
        h('strong', { text: a.cim }), h('span', { class: 'meta', text: `${nevek[a.ugynok] || a.ugynok} · ${TIPUS[a.tipus] || a.tipus} · ${when(a.ido)}` }))))) : h('p', { class: 'ures-szoveg', text: 'Még nincs elkészült anyag.' }));
  }

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
    const mentes = guard(async () => {
      const patch = { megnevezes: nev.value, kulcsszavak: { szervezet: kw.szervezet.get(), szemelyek: kw.szemelyek.get(), temak: kw.temak.get(), kizaro: kw.kizaro.get() }, forrasok: { rss, hirkereso: keres.get() }, vorosvonalak: voros.get(), utemezes: { szemle: ido.value } };
      if (op) { patch.vezeto = { email: email.value.trim() }; patch.ai_jelzes = ai.value; }
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
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: mentes, text: 'Mentés' })));
  }

  // ---------- telepíthetőség (PWA)
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if (state.iroda) renderHeader((location.hash || '#/').slice(2)); });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('Az iroda telepítve van.'); if (state.iroda) renderHeader((location.hash || '#/').slice(2)); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  boot();
})();
