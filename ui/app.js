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
  const isCurrent = (href, route) => (href === '#/' ? route === '' || route.startsWith('asztal') || route.startsWith('esemeny') || route === 'sajtolista' : route.startsWith(href.slice(2)));

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
    else if ((m = r.match(/^esemeny\/(.+)$/))) await viewEsemeny(decodeURIComponent(m[1]));
    else if ((m = r.match(/^poszt\/(.+)$/))) await viewPoszt(decodeURIComponent(m[1]));
    else if (r === 'sajtolista') await viewSajtolista();
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
    if (d.munka?.tipus === 'felkeszito') { mainSet(my, head, felkeszitoAsztal(d, id)); return; }
    if (d.munka?.tipus === 'proaktiv') { mainSet(my, head, proaktivAsztal(d, id)); return; }
    if (d.munka?.tipus === 'esemenyszervezo') { mainSet(my, head, esemenyszervezoAsztal(d, id)); return; }
    if (d.munka?.tipus === 'jogi') { mainSet(my, head, jogiAsztal(d, id)); return; }
    if (d.munka?.tipus === 'archivum') { mainSet(my, head, archivumAsztal(d, id)); return; }
    if (d.munka?.tipus === 'kozossegi') { mainSet(my, head, kozossegiAsztal(d, id)); return; }
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
  const TIPUS = { szemle: 'Szemle', riasztas: 'Riasztás', jelentes: 'Jelentés', valasz_tervezet: 'Választervezet', esemeny_koncepcio: 'Eseménykoncepció', esemeny_utomunka: 'Utómunka', jogi_velemeny: 'Jogi vélemény', felkeszito_csomag: 'Felkészítő csomag', megszolalasi_javaslat: 'Megszólalási javaslat', poszt_javaslat: 'Posztjavaslat', kozossegi_szemle: 'Közösségi szemle', kozossegi_jelentes: 'Közösségi jelentés' };
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
    const { anyag, uzenetek, jogi } = await api('GET', `/api/anyagok/${encodeURIComponent(id)}`);
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
      h('h2', { text: anyag.cim }),
      anyag.ugynok !== 'jogi' && state.iroda.felhasznalo.szerep === 'vezeto' ? h('div', { class: 'sor' }, jogi ? [kockazatJelveny(jogi.besorolas, 'Jogi vélemény: '), h('button', { class: 'gomb', type: 'button', onclick: () => { close(); openAnyag(jogi.velemenyek[0].id); }, text: 'A vélemény megnyitása' })] : null, ['valasz_tervezet', 'felkeszito_csomag', 'megszolalasi_javaslat', 'esemeny_koncepcio', 'esemeny_utomunka'].includes(anyag.tipus) ? h('button', { class: 'gomb', type: 'button', onclick: kerJogit(anyag.id, close), text: jogi ? 'Új jogi vélemény kérése' : 'Jogi vélemény kérése' }) : null) : null,
      renderText(anyag.szoveg),
      h('div', { class: 'kerdesek' }, h('h3', { text: 'Rákérdezés' }), thread, h('div', { class: 'urlap-sor' }, q, h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: ask, text: 'Kérdés küldése' }))))));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    closeBtn.focus();
  });



  // ---------- Felkészítő és Proaktív asztal
  const JAV_ALLAPOT = { nyitott: 'Döntésre vár', halasztva: 'Később dönt', elfogadva: 'Elfogadva', elvetve: 'Elvetve' };
  const FELK_ALKALOM = (d) => d.munka.alkalmak;

  function felkeszitoAsztal(d, agentId) {
    const m = d.munka;
    const tema = h('input', { type: 'text', id: 'fk-tema', maxlength: '300', placeholder: 'Pl.: ápolóhiány a megyei kórházakban', ...(m.tartalom_lathato ? {} : { disabled: true }) });
    const alk = h('select', { id: 'fk-alkalom' }, Object.entries(FELK_ALKALOM(d)).map(([k, v]) => h('option', { value: k, text: v })));
    const ido = h('input', { type: 'text', id: 'fk-ido', maxlength: '60', placeholder: 'Pl.: csütörtök 10:00 (nem kötelező)' });
    const mego = h('input', { type: 'text', id: 'fk-mego', maxlength: '120', placeholder: 'Pl.: a főigazgató (nem kötelező)' });
    const keszit = guard(async () => {
      if (!tema.value.trim()) { toast('Adja meg a témát.', true); return; }
      const r = await api('POST', '/api/felkeszito/csomag', { tema: tema.value, alkalom: alk.value, idopont: ido.value, megszolalo: mego.value });
      toast(r.red_flag ? 'Elkészült a csomag. Figyelem: red flag van benne, a Jogi asztal kérdést kapott.' : 'Elkészült a csomag.'); await viewAsztal(agentId);
      openAnyag(r.anyag_id);
    });
    const urlap = h('section', { class: 'sav', 'aria-labelledby': 'h-fk' }, h('h2', { id: 'h-fk', text: 'Új felkészítő csomag' }),
      m.tartalom_lathato ? null : h('p', { class: 'sugo', text: 'A csomagokat csak a vezető kérheti és olvashatja.' }),
      h('div', { class: 'mezo' }, h('label', { for: 'fk-tema', text: 'Téma' }), tema), h('div', { class: 'mezo' }, h('label', { for: 'fk-alkalom', text: 'Alkalom' }), alk),
      h('div', { class: 'mezo' }, h('label', { for: 'fk-ido', text: 'Időpont' }), ido), h('div', { class: 'mezo' }, h('label', { for: 'fk-mego', text: 'Megszólaló' }), mego),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: keszit, text: 'Csomag készítése' }), h('span', { class: 'meta', text: `Ma: ${m.csomag_ma}/${m.korlat} csomag` })),
      h('p', { class: 'sugo', text: 'A csomag a tárolt sajtócikkekből és a Dokumentumtárból épül, minden állítás forrásjelöléssel. Ami nincs forrással alátámasztva, azt [KITÖLTENDŐ] jelöli. Az anyag belső; külső használat előtt Ön átnézi.' }));
    const lista = h('section', { class: 'sav', 'aria-labelledby': 'h-cs' }, h('h2', { id: 'h-cs', text: 'Csomagok' }),
      d.anyagok.length ? anyagLista(d.anyagok) : h('p', { class: 'ures-szoveg', text: 'Még nincs csomag.' }));
    const info = h('section', { class: 'sav', 'aria-labelledby': 'h-ho' }, h('h2', { id: 'h-ho', text: 'Mit tartalmaz egy csomag?' }),
      h('ol', { class: 'lista' }, ['Háttér és helyzetkép, idővonal, érintettek, források', 'Kérdés-válasz lista: legvalószínűbb, legkellemetlenebb, legstratégiaibb', 'Üzenetkeretek: fő, másodlagos, kerülendő', 'Red flagek (jogi és vörös vonalas pontok)', 'Talking points, legfeljebb egy oldal'].map(t => h('li', { text: t }))),
      h('p', { class: 'sugo', text: 'Red flag esetén az iroda belső kérdést küld a Jogi asztalnak. A Proaktív ügynök elfogadott javaslatából is érkezhet kérelem ide.' }));
    return [h('div', { class: 'harom' }, urlap, lista, info),
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, agentId, () => viewAsztal(agentId)))];
  }

  function proaktivAsztal(d, agentId) {
    const m = d.munka;
    const javSav = h('section', { class: 'sav', 'aria-labelledby': 'h-jv' }, h('h2', { id: 'h-jv', text: 'Megszólalási javaslatok' }),
      !m.tartalom_lathato ? h('p', { class: 'sugo', text: `A javaslatok tartalmát csak a vezető látja. Döntésre váró: ${m.nyitott_db}.` })
        : m.javaslatok.length ? h('ul', { class: 'lista' }, m.javaslatok.map(j => {
          const csomag = h('input', { type: 'checkbox', id: `cs-${j.id}`, checked: true });
          const dont = (dontes) => guard(async () => { const r = await api('POST', `/api/javaslatok/${encodeURIComponent(j.id)}/dontes`, { dontes, csomag: csomag.checked }); toast(dontes === 'elfogad' ? (r.csomag_atadas && !r.csomag_atadas.hiba ? 'Elfogadva; a Felkészítő csomagot készít.' : 'Elfogadva.') : 'Rögzítve.'); await viewAsztal(agentId); });
          return h('li', {}, h('strong', { text: j.tema }), h('span', { class: 'meta', text: `${JAV_ALLAPOT[j.allapot]} · ${when(j.ido)}` }),
            h('div', { class: 'sor' }, j.anyag_id ? h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(j.anyag_id), text: 'Megnyitás' }) : null),
            j.allapot === 'elfogadva' ? h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { const r = await api('POST', '/api/esemenyek', { tema: j.tema, formatum: 'sajtotajekoztato', javaslat_id: j.id }); toast('Elkészült az eseménykoncepció; jóváhagyásra vár.'); location.hash = `#/esemeny/${encodeURIComponent(r.id)}`; }), text: 'Esemény szervezése ebből' })) : null,
            ['nyitott', 'halasztva'].includes(j.allapot) ? h('div', {},
              h('label', { class: 'cimke', for: `cs-${j.id}` }, csomag, ' Elfogadás esetén kérem a felkészítő csomagot is'),
              h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: dont('elfogad'), text: 'Elfogadom' }), h('button', { class: 'gomb rossz', type: 'button', onclick: dont('elvet'), text: 'Elvetem' }), j.allapot === 'nyitott' ? h('button', { class: 'gomb', type: 'button', onclick: dont('halaszt'), text: 'Később döntök' }) : null)) : null);
        })) : h('p', { class: 'ures-szoveg', text: 'Még nincs javaslat. A Monitoring jelzéséből automatikusan készül, vagy kérhet egyet.' }));
    const tema = h('input', { type: 'text', id: 'pj-tema', maxlength: '300', placeholder: 'Pl.: ápolóhiány: érdemes-e megszólalnunk?', ...(m.tartalom_lathato ? {} : { disabled: true }) });
    const jelzes = h('textarea', { id: 'pj-jelzes', rows: '3', maxlength: '800', placeholder: 'Háttér, ha van (nem kötelező)', ...(m.tartalom_lathato ? {} : { disabled: true }) });
    const kerPont = h('section', { class: 'sav', 'aria-labelledby': 'h-pk' }, h('h2', { id: 'h-pk', text: 'Javaslat kérése' }),
      h('div', { class: 'mezo' }, h('label', { for: 'pj-tema', text: 'Téma' }), tema), h('div', { class: 'mezo' }, h('label', { for: 'pj-jelzes', text: 'Háttér' }), jelzes),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: guard(async () => {
        if (!tema.value.trim()) { toast('Adja meg a témát.', true); return; }
        const r = await api('POST', '/api/proaktiv/javaslat', { tema: tema.value, jelzes: jelzes.value }); toast('Elkészült a javaslat.'); await viewAsztal(agentId); openAnyag(r.anyag_id);
      }), text: 'Javaslat készítése' }), h('span', { class: 'meta', text: `Ma: ${m.javaslat_ma}/${m.korlat} javaslat` })),
      h('p', { class: 'sugo', text: 'Az ügynök javaslatot tesz: mikor, milyen formában, milyen üzenettel, és mi a hallgatás kockázata. A döntés az Öné, a döntés előtt semmi nem indul el.' }),
      h('p', { class: 'sugo', text: m.szabalyok ? `A szervezet időzítési szabályai: ${m.szabalyok}` : 'Időzítési szabályokat (pl. „pénteken délután nem szólalunk meg”) a Beállításokban adhat meg.' }));
    // naptár
    const datum = h('input', { type: 'date', id: 'nt-datum' }), cim = h('input', { type: 'text', id: 'nt-cim', maxlength: '200', placeholder: 'Esemény neve' });
    const tip = h('select', { id: 'nt-tipus' }, Object.entries(m.naptar_tipusok).map(([k, v]) => h('option', { value: k, text: v })));
    const naptarSav = h('section', { class: 'sav', 'aria-labelledby': 'h-nt' }, h('h2', { id: 'h-nt', text: 'Naptár' }),
      m.tartalom_lathato ? [m.naptar.length ? h('ul', { class: 'lista' }, m.naptar.map(e => h('li', {}, h('strong', { text: `${e.datum}: ${e.cim}` }), h('span', { class: 'meta', text: m.naptar_tipusok[e.tipus] }),
        h('div', { class: 'sor' }, h('button', { class: 'gomb rossz', type: 'button', onclick: guard(async () => { await api('DELETE', `/api/naptar/${encodeURIComponent(e.id)}`); await viewAsztal(agentId); }), 'aria-label': `${e.cim} törlése`, text: 'Töröl' }))))) : h('p', { class: 'ures-szoveg', text: 'Nincs közelgő bejegyzés.' }),
        h('div', { class: 'mezo' }, h('label', { for: 'nt-datum', text: 'Dátum' }), datum), h('div', { class: 'mezo' }, h('label', { for: 'nt-cim', text: 'Esemény' }), cim), h('div', { class: 'mezo' }, h('label', { for: 'nt-tipus', text: 'Fajta' }), tip),
        h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { await api('POST', '/api/naptar', { datum: datum.value, cim: cim.value, tipus: tip.value }); toast('Felvéve.'); await viewAsztal(agentId); }), text: '+ Felvétel' })),
        h('p', { class: 'sugo', text: 'A „vezetői” és „saját” bejegyzés foglalt napnak számít az időzítési ajánlásnál; a külső esemény csak támpont.' })] : h('p', { class: 'sugo', text: 'A naptárat csak a vezető látja.' }));
    const anyagSav = h('section', { class: 'sav teljes', 'aria-labelledby': 'h-je' }, h('h2', { id: 'h-je', text: 'Elkészült anyagok' }), d.anyagok.length ? anyagLista(d.anyagok) : h('p', { class: 'ures-szoveg', text: 'Még nincs elkészült anyag.' }));
    return [h('div', { class: 'harom' }, javSav, kerPont, naptarSav), anyagSav,
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, agentId, () => viewAsztal(agentId)))];
  }


  // ---------- Eseményszervező: asztal, esemény részletei, sajtólista
  const EV_ALLAPOT = { koncepcio: 'Koncepció: jóváhagyásra vár', szervezes: 'Szervezés alatt', lezajlott: 'Lezajlott', utomunka: 'Utómunka', lezarva: 'Lezárva', elvetve: 'Elvetve', elhalasztva: 'Elhalasztva' };
  const VALASZ = { nincs: 'Nincs válasz', reszt_vesz: 'Részt vesz', nem_vesz_reszt: 'Nem vesz részt', bizonytalan: 'Bizonytalan' };
  const PRIO = { 1: '1 (kiemelt)', 2: '2', 3: '3' };

  function esemenyszervezoAsztal(d, agentId) {
    const m = d.munka;
    const tema = h('input', { type: 'text', id: 'ev-tema', maxlength: '300', placeholder: 'Pl.: a várólista-csökkentés eredményei', ...(m.tartalom_lathato ? {} : { disabled: true }) });
    const fmt = h('select', { id: 'ev-fmt' }, Object.entries(m.formatumok).map(([k, v]) => h('option', { value: k, text: v })));
    const ido = h('input', { type: 'date', id: 'ev-ido' }), hely = h('input', { type: 'text', id: 'ev-hely', maxlength: '200', placeholder: 'Nem kötelező' }), keret = h('input', { type: 'number', id: 'ev-keret', min: '0', step: '10000', placeholder: 'Ft, nem kötelező' });
    const keszit = guard(async () => {
      if (!tema.value.trim()) { toast('Adja meg az esemény témáját.', true); return; }
      const r = await api('POST', '/api/esemenyek', { tema: tema.value, formatum: fmt.value, idopont: ido.value, helyszin: hely.value, keret: keret.value === '' ? null : Number(keret.value) });
      toast(r.tullepes ? 'Elkészült a koncepció. Figyelem: a becsült költség meghaladja a keretet.' : 'Elkészült a koncepció; jóváhagyásra vár.'); location.hash = `#/esemeny/${encodeURIComponent(r.id)}`;
    });
    const urlap = h('section', { class: 'sav', 'aria-labelledby': 'h-ue' }, h('h2', { id: 'h-ue', text: 'Új esemény' }),
      m.tartalom_lathato ? null : h('p', { class: 'sugo', text: 'Az eseményeket csak a vezető indíthatja és olvashatja.' }),
      h('div', { class: 'mezo' }, h('label', { for: 'ev-tema', text: 'Téma' }), tema), h('div', { class: 'mezo' }, h('label', { for: 'ev-fmt', text: 'Formátum' }), fmt),
      h('div', { class: 'mezo' }, h('label', { for: 'ev-ido', text: 'Időpont (ha már megvan)' }), ido), h('div', { class: 'mezo' }, h('label', { for: 'ev-hely', text: 'Helyszín' }), hely), h('div', { class: 'mezo' }, h('label', { for: 'ev-keret', text: 'Költségkeret' }), keret),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: keszit, text: 'Koncepció készítése' }), h('span', { class: 'meta', text: `Ma: ${m.koncepcio_ma}/${m.korlatok.concepts} koncepció` })),
      h('p', { class: 'sugo', text: 'Az ügynök koncepciót készít (cél, célközönség, időpont, helyszín-szempontok, költségbecslés). Amíg Ön nem hagyja jóvá, meghívó nem készül és nem megy ki.' }));
    const lista = h('section', { class: 'sav', 'aria-labelledby': 'h-ev' }, h('h2', { id: 'h-ev', text: 'Események' }),
      !m.tartalom_lathato ? h('p', { class: 'sugo', text: `Jóváhagyásra váró koncepció: ${m.nyitott_db}. A tartalmat csak a vezető látja.` })
        : m.esemenyek.length ? h('ul', { class: 'lista' }, m.esemenyek.map(e => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => { location.hash = `#/esemeny/${encodeURIComponent(e.id)}`; }, onkeydown: (ev) => { if (ev.key === 'Enter') location.hash = `#/esemeny/${encodeURIComponent(e.id)}`; } },
          h('strong', { text: e.cim }), h('span', { class: 'meta', text: `${EV_ALLAPOT[e.allapot]}${e.idopont ? ` · ${e.idopont}` : ''}` })))) : h('p', { class: 'ures-szoveg', text: 'Még nincs esemény. A Proaktív elfogadott javaslatából vagy innen indíthat egyet.' }));
    const sl = h('section', { class: 'sav', 'aria-labelledby': 'h-sl' }, h('h2', { id: 'h-sl', text: 'Sajtólista' }),
      h('p', { text: `${m.kapcsolat_db} kapcsolat (legfeljebb ${m.korlatok.contacts}).` }),
      m.tartalom_lathato ? h('div', { class: 'sor' }, h('a', { class: 'gomb fo', href: '#/sajtolista', text: 'A sajtólista kezelése' })) : null,
      h('p', { class: 'sugo', text: 'Csak a hozzájárulás-jelöléssel rendelkező kapcsolat hívható meg. A név és az e-mail-cím az AI-nak nem megy át.' }));
    return [h('div', { class: 'harom' }, lista, urlap, sl),
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-je' }, h('h2', { id: 'h-je', text: 'Elkészült anyagok' }), d.anyagok.length ? anyagLista(d.anyagok) : h('p', { class: 'ures-szoveg', text: 'Még nincs elkészült anyag.' })),
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, agentId, () => viewAsztal(agentId)))];
  }

  async function viewEsemeny(id, my = routeToken) {
    const d = await api('GET', `/api/esemenyek/${encodeURIComponent(id)}`);
    const ev = d.esemeny, meghivok = d.meghivok;
    const refresh = () => viewEsemeny(id);
    const act = (path, body, okMsg) => guard(async () => { const r = await api('POST', `/api/esemenyek/${encodeURIComponent(id)}${path}`, body); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); await refresh(); });
    const dont = (kod, msg, cls = 'gomb', text) => h('button', { class: cls, type: 'button', onclick: act('/dontes', { dontes: kod }, msg), text });
    const parts = [h('div', { class: 'asztal-fej' }, h('a', { class: 'gomb vissza', href: '#/asztal/esemenyszervezo', text: '← Eseményszervező' }), h('div', {}, h('h1', { text: ev.cim }), h('div', { class: 'munkanev', text: `${EV_ALLAPOT[ev.allapot]}${ev.idopont ? ` · ${ev.idopont}` : ''}${ev.helyszin ? ` · ${ev.helyszin}` : ''}${ev.keret != null ? ` · keret: ${ev.keret.toLocaleString('hu-HU')} Ft` : ''}` })))];
    const bar = h('div', { class: 'sor' },
      ev.koncepcio_anyag_id ? h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(ev.koncepcio_anyag_id), text: 'A koncepció megnyitása' }) : null,
      ev.utomunka_anyag_id ? h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(ev.utomunka_anyag_id), text: 'Az utómunka megnyitása' }) : null,
      ev.allapot === 'koncepcio' ? [dont('jovahagy', 'A koncepció jóváhagyva: indulhat a szervezés.', 'gomb fo', 'Jóváhagyom a koncepciót'), dont('elhalaszt', 'Elhalasztva.', 'gomb', 'Elhalasztom'), dont('elvet', 'Elvetve.', 'gomb rossz', 'Elvetem')] : null,
      ev.allapot === 'szervezes' ? [dont('lezajlott', 'Lezajlottnak jelölve.', 'gomb', 'Az esemény lezajlott'), dont('elhalaszt', 'Elhalasztva.', 'gomb', 'Elhalasztom'), dont('elvet', 'Elvetve.', 'gomb rossz', 'Elvetem')] : null,
      ev.allapot === 'lezajlott' ? [h('button', { class: 'gomb fo', type: 'button', onclick: act('/utomunka', {}, 'Elkészült az utómunka-anyag.'), text: 'Utómunka készítése' }), dont('lezar', 'Lezárva.', 'gomb', 'Lezárás utómunka nélkül')] : null,
      ev.allapot === 'utomunka' ? dont('lezar', 'Lezárva.', 'gomb fo', 'Az esemény lezárása') : null);
    parts.push(h('div', { class: 'kartya' }, ev.allapot === 'koncepcio' ? h('p', { text: 'A koncepció jóváhagyásáig semmi nem indul el: meghívólista, meghívószöveg és ellenőrzőlista a jóváhagyás után készül.' }) : null, bar));

    if (['szervezes', 'lezajlott', 'utomunka', 'lezarva'].includes(ev.allapot)) {
      // ellenőrzőlista
      const items = ev.ellenorzolista.map(t => ({ ...t }));
      const clBox = h('div');
      const editable = ev.allapot === 'szervezes' || ev.allapot === 'lezajlott' || ev.allapot === 'utomunka';
      const paintCl = () => clBox.replaceChildren(h('ul', { class: 'lista' }, items.map((t, i) => h('li', { class: 'cl-sor' },
        h('label', { class: 'cimke', for: `cl-${i}` }, h('input', { type: 'checkbox', id: `cl-${i}`, ...(t.kesz ? { checked: true } : {}), ...(editable ? {} : { disabled: true }), onchange: (e) => { t.kesz = e.target.checked; } }), ` ${t.tetel}`),
        h('input', { type: 'text', 'aria-label': `Felelős: ${t.tetel}`, placeholder: 'Felelős', value: t.felelos, maxlength: '100', ...(editable ? {} : { disabled: true }), oninput: (e) => { t.felelos = e.target.value; } }),
        h('input', { type: 'date', 'aria-label': `Határidő: ${t.tetel}`, value: t.hatarido || '', ...(editable ? {} : { disabled: true }), onchange: (e) => { t.hatarido = e.target.value || null; } })))),
        editable ? h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: () => { const v = prompt_free('Új tétel'); if (v) { items.push({ id: `u${Date.now() % 100000}`, tetel: v, felelos: '', hatarido: null, kesz: false }); paintCl(); } }, text: '+ Saját tétel' }),
          h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => { await api('PUT', `/api/esemenyek/${encodeURIComponent(id)}/ellenorzolista`, { tetelek: items }); toast('Az ellenőrzőlista mentve.'); }), text: 'Az ellenőrzőlista mentése' })) : null);
      paintCl();
      parts.push(h('section', { class: 'sav teljes', 'aria-labelledby': 'h-cl' }, h('h2', { id: 'h-cl', text: `Logisztikai ellenőrzőlista (${items.filter(t => t.kesz).length}/${items.length} kész)` }), clBox));
    }

    if (ev.allapot === 'szervezes') {
      const targy = h('input', { type: 'text', id: 'mh-targy', maxlength: '300', value: ev.meghivo_targy || '' });
      const szoveg = h('textarea', { id: 'mh-szoveg', rows: '10', maxlength: '5000', 'aria-label': 'A meghívó szövege' }); szoveg.value = ev.meghivo_szoveg || '';
      const draft = meghivok.filter(i => i.allapot === 'tervezet').length;
      parts.push(h('section', { class: 'sav teljes', 'aria-labelledby': 'h-mh' }, h('h2', { id: 'h-mh', text: 'Meghívó' }),
        h('div', { class: 'mezo' }, h('label', { for: 'mh-targy', text: 'Tárgy' }), targy), h('div', { class: 'mezo' }, h('label', { for: 'mh-szoveg', text: 'Szöveg (minden címzettet „Tisztelt <név>!” megszólítással kap)' }), szoveg),
        h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { await api('PUT', `/api/esemenyek/${encodeURIComponent(id)}/meghivo`, { targy: targy.value, szoveg: szoveg.value }); toast('A meghívó szövege mentve.'); }), text: 'A szöveg mentése' }),
          h('button', { class: 'gomb fo', type: 'button', ...(draft ? {} : { disabled: true }), onclick: guard(async () => {
            await api('PUT', `/api/esemenyek/${encodeURIComponent(id)}/meghivo`, { targy: targy.value, szoveg: szoveg.value });
            const r = await api('POST', `/api/esemenyek/${encodeURIComponent(id)}/kuldes`, {});
            toast(r.kiment ? `${r.kiment} meghívó elment.` : `Jóváhagyva: ${r.elkuldve} meghívó a kimenő mappába került (próbaüzem, nem ment ki).`); await refresh();
          }), text: d.elo ? `Jóváhagyom és elküldöm (${draft} meghívó)` : `Jóváhagyom (próbaüzem: nem megy ki; ${draft} meghívó)` })),
        h('p', { class: 'sugo', text: 'A meghívó csak az Ön jóváhagyásával, a kimenő kapun át megy, és csak a sajtólistán szereplő, hozzájáruló kapcsolatoknak. A [KITÖLTENDŐ] jelölésű rész kitöltéséig nem küldhető ki.' })));

      // jelöltek
      const candBox = h('div');
      const loadCand = guard(async () => {
        const { jeloltek } = await api('GET', `/api/esemenyek/${encodeURIComponent(id)}/jeloltek`);
        const boxes = jeloltek.map(c => ({ c, el: h('input', { type: 'checkbox', id: `jc-${c.id}`, ...(c.hozzajarulas && c.prioritas === 1 ? { checked: true } : {}), ...(c.hozzajarulas ? {} : { disabled: true }) }) }));
        candBox.replaceChildren(boxes.length ? h('ul', { class: 'lista' }, boxes.map(({ c, el }) => h('li', {}, h('label', { for: el.id, class: 'cimke' }, el, ` ${c.nev} `), h('span', { class: 'meta', text: `${c.medium || '–'} · prioritás ${PRIO[c.prioritas]}${c.temahoz_illik ? ' · a témához illik' : ''}${c.hozzajarulas ? '' : ' · nincs hozzájárulás-jelölés, nem hívható'}` })))) : h('p', { class: 'ures-szoveg', text: 'Nincs több felvehető kapcsolat. A sajtólistát a Sajtólista nézetben bővítheti.' }),
          boxes.length ? h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => { const ids = boxes.filter(b => b.el.checked).map(b => b.c.id); if (!ids.length) { toast('Jelöljön ki legalább egy kapcsolatot.', true); return; } const r = await api('POST', `/api/esemenyek/${encodeURIComponent(id)}/meghivolista`, { kapcsolatok: ids }); toast(`${r.darab} kapcsolat a meghívólistára került (tervezetként).`); await refresh(); }), text: 'A kijelöltek a meghívólistára' })) : null);
      });
      parts.push(h('section', { class: 'sav teljes', 'aria-labelledby': 'h-jl' }, h('h2', { id: 'h-jl', text: 'Ki legyen a meghívottak között?' }), h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: loadCand, text: 'Jelöltek betöltése a sajtólistáról' })), candBox));
    }

    if (meghivok.length) {
      const editable = ['szervezes', 'lezajlott'].includes(ev.allapot);
      parts.push(h('section', { class: 'sav teljes', 'aria-labelledby': 'h-mv' }, h('h2', { id: 'h-mv', text: `Meghívottak (${meghivok.length})` }),
        h('div', { class: 'kartya' }, h('table', {}, h('thead', {}, h('tr', {}, ['Név', 'Médium', 'Állapot', 'Visszajelzés', ''].map(x => h('th', { text: x })))), h('tbody', {}, meghivok.map(i => {
          const sel = h('select', { 'aria-label': `Visszajelzés: ${i.nev}`, ...(editable ? {} : { disabled: true }), onchange: guard(async (e) => { await api('PUT', `/api/meghivok/${encodeURIComponent(i.id)}`, { valasz: e.target.value }); toast('Rögzítve.'); }) }, d.valaszok.map(v => h('option', { value: v, text: VALASZ[v], ...(i.valasz === v ? { selected: true } : {}) })));
          return h('tr', {}, h('td', { text: i.nev || '(törölt kapcsolat)' }), h('td', { text: i.medium || '' }), h('td', { text: i.allapot === 'tervezet' ? 'Tervezet' : 'Elküldve' }),
            h('td', {}, sel, i.valasz_javaslat && i.valasz === 'nincs' ? h('span', { class: 'meta', text: ` Javaslat a beérkezett levélből: ${VALASZ[i.valasz_javaslat]}` }) : null),
            h('td', {}, i.allapot === 'tervezet' && ev.allapot === 'szervezes' ? h('button', { class: 'gomb rossz', type: 'button', 'aria-label': `${i.nev} elhagyása`, onclick: guard(async () => { await api('DELETE', `/api/meghivok/${encodeURIComponent(i.id)}`); await refresh(); }), text: 'Elhagy' }) : null));
        }))))));
    }

    if (['szervezes', 'lezajlott'].includes(ev.allapot)) {
      parts.push(h('section', { class: 'sav teljes', 'aria-labelledby': 'h-fk' }, h('h2', { id: 'h-fk', text: 'A megszólalók felkészítése' }),
        h('p', { text: 'A Felkészítő háttéranyagot, kérdés-válasz listát és talking pointokat készít az esemény témájához.' }),
        h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { const r = await api('POST', '/api/felkeszito/csomag', { tema: ev.tema, alkalom: 'sajtotajekoztato', idopont: ev.idopont || '' }); toast('Elkészült a felkészítő csomag.'); openAnyag(r.anyag_id); }), text: 'Felkészítő csomag kérése' }))));
    }
    mainSet(my, ...parts);
  }
  const prompt_free = (label) => { const v = window.prompt(label); return v ? v.trim().slice(0, 200) : ''; };

  async function viewSajtolista(my = routeToken) {
    const d = await api('GET', '/api/sajtolista');
    const F = { nev: h('input', { type: 'text', id: 'sl-nev', maxlength: '120' }), medium: h('input', { type: 'text', id: 'sl-medium', maxlength: '120' }), email: h('input', { type: 'email', id: 'sl-email', maxlength: '200' }), tema: h('input', { type: 'text', id: 'sl-tema', maxlength: '200', placeholder: 'Pl.: egészségügy, várólista' }),
      prio: h('select', { id: 'sl-prio' }, [1, 2, 3].map(p => h('option', { value: p, text: PRIO[p], ...(p === 2 ? { selected: true } : {}) }))), hj: h('input', { type: 'checkbox', id: 'sl-hj', checked: true }) };
    const hozzaad = guard(async () => { await api('POST', '/api/sajtolista', { nev: F.nev.value, medium: F.medium.value, email: F.email.value, tema: F.tema.value, prioritas: Number(F.prio.value), hozzajarulas: F.hj.checked }); toast('Felvéve.'); await viewSajtolista(); });
    const csvText = h('textarea', { id: 'sl-csv', rows: '5', placeholder: 'név;e-mail;médium;téma;prioritás;hozzájárulás\nKovács Éva;eva@hirportal.hu;Hírportál;egészségügy;1;igen' });
    const csvFile = h('input', { type: 'file', id: 'sl-file', accept: '.csv,text/csv', 'aria-label': 'CSV-fájl kiválasztása' });
    csvFile.addEventListener('change', async () => { const f = csvFile.files[0]; if (f) csvText.value = await f.text(); });
    const csvHj = h('input', { type: 'checkbox', id: 'sl-csv-hj' });
    const csvBtn = guard(async () => {
      const r = await api('POST', '/api/sajtolista/csv', { csv: csvText.value, hozzajarulas_megerositve: csvHj.checked });
      toast(`${r.hozzaadva} kapcsolat felvéve${r.hibas_osszesen ? `, ${r.hibas_osszesen} sor hibás: ${r.hibak.slice(0, 2).join('; ')}` : ''}.`, !!r.hibas_osszesen); await viewSajtolista();
    });
    const kereso = h('input', { type: 'search', id: 'sl-q', 'aria-label': 'Keresés a sajtólistában', placeholder: 'Keresés…' });
    const tbl = h('div', { class: 'kartya' });
    const paint = (rows) => tbl.replaceChildren(rows.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Név', 'Médium', 'E-mail', 'Téma', 'Prio', 'Hozzájárulás', ''].map(x => h('th', { text: x })))), h('tbody', {}, rows.map(c => h('tr', {}, h('td', { text: c.nev }), h('td', { text: c.medium || '' }), h('td', { text: c.email }), h('td', { text: c.tema || '' }), h('td', { text: String(c.prioritas) }), h('td', { text: c.hozzajarulas ? 'igen' : 'nem' }),
      h('td', {}, h('button', { class: 'gomb rossz', type: 'button', 'aria-label': `${c.nev} törlése`, onclick: guard(async () => { await api('DELETE', `/api/sajtolista/${encodeURIComponent(c.id)}`); toast('Törölve (a meghívói is).'); await viewSajtolista(); }), text: 'Töröl' })))))) : h('p', { class: 'ures-szoveg', text: 'Nincs találat.' }));
    paint(d.kapcsolatok);
    kereso.addEventListener('input', guard(async () => { paint((await api('GET', `/api/sajtolista?q=${encodeURIComponent(kereso.value)}`)).kapcsolatok); }));
    mainSet(my, h('div', { class: 'asztal-fej' }, h('a', { class: 'gomb vissza', href: '#/asztal/esemenyszervezo', text: '← Eseményszervező' }), h('div', {}, h('h1', { text: 'Sajtólista' }), h('div', { class: 'munkanev', text: `${d.kapcsolatok.length} kapcsolat · legfeljebb ${d.korlat}` }))),
      h('p', { class: 'sugo', text: 'A sajtólista személyes adatot tartalmaz. Csak a hozzájárulás-jelöléssel rendelkező kapcsolat hívható meg eseményre; a név és az e-mail-cím az AI-nak nem megy át. Bármikor törölhet vagy exportálhat.' }),
      h('div', { class: 'harom' },
        h('section', { class: 'sav' }, h('h2', { text: 'Új kapcsolat' }), h('div', { class: 'mezo' }, h('label', { for: 'sl-nev', text: 'Név' }), F.nev), h('div', { class: 'mezo' }, h('label', { for: 'sl-medium', text: 'Médium' }), F.medium), h('div', { class: 'mezo' }, h('label', { for: 'sl-email', text: 'E-mail' }), F.email),
          h('div', { class: 'mezo' }, h('label', { for: 'sl-tema', text: 'Témák' }), F.tema), h('div', { class: 'mezo' }, h('label', { for: 'sl-prio', text: 'Prioritás' }), F.prio),
          h('label', { class: 'cimke', for: 'sl-hj' }, F.hj, ' A hozzájárulás megvan'), h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: hozzaad, text: 'Felvétel' }))),
        h('section', { class: 'sav' }, h('h2', { text: 'Feltöltés CSV-ből' }), h('div', { class: 'mezo' }, h('label', { for: 'sl-file', text: 'CSV-fájl' }), csvFile), h('div', { class: 'mezo' }, h('label', { for: 'sl-csv', text: 'vagy illessze be a tartalmát' }), csvText),
          h('label', { class: 'cimke', for: 'sl-csv-hj' }, csvHj, ' Megerősítem, hogy a listán szereplők hozzájárulása megvan (ha nincs „hozzájárulás” oszlop)'), h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: csvBtn, text: 'Feltöltés' })),
          h('p', { class: 'sugo', text: 'Kötelező oszlopok: név, e-mail. Nem kötelező: médium, téma, prioritás (1–3), megjegyzés, hozzájárulás (igen/nem).' })),
        h('section', { class: 'sav' }, h('h2', { text: 'Export' }), h('p', { text: 'A teljes lista letölthető CSV-ben.' }), h('div', { class: 'sor' }, h('a', { class: 'gomb', href: state.tenant && state.iroda.ugyfelek.length > 1 ? `/api/sajtolista.csv?ugyfel=${encodeURIComponent(state.tenant)}` : '/api/sajtolista.csv', text: 'Letöltés CSV-ben' })))),
      h('div', { class: 'sor' }, kereso), tbl);
  }



  // ---------- Közösségi média: asztal és a javaslat nézete
  const POSZT_ALLAPOT = { tervezet: 'Tervezet', jovahagyva: 'Jóváhagyva', kiadva: 'Kiadva', elvetve: 'Elvetve', kesobb: 'Később dönt', megfigyelendo: 'Megfigyelendő' };
  const HANGULAT = { negativ: 'negatív', semleges: 'semleges', pozitiv: 'pozitív' };
  const ELERES = { kicsi: 'kicsi', kozepes: 'közepes', nagy: 'nagy' };
  function kozossegiAsztal(d, agentId) {
    const m = d.munka;
    const platformChecks = m.platformok.map(p => ({ p, el: h('input', { type: 'checkbox', id: `kp-${p}`, checked: true }) }));
    const tema = h('input', { type: 'text', id: 'kp-tema', maxlength: '300', placeholder: 'Pl.: A műtéti várólista alakulása' });
    const jelzes = h('textarea', { id: 'kp-jelzes', rows: '3', maxlength: '800', placeholder: 'Mi történt, miért gondolja, hogy érdemes a közösségi médiában is megszólalni? (nem kötelező)' });
    const javaslat = h('section', { class: 'sav', 'aria-labelledby': 'h-kj' }, h('h2', { id: 'h-kj', text: 'Posztjavaslat kérése' }),
      m.tartalom_lathato ? null : h('p', { class: 'sugo', text: 'Javaslatot csak a vezető kérhet.' }),
      m.platformok.length ? [h('div', { class: 'mezo' }, h('label', { for: 'kp-tema', text: 'Téma' }), tema), h('div', { class: 'mezo' }, h('label', { for: 'kp-jelzes', text: 'Háttér' }), jelzes),
        h('fieldset', { class: 'opciok' }, h('legend', { text: 'Platformok' }), platformChecks.map(({ p, el }) => h('label', { for: el.id, class: 'cimke' }, el, ` ${m.minden_platform[p]}`))),
        h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: guard(async () => {
          if (!tema.value.trim()) { toast('Adja meg a témát.', true); return; }
          const r = await api('POST', '/api/kozossegi/javaslat', { tema: tema.value, jelzes: jelzes.value, platformok: platformChecks.filter(x => x.el.checked).map(x => x.p) });
          toast(r.megfigyelendo ? r.ok : r.kiegeszitve ? 'Erre a témára nemrég már készült javaslat; a jelzést ahhoz fűztem.' : 'Elkészült a javaslat.'); await viewAsztal(agentId); if (r.id && !r.megfigyelendo) location.hash = `#/poszt/${encodeURIComponent(r.id)}`;
        }), text: 'Javaslat készítése' }), h('span', { class: 'meta', text: `Ma: ${m.javaslat_ma}/${m.korlat}` }))]
        : h('p', { class: 'jelveny figy', text: 'Nincs bekapcsolt platform: a Beállításokban jelölje ki, hol posztol.' }));
    const lista = h('section', { class: 'sav', 'aria-labelledby': 'h-kl' }, h('h2', { id: 'h-kl', text: 'Javaslatok' }),
      !m.tartalom_lathato ? h('p', { class: 'sugo', text: `A javaslatok szövegét csak a vezető látja; Ön a darabszámot látja (${m.nyitott_db} nyitott).` })
        : m.javaslatok.length ? h('ul', { class: 'lista' }, m.javaslatok.map(j => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => { if (j.allapot === 'megfigyelendo') return; location.hash = `#/poszt/${encodeURIComponent(j.id)}`; }, onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && j.allapot !== 'megfigyelendo') { e.preventDefault(); location.hash = `#/poszt/${encodeURIComponent(j.id)}`; } } },
          h('strong', { text: j.cim }), h('span', { class: 'cimke-sor' }, h('span', { class: `jelveny${j.allapot === 'kiadva' ? ' jo' : ''}`, text: POSZT_ALLAPOT[j.allapot] || j.allapot }), h('span', { class: 'meta', text: when(j.ido) })),
          j.allapot === 'megfigyelendo' ? h('span', { class: 'meta', text: j.forras?.ok || 'Csak megjegyzés: nem készült szöveg.' }) : null))) : h('p', { class: 'ures-szoveg', text: 'Még nincs javaslat.' }));
    const sPlat = h('select', { id: 'dj-plat' }, Object.entries(m.minden_platform).map(([k, v]) => h('option', { value: k, text: v })));
    const sOssz = h('textarea', { id: 'dj-ossz', rows: '3', maxlength: '600', placeholder: 'Mit lát? (egy terjedő bejegyzés, sorozatos hozzászólás, megemlítés)' });
    const sHang = h('select', { id: 'dj-hang' }, Object.entries(m.hangulatok).map(([k, v]) => h('option', { value: k, text: v, ...(k === 'semleges' ? { selected: true } : {}) })));
    const sEler = h('select', { id: 'dj-eler' }, Object.entries(m['elerések']).map(([k, v]) => h('option', { value: k, text: v })));
    const sUrl = h('input', { type: 'url', id: 'dj-url', maxlength: '500', placeholder: 'https://… (nem kötelező)' });
    const jelzesek = h('section', { class: 'sav', 'aria-labelledby': 'h-kd' }, h('h2', { id: 'h-kd', text: 'Digitális jelzés felvitele' }),
      h('p', { class: 'sugo', text: 'Az ügynök nem olvassa a közösségi platformokat (az X, a Facebook, az Instagram és a TikTok fizetős hozzáférést kér). Amit Ön lát, azt itt viheti fel; csak a negatív hangulatú és nagy elérésű jelzés indít automatikusan javaslatot.' }),
      h('div', { class: 'mezo' }, h('label', { for: 'dj-plat', text: 'Platform' }), sPlat), h('div', { class: 'mezo' }, h('label', { for: 'dj-ossz', text: 'Összefoglaló' }), sOssz),
      h('div', { class: 'sor' }, h('label', { for: 'dj-hang', class: 'meta', text: 'Hangulat' }), sHang, h('label', { for: 'dj-eler', class: 'meta', text: 'Elérés' }), sEler), h('div', { class: 'mezo' }, h('label', { for: 'dj-url', text: 'Hivatkozás' }), sUrl),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: guard(async () => {
        const r = await api('POST', '/api/kozossegi/jelzesek', { platform: sPlat.value, osszefoglalo: sOssz.value, hangulat: sHang.value, elereles: sEler.value, url: sUrl.value || undefined });
        toast(r.javaslat?.anyagId ? 'Rögzítve; javaslat készült.' : r.javaslat?.megfigyelendo ? 'Rögzítve; megfigyelendőként megjegyezve.' : 'Rögzítve.'); await viewAsztal(agentId);
      }), text: 'Jelzés rögzítése' }), h('span', { class: 'meta', text: `Ma: ${m.jelzes_ma}/${m.jelzes_korlat}` })),
      m.tartalom_lathato && m.jelzesek.length ? h('ul', { class: 'lista' }, m.jelzesek.slice(0, 8).map(s => h('li', {}, h('strong', { text: `${m.minden_platform[s.platform] || s.platform}: ${s.osszefoglalo.slice(0, 90)}` }), h('span', { class: 'cimke-sor' }, h('span', { class: 'jelveny', text: `${HANGULAT[s.hangulat]} · elérés: ${ELERES[s.elereles]}` }), s.javaslat_id ? h('span', { class: 'jelveny jo', text: 'van hozzá bejegyzés' }) : null, h('span', { class: 'meta', text: when(s.ido) })),
          h('div', { class: 'sor' }, !s.javaslat_id ? h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { const r = await api('POST', '/api/kozossegi/javaslat', { jelzes_id: s.id }); toast('Elkészült a javaslat.'); await viewAsztal(agentId); location.hash = `#/poszt/${encodeURIComponent(r.id)}`; }), text: 'Javaslatot kérek' }) : null,
            h('button', { class: 'gomb rossz', type: 'button', onclick: guard(async () => { await api('DELETE', `/api/kozossegi/jelzesek/${encodeURIComponent(s.id)}`); await viewAsztal(agentId); }), 'aria-label': 'Jelzés törlése', text: 'Töröl' }))))) : null);
    // a Monitoring közösségi csatornákról gyűjtött szemléi és jelentései
    const jTema = h('input', { type: 'text', id: 'kj-tema', maxlength: '120', placeholder: 'Téma (nem kötelező)' });
    const jNap = h('select', { id: 'kj-nap' }, [7, 14, 30].map(n => h('option', { value: n, text: `${n} nap` })));
    const jelentesek = h('section', { class: 'sav', 'aria-labelledby': 'h-kc' }, h('h2', { id: 'h-kc', text: 'Közösségi szemle és jelentés' }),
      h('p', { class: 'sugo', text: m.kozossegi_forras_db ? `A Monitoring ${m.kozossegi_forras_db} közösségi csatornát figyel (nyilvános RSS/Atom: YouTube, Reddit, Mastodon, Bluesky stb.), a napi szemle ide kerül. Az X, Facebook, Instagram és TikTok közvetlenül nem olvasható.` : 'Még nincs közösségi csatorna beállítva. A Beállítások → Források alatt adhat meg nyilvános RSS/Atom csatornákat; az X, Facebook, Instagram és TikTok közvetlenül nem olvasható.' }),
      d.anyagok.length ? h('ul', { class: 'lista' }, d.anyagok.map(a => h('li', { class: `kattinthato${a.olvasott ? '' : ' olvasatlan'}`, tabindex: '0', role: 'button', onclick: () => openAnyag(a.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAnyag(a.id); } } }, h('strong', { text: a.cim }), h('span', { class: 'meta', text: `${TIPUS[a.tipus] || a.tipus} · ${when(a.ido)}` })))) : h('p', { class: 'ures-szoveg', text: 'Még nincs közösségi szemle.' }),
      h('div', { class: 'sor' }, jTema, jNap, h('button', { class: 'gomb', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: guard(async () => { const r = await api('POST', '/api/kozossegi/jelentes', { tema: jTema.value, napok: Number(jNap.value) }); toast(r.megjegyzes || `Elkészült: ${r.cim} (${r.darab} bejegyzés).`, !!r.megjegyzes); await viewAsztal(agentId); openAnyag(r.anyag_id); }), text: 'Jelentés kérése' })));
    return [h('div', { class: 'harom' }, lista, javaslat, jelzesek), jelentesek,
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, agentId, () => viewAsztal(agentId))),
      h('p', { class: 'sugo', text: 'Az ügynök semmit nem tesz közzé: Ön másolja ki a jóváhagyott szöveget, kiteszi, majd a „Kiadtam” gombbal rögzíti; a bejegyzés bekerül az Archívumba.' })];
  }

  async function viewPoszt(id, my = routeToken) {
    const list = await api('GET', '/api/kozossegi/javaslatok');
    const j = list.javaslatok.find(x => x.id === id);
    if (!j) { location.hash = '#/asztal/kozossegi'; return; }
    const a = (await api('GET', `/api/anyagok/${encodeURIComponent(j.anyag_id)}`)).anyag;
    const meta = a.meta || {};
    const jogi = await api('GET', `/api/jogi/velemenyek?forras=${encodeURIComponent(j.anyag_id)}`).catch(() => ({ velemenyek: [], legrosszabb: null }));
    const ar = meta.archivum || {};
    const nyitott = ['tervezet', 'kesobb'].includes(j.allapot);
    const kiadott = new Set((j.kiadva?.platformok || []).map(x => x.platform));
    const refresh = () => viewPoszt(id);
    const jogiOk = h('input', { type: 'checkbox', id: 'kp-jogi-ok' });
    const dontes = (kod) => guard(async () => {
      if (kod === 'elfogad' && jogi.legrosszabb === 'magas' && !jogiOk.checked) { toast('Erre a javaslatra magas kockázatú jogi vélemény van: olvassa el, és jelölje be, hogy tudomásul vette.', true); return; }
      await api('POST', `/api/kozossegi/javaslatok/${encodeURIComponent(id)}/dontes`, { dontes: kod, ...(kod === 'elfogad' && jogi.legrosszabb === 'magas' ? { jogi_tudomasul: true } : {}) });
      toast(kod === 'elfogad' ? 'Jóváhagyva. Másolja ki, és tegye ki; utána rögzítse a „Kiadtam” gombbal.' : 'Rögzítve.'); await refresh();
    });
    const masol = (text) => guard(async () => { try { await navigator.clipboard.writeText(text); toast('Kimásolva.'); } catch { toast('A másolás nem sikerült: jelölje ki a szöveget, és másolja kézzel.', true); } });
    const valtozatok = (meta.valtozatok || []).map(v => {
      const full = [v.szoveg, v.hashtagek.join(' ')].filter(Boolean).join('\n\n');
      const datum = h('input', { type: 'date', 'aria-label': `Kiadás napja (${m_platform(v.platform)})` });
      return h('div', { class: 'kartya' }, h('h3', { text: m_platform(v.platform) }),
        h('p', { class: `meta szamlalo${v.tul_hosszu ? ' tul' : ''}`, text: `${v.hossz}/${v.hosszkorlat} karakter${v.tul_hosszu ? ' – túl hosszú, rövidítse' : ''}` }),
        h('pre', { class: 'level-szoveg', tabindex: '0', 'aria-label': `${m_platform(v.platform)} szöveg`, text: full }), v.kepotlet ? h('p', { class: 'meta', text: `Képötlet: ${v.kepotlet}` }) : null,
        ...v.javitasok.map(x => h('p', { class: 'meta', text: x })), ...(v.blokkolo || []).map(x => h('p', { class: 'jelveny figy', role: 'alert', text: x })),
        h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: masol(full), text: 'Másolás' }),
          j.allapot === 'jovahagyva' || j.allapot === 'kiadva' ? (kiadott.has(v.platform) ? h('span', { class: 'jelveny jo', text: `Kiadva: ${(j.kiadva.platformok.find(x => x.platform === v.platform) || {}).datum}` })
            : [datum, h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => { await api('POST', `/api/kozossegi/javaslatok/${encodeURIComponent(id)}/kiadva`, { platform: v.platform, datum: datum.value || undefined, szoveg: undefined }); toast('Rögzítve; a bejegyzés az Archívumba került.'); await refresh(); }), text: 'Kiadtam' })]) : null));
    });
    const km = meta.kommentkezeles || {};
    mainSet(my, h('div', { class: 'asztal-fej' }, h('a', { class: 'gomb vissza', href: '#/asztal/kozossegi', text: '← Közösségi média' }), h('div', {}, h('h1', { text: j.cim }), h('div', { class: 'munkanev', text: `${POSZT_ALLAPOT[j.allapot]} · ${when(j.ido)}` }))),
      h('div', { class: 'kartya' },
        h('div', { class: 'cimke-sor' }, h('span', { class: 'jelveny', text: POSZT_ALLAPOT[j.allapot] }), jogi.legrosszabb ? kockazatJelveny(jogi.legrosszabb, 'Jogi: ') : null, ar.ellentmondasok?.length ? h('span', { class: 'jelveny figy', text: `Archívum: ${ar.ellentmondasok.length} ellentmondás` }) : ar.korabbi?.length ? h('span', { class: 'jelveny', text: `Archívum: ${ar.korabbi.length} korábbi közlés` }) : null, meta.modell === 'mock' ? h('span', { class: 'jelveny', text: 'Szabályalapú váz (nem AI)' }) : null),
        ...(meta.figyelmeztetesek || []).map(x => h('p', { class: 'jelveny figy', role: 'alert', text: x })),
        jogi.legrosszabb ? h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(jogi.velemenyek[0].id), text: 'A jogi vélemény megnyitása' })) : null,
        ar.ellentmondasok?.length ? h('ul', { class: 'lista' }, ar.ellentmondasok.map(c => h('li', {}, h('strong', { text: `${c.kiadva || ''}: ${c.kozles_cim || 'korábbi közlés'}` }), h('span', { text: `A javaslatban: „${c.uj_reszlet}”` }), h('span', { text: `Korábban: „${c.regi_reszlet}”` })))) : null,
        h('h3', { text: 'Helyzet' }), h('p', { text: meta.helyzet || '' }),
        h('p', { class: 'sugo', text: `Időzítési javaslat: ${meta.idozites?.datum ? `${meta.idozites.datum} (${meta.idozites.nap}) – ${meta.idozites.indok}` : meta.idozites?.indok || '—'}` })),
      valtozatok,
      meta.szal?.length ? h('div', { class: 'kartya' }, h('h3', { text: 'Magyarázó szál' }), h('ol', { class: 'lista' }, meta.szal.map(x => h('li', { text: x })))) : null,
      h('div', { class: 'kartya' }, h('h3', { text: 'Kommentkezelési útmutató' }),
        h('ul', { class: 'lista' }, (km.varhato || []).map(x => h('li', {}, h('strong', { text: x.tipus }), h('span', { text: x.valaszminta })))),
        h('p', {}, h('strong', { text: 'Mikor ne válaszoljunk: ' }), km.ne_valaszoljunk || '—'), h('p', {}, h('strong', { text: 'Mikor vonja be a vezetőt: ' }), km.bevonas || '—'), h('p', {}, h('strong', { text: 'Moderálás: ' }), km.moderalas || '—')),
      h('div', { class: 'kartya' }, h('h3', { text: 'Alternatívák' }), h('ul', { class: 'lista' }, (meta.alternativak || []).map(x => h('li', { text: `${{ nem_posztolunk: 'Nem posztolunk', csak_megkeresesre: 'Csak a megkeresésekre válaszolunk', magyarazo_szal: 'Magyarázó szál', egyeb: 'Egyéb' }[x.forma]}: ${x.indoklas}` })))),
      (meta.amire_epul?.length || meta.kockazatok?.length) ? h('div', { class: 'kartya' }, meta.amire_epul?.length ? [h('h3', { text: 'Amire épül' }), h('ul', { class: 'lista' }, meta.amire_epul.map(x => h('li', { text: x })))] : null, meta.kockazatok?.length ? [h('h3', { text: 'Kockázatok és hiányzó információ' }), h('ul', { class: 'lista' }, meta.kockazatok.map(x => h('li', { text: x })))] : null) : null,
      nyitott ? h('div', { class: 'kartya' }, h('h3', { text: 'Döntés' }),
        jogi.legrosszabb === 'magas' ? h('label', { class: 'cimke', for: 'kp-jogi-ok' }, jogiOk, ' Láttam a jogi figyelmeztetést (magas kockázat), és tudomásul veszem.') : null,
        h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', onclick: dontes('elfogad'), text: 'Elfogadom' }), h('button', { class: 'gomb rossz', type: 'button', onclick: dontes('elvet'), text: 'Elvetem' }), j.allapot !== 'kesobb' ? h('button', { class: 'gomb', type: 'button', onclick: dontes('kesobb'), text: 'Később döntök' }) : null),
        h('p', { class: 'sugo', text: 'Az ügynök semmit nem tesz közzé. Elfogadás után Ön másolja ki a szöveget, teszi ki, és rögzíti a „Kiadtam” gombbal.' })) : h('p', { class: 'meta', text: `${POSZT_ALLAPOT[j.allapot]}${j.dontes_by ? ` · ${j.dontes_by}` : ''}${j.dontes_ido ? ` · ${when(j.dontes_ido)}` : ''}` }),
      h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(j.anyag_id), text: 'A teljes javaslat szövege' })));
    function m_platform(p) { return { facebook: 'Facebook', linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X' }[p] || p; }
  }

  // ---------- Jogi és kockázat: asztal és jelvények
  const KOCKAZAT = { alacsony: 'Alacsony', kozepes: 'Közepes', magas: 'Magas' };
  const kockazatJelveny = (b, prefix = '') => h('span', { class: `jelveny${b === 'magas' ? ' figy' : b === 'alacsony' ? ' jo' : ''}`, text: `${prefix}${KOCKAZAT[b] || b}` });
  const kerJogit = (anyagId, refresh) => guard(async () => { const r = await api('POST', '/api/jogi/velemeny', { anyag_id: anyagId }); toast(`Jogi vélemény: ${KOCKAZAT[r.besorolas].toLowerCase()} kockázat, ${r.megallapitasok} megállapítás.`); if (refresh) await refresh(); openAnyag(r.id); });

  function jogiAsztal(d, agentId) {
    const m = d.munka;
    const lista = h('section', { class: 'sav', 'aria-labelledby': 'h-jv' }, h('h2', { id: 'h-jv', text: 'Vélemények' }),
      h('div', { class: 'szamok' }, h('div', {}, h('b', { text: m.osszes }), h('span', { text: 'vélemény' })), h('div', {}, h('b', { text: m.magas_db }), h('span', { text: 'magas kockázat' })), h('div', {}, h('b', { text: `${m.velemeny_ma}/${m.korlat}` }), h('span', { text: 'ma' }))),
      !m.tartalom_lathato ? h('p', { class: 'sugo', text: 'A vélemények a vizsgált szöveget idézik, ezért csak a vezető látja őket; Ön a darabszámot látja.' })
        : m.velemenyek.length ? h('ul', { class: 'lista' }, m.velemenyek.map(v => h('li', { class: `kattinthato${v.olvasott ? '' : ' olvasatlan'}`, tabindex: '0', role: 'button', onclick: () => openAnyag(v.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAnyag(v.id); } } },
          h('strong', { text: v.cim.replace(/^Jogi vélemény: /, '') }), h('span', { class: 'cimke-sor' }, kockazatJelveny(v.besorolas), v.jogasz_javasolt ? h('span', { class: 'jelveny figy', text: 'Jogász javasolt' }) : null, h('span', { class: 'meta', text: `${v.talalatok} megállapítás · ${when(v.ido)}` }))))) : h('p', { class: 'ures-szoveg', text: 'Még nincs vélemény. A többi asztal kérdésére automatikusan készül, vagy kérhet egyet.' }));
    const anyagSel = h('select', { id: 'jg-anyag' }, h('option', { value: '', text: 'Beillesztett szöveg' }), (m.vizsgalhato || []).map(a => h('option', { value: a.id, text: `${TIPUS[a.tipus] || a.tipus}: ${a.cim.slice(0, 70)}` })));
    const szoveg = h('textarea', { id: 'jg-szoveg', rows: '8', maxlength: String(m.max_szoveg), placeholder: 'Illessze be a vizsgálandó szöveget (nyilatkozat, poszt, válasz, meghívó…)' });
    const fajta = h('select', { id: 'jg-fajta' }, Object.entries(m.fajtak).map(([k, v]) => h('option', { value: k, text: v })));
    anyagSel.addEventListener('change', () => { szoveg.disabled = !!anyagSel.value; });
    const urlap = h('section', { class: 'sav', 'aria-labelledby': 'h-jk' }, h('h2', { id: 'h-jk', text: 'Vélemény kérése' }),
      m.tartalom_lathato ? null : h('p', { class: 'sugo', text: 'Véleményt csak a vezető kérhet.' }),
      h('div', { class: 'mezo' }, h('label', { for: 'jg-anyag', text: 'Mit vizsgáljon?' }), anyagSel), h('div', { class: 'mezo' }, h('label', { for: 'jg-szoveg', text: 'A szöveg' }), szoveg), h('div', { class: 'mezo' }, h('label', { for: 'jg-fajta', text: 'A szöveg fajtája' }), fajta),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: guard(async () => {
        if (!anyagSel.value && !szoveg.value.trim()) { toast('Válasszon anyagot, vagy illesszen be szöveget.', true); return; }
        const r = await api('POST', '/api/jogi/velemeny', { anyag_id: anyagSel.value || undefined, szoveg: anyagSel.value ? undefined : szoveg.value, fajta: fajta.value });
        toast(`${KOCKAZAT[r.besorolas]} kockázat, ${r.megallapitasok} megállapítás.`); await viewAsztal(agentId); openAnyag(r.id);
      }), text: 'Vélemény készítése' }), h('span', { class: 'meta', text: `Ma: ${m.velemeny_ma}/${m.korlat}` })));
    const info = h('section', { class: 'sav', 'aria-labelledby': 'h-ji' }, h('h2', { id: 'h-ji', text: 'Mit néz, és mit nem?' }),
      h('ul', { class: 'lista' }, Object.values(m.kategoriak).map(k => h('li', { text: k }))),
      h('p', { class: 'sugo', text: 'Az ügynök jelez, de nem helyettesíti a jogászt: nem jogi tanács, és törvényhelyet nem hivatkozik. A szabályalapú vizsgálat adja a besorolás alsó határát, az AI ezt csak emelheti. Minden megállapítás a szöveg szó szerinti részletére hivatkozik. Magas kockázatnál riasztást kap, és a levél jóváhagyásánál külön tudomásul kell vennie a figyelmeztetést.' }));
    return [h('div', { class: 'harom' }, lista, urlap, info),
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, agentId, () => viewAsztal(agentId)))];
  }


  // ---------- Archívum: keresés, idővonal, közlések
  const openKozles = guard(async (id) => {
    const { kozles: k } = await api('GET', `/api/archivum/kozlesek/${encodeURIComponent(id)}`);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); route(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const closeBtn = h('button', { class: 'gomb', type: 'button', onclick: close, text: 'Bezár' });
    const overlay = h('div', { class: 'nezo' }, h('div', { class: 'lap', role: 'dialog', 'aria-modal': 'true', 'aria-label': k.cim },
      h('div', { class: 'sor' }, h('span', { class: 'jelveny', text: 'Közlés' }), h('span', { class: 'meta', text: `${k.kiadva} · ${state.iroda ? '' : ''}${k.fajta}` }), closeBtn),
      h('h2', { text: k.cim }),
      h('p', { class: 'meta', text: `Címzett: ${k.cimzett_medium || '–'}${k.cimzett_domain ? ` (${k.cimzett_domain})` : ''} · jóváhagyta: ${k.jovahagyta || '–'} · ${k.kiment ? 'kiment' : 'a kimenő mappába került (próbaüzem) vagy kézzel felvitt'}` }),
      h('pre', { class: 'level-szoveg', tabindex: '0', 'aria-label': 'A közlés szövege', text: k.szoveg }),
      h('div', { class: 'sor' }, h('button', { class: 'gomb rossz', type: 'button', onclick: guard(async () => { await api('DELETE', `/api/archivum/kozlesek/${encodeURIComponent(id)}`); toast('A közlés törölve.'); close(); }), text: 'A közlés törlése' }),
        h('span', { class: 'sugo', text: 'A közlés nem módosítható, csak törölhető (a törlés naplózott).' }))));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey); document.body.append(overlay); closeBtn.focus();
  });

  function archivumAsztal(d, agentId) {
    const m = d.munka;
    const kozlesLista = (rows) => rows.length ? h('ul', { class: 'lista' }, rows.map(k => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => openKozles(k.id), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openKozles(k.id); } } },
      h('strong', { text: k.cim }), h('span', { class: 'meta', text: `${k.kiadva} · ${m.fajtak[k.fajta] || k.fajta}${k.cimzett_medium ? ` · ${k.cimzett_medium}` : ''}` }), h('span', { text: k.kivonat })))) : h('p', { class: 'ures-szoveg', text: 'Nincs találat.' });
    const q = h('input', { type: 'search', id: 'ar-q', placeholder: 'Téma, személy, kifejezés (pl. várólista)', ...(m.tartalom_lathato ? {} : { disabled: true }) });
    const fajta = h('select', { id: 'ar-fajta', 'aria-label': 'Fajta' }, h('option', { value: '', text: 'Minden fajta' }), Object.entries(m.fajtak).map(([k, v]) => h('option', { value: k, text: v })));
    const tol = h('input', { type: 'date', id: 'ar-tol', 'aria-label': 'Ettől' }), ig = h('input', { type: 'date', id: 'ar-ig', 'aria-label': 'Eddig' });
    const talalat = h('div', { class: 'ar-talalat', 'aria-live': 'polite' });
    const keres = guard(async () => {
      if (!q.value.trim()) { talalat.replaceChildren(h('p', { class: 'sugo', text: 'Írjon be egy keresőszót.' })); return; }
      const p = new URLSearchParams({ q: q.value }); if (fajta.value) p.set('fajta', fajta.value); if (tol.value) p.set('tol', tol.value); if (ig.value) p.set('ig', ig.value);
      const r = await api('GET', `/api/archivum/kereses?${p}`);
      talalat.replaceChildren(h('h3', { text: `Közlések (${r.kozlesek.length})` }), kozlesLista(r.kozlesek),
        h('h3', { text: `Dokumentumok (${r.dokumentumok.length})` }), r.dokumentumok.length ? h('ul', { class: 'lista' }, r.dokumentumok.map(x => h('li', {}, h('strong', { text: x.cim }), h('span', { class: 'meta', text: x.szakasz || '' }), h('span', { text: x.kivonat })))) : h('p', { class: 'ures-szoveg', text: 'Nincs találat.' }),
        h('h3', { text: `Ügynökök anyagai (${r.anyagok.length})` }), r.anyagok.length ? h('ul', { class: 'lista' }, r.anyagok.map(x => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => openAnyag(x.id), onkeydown: (e) => { if (e.key === 'Enter') openAnyag(x.id); } }, h('strong', { text: x.cim }), h('span', { class: 'meta', text: `${TIPUS[x.tipus] || x.tipus} · ${when(x.ido)}` })))) : h('p', { class: 'ures-szoveg', text: 'Nincs találat.' }));
    });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') keres(); });
    const idovonal = h('div', { 'aria-live': 'polite' });
    const idoQ = h('input', { type: 'text', id: 'ar-tema', placeholder: 'Téma az idővonalhoz' });
    const idoGomb = guard(async () => { const r = await api('GET', `/api/archivum/idovonal?tema=${encodeURIComponent(idoQ.value)}`); idovonal.replaceChildren(r.idovonal.length ? h('ol', { class: 'lista' }, r.idovonal.map(k => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => openKozles(k.id) }, h('strong', { text: `${k.kiadva}: ${k.cim}` }), h('span', { class: 'meta', text: `${m.fajtak[k.fajta] || k.fajta}${k.cimzett_medium ? ` · ${k.cimzett_medium}` : ''}` }), h('span', { text: k.kivonat })))) : h('p', { class: 'ures-szoveg', text: 'Nincs ehhez a témához közlés.' })); });
    const keresSav = h('section', { class: 'sav', 'aria-labelledby': 'h-ak' }, h('h2', { id: 'h-ak', text: 'Keresés' }),
      m.tartalom_lathato ? null : h('p', { class: 'sugo', text: 'Az archívum tartalmát csak a vezető látja; Ön a darabszámot látja.' }),
      h('div', { class: 'mezo' }, h('label', { for: 'ar-q', text: 'Mit keres?' }), q), h('div', { class: 'mezo' }, h('label', { for: 'ar-fajta', text: 'Fajta' }), fajta),
      h('div', { class: 'sor' }, h('label', { for: 'ar-tol', class: 'meta', text: 'Ettől' }), tol, h('label', { for: 'ar-ig', class: 'meta', text: 'Eddig' }), ig),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: keres, text: 'Keresés' })), talalat,
      h('p', { class: 'sugo', text: 'Az Archívum csak belső tudásbázis: jelez és keres, kifelé semmit nem küld.' }));
    // új közlés
    const F = { cim: h('input', { type: 'text', id: 'ak-cim', maxlength: '200' }), datum: h('input', { type: 'date', id: 'ak-datum' }), fajta: h('select', { id: 'ak-fajta' }, Object.entries(m.fajtak).filter(([k]) => k !== 'valasz' && k !== 'meghivo').map(([k, v]) => h('option', { value: k, text: v }))),
      medium: h('input', { type: 'text', id: 'ak-medium', maxlength: '120', placeholder: 'Nem kötelező' }), szoveg: h('textarea', { id: 'ak-szoveg', rows: '6', maxlength: String(m.max_szoveg), placeholder: 'A közlés teljes szövege' }) };
    const felvitel = h('section', { class: 'sav', 'aria-labelledby': 'h-af' }, h('h2', { id: 'h-af', text: 'Régi közlés felvitele' }),
      h('div', { class: 'mezo' }, h('label', { for: 'ak-cim', text: 'Cím' }), F.cim), h('div', { class: 'mezo' }, h('label', { for: 'ak-datum', text: 'Mikor adták ki?' }), F.datum), h('div', { class: 'mezo' }, h('label', { for: 'ak-fajta', text: 'Fajta' }), F.fajta),
      h('div', { class: 'mezo' }, h('label', { for: 'ak-medium', text: 'Kinek, melyik médiumnak?' }), F.medium), h('div', { class: 'mezo' }, h('label', { for: 'ak-szoveg', text: 'Szöveg' }), F.szoveg),
      h('div', { class: 'sor' }, h('button', { class: 'gomb fo', type: 'button', ...(m.tartalom_lathato ? {} : { disabled: true }), onclick: guard(async () => { await api('POST', '/api/archivum/kozlesek', { cim: F.cim.value, datum: F.datum.value, fajta: F.fajta.value, medium: F.medium.value, szoveg: F.szoveg.value }); toast('A közlés felvéve az archívumba.'); await viewAsztal(agentId); }), text: 'Felvétel' })),
      h('p', { class: 'sugo', text: `Az archívumban ${m.kozles_db} közlés van (legfeljebb ${m.korlat}); ${m.megorzes_honap} hónap után törlődnek. A jóváhagyott levélválaszok és a kiküldött meghívók automatikusan bekerülnek.` }));
    const lista = h('section', { class: 'sav', 'aria-labelledby': 'h-al' }, h('h2', { id: 'h-al', text: 'Idővonal és legutóbbi közlések' }),
      m.tartalom_lathato ? [h('div', { class: 'sor' }, idoQ, h('button', { class: 'gomb', type: 'button', onclick: idoGomb, text: 'Idővonal' })), idovonal, h('h3', { text: 'Legutóbbi közlések' }), kozlesLista(m.legutobbi),
        h('div', { class: 'sor' }, h('a', { class: 'gomb', href: state.tenant && state.iroda.ugyfelek.length > 1 ? `/api/archivum/export.csv?ugyfel=${encodeURIComponent(state.tenant)}` : '/api/archivum/export.csv', text: 'Az archívum letöltése CSV-ben' }))] : h('p', { class: 'ures-szoveg', text: 'A tartalmat csak a vezető látja.' }));
    return [h('div', { class: 'harom' }, keresSav, felvitel, lista),
      h('section', { class: 'sav teljes', 'aria-labelledby': 'h-at' }, h('h2', { id: 'h-at', text: 'Átadások más ügynökökkel' }), atadasLista(d.atadasok, agentId, () => viewAsztal(agentId)))];
  }

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
    const l = d.level, t = d.tervezet, b = l.besorolas, jg = d.jogi, ar = d.archivum;
    const nyitott = NYITOTT.includes(l.allapot);
    const lezar = async () => { await refresh(); };
    const parts = [];
    parts.push(h('div', { class: 'kartya' },
      h('div', { class: 'sor' }, h('span', { class: 'jelveny', text: LEVEL_ALLAPOT[l.allapot] }), h('span', { class: 'meta', text: `Érkezett: ${when(l.ido)} · ${l.forras === 'kezi' ? 'kézzel felvitt' : l.forras === 'hid' ? 'levélhídról' : 'postafiókból'}` })),
      h('h2', { text: l.targy }), h('p', { class: 'meta', text: `Feladó: ${l.felado_nev ? `${l.felado_nev} <${l.felado}>` : l.felado}` }),
      b?.gyanus_utasitas ? h('p', { class: 'jelveny figy', role: 'alert', text: 'A levél a rendszernek szóló utasításnak tűnő szöveget tartalmaz. Az ügynök ezt nem követte (a levél tartalma adat, nem utasítás), de a levelet óvatosan kezelje.' }) : null,
      h('div', { class: 'cimke-sor' }, levelJelek(b), b?.hatarido ? h('span', { class: 'jelveny', text: `Határidő: ${b.hatarido}` }) : null, b?.hangnem === 'feszult' ? h('span', { class: 'jelveny', text: 'Feszült hangnem' }) : null),
      h('pre', { class: 'level-szoveg', tabindex: '0', 'aria-label': 'A levél szövege', text: l.szoveg }),
      ar?.ellentmondasok?.length ? h('div', { class: 'kartya', role: 'alert' }, h('p', { class: 'jelveny figy', text: `Az Archívum ${ar.ellentmondasok.length} ponton ellentmondást jelez a korábbi közlésekkel:` }), h('ul', { class: 'lista' }, ar.ellentmondasok.map(c => h('li', {}, h('strong', { text: `${c.kiadva || ''}: ${c.kozles_cim || 'korábbi közlés'}` }), h('span', { text: `A tervezetben: „${c.uj_reszlet}”` }), h('span', { text: `Korábban: „${c.regi_reszlet}”` }), c.indoklas ? h('span', { class: 'meta', text: c.indoklas }) : null, h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: () => openKozles(c.kozles_id), text: 'A korábbi közlés megnyitása' })))))) : null,
      ar?.korabbi?.length ? h('div', {}, h('h3', { text: 'Korábbi közlések erről' }), h('ul', { class: 'lista' }, ar.korabbi.map(k => h('li', { class: 'kattinthato', tabindex: '0', role: 'button', onclick: () => openKozles(k.id), onkeydown: (e) => { if (e.key === 'Enter') openKozles(k.id); } }, h('strong', { text: `${k.kiadva}: ${k.cim}` }), h('span', { class: 'meta', text: k.fajta }), h('span', { text: k.kivonat })))), (ar.megjegyzes || (!d.ai ? 'AI nélkül az Archívum nem ítél ellentmondásról: az előzmények megmutatva, az összevetés az Öné.' : null)) ? h('p', { class: 'sugo', text: ar.megjegyzes || 'AI nélkül az Archívum nem ítél ellentmondásról: az előzmények megmutatva, az összevetés az Öné.' }) : null) : null,
      jg ? h('div', { class: 'sor' }, kockazatJelveny(jg.besorolas, 'Jogi vélemény a tervezetre: '), jg.jogasz_javasolt ? h('span', { class: 'jelveny figy', text: 'Jogász bevonása javasolt' }) : null, h('button', { class: 'gomb', type: 'button', onclick: () => openAnyag(jg.anyag_id), text: 'A jogi vélemény megnyitása' }))
        : (l.anyag_id && nyitott ? h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: kerJogit(l.anyag_id, lezar), text: 'Jogi vélemény kérése a tervezetre' })) : null),
      d.kozossegi ? h('div', { class: 'sor' }, h('span', { class: 'jelveny', text: `Közösségi javaslat: ${POSZT_ALLAPOT[d.kozossegi.allapot] || d.kozossegi.allapot}` }), h('a', { class: 'gomb', href: `#/poszt/${encodeURIComponent(d.kozossegi.id)}`, text: 'A javaslat megnyitása' }))
        : (b ? h('div', { class: 'sor' }, h('button', { class: 'gomb', type: 'button', onclick: guard(async () => { const r = await api('POST', '/api/kozossegi/javaslat', { level_id: l.id }); toast(r.megfigyelendo ? r.ok : 'Elkészült a közösségi javaslat.'); if (r.id && !r.megfigyelendo) location.hash = `#/poszt/${encodeURIComponent(r.id)}`; else await lezar(); }), text: 'Közösségi támogatás kérése' })) : null),
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
      const jogiOk = h('input', { type: 'checkbox', id: 'lv-jogi-ok' });
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
        nyitott && jg?.besorolas === 'magas' ? h('label', { class: 'cimke', for: 'lv-jogi-ok' }, jogiOk, ' Láttam a jogi figyelmeztetést (magas kockázat), és tudomásul veszem.') : null,
        nyitott ? h('div', { class: 'sor' },
          h('button', { class: 'gomb fo', type: 'button', onclick: guard(async () => {
            if (current.kod === 'nem_valaszolunk') return dontes('nem_valaszolunk')();
            if (jg?.besorolas === 'magas' && !jogiOk.checked) { toast('Erre a tervezetre magas kockázatú jogi vélemény van: olvassa el, és jelölje be, hogy tudomásul vette.', true); return; }
            return dontes(current.kod, { targy: subj.value, szoveg: body.value, ...(jg?.besorolas === 'magas' ? { jogi_tudomasul: true } : {}) })();
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
    let kforr = (p.forrasok.kozossegi || []).map(s => ({ ...s }));
    const kforrBox = h('div');
    const paintKforr = () => { kforrBox.replaceChildren(...kforr.map((s, i) => h('div', { class: 'forras-sor' },
      h('input', { type: 'text', 'aria-label': 'Közösségi csatorna neve', value: s.nev, oninput: (e) => { s.nev = e.target.value; } }),
      h('input', { type: 'text', 'aria-label': 'Közösségi csatorna címe (https://…)', value: s.url, oninput: (e) => { s.url = e.target.value; } }),
      h('select', { 'aria-label': 'Platform', onchange: (e) => { s.platform = e.target.value; } }, Object.entries(p.forras_platformok).map(([k, v]) => h('option', { value: k, text: v, ...(s.platform === k ? { selected: true } : {}) }))),
      h('button', { class: 'gomb rossz', type: 'button', onclick: () => { kforr.splice(i, 1); paintKforr(); }, text: 'Töröl' }))),
      h('button', { class: 'gomb', type: 'button', onclick: () => { kforr.push({ nev: '', url: 'https://', platform: 'egyeb' }); paintKforr(); }, text: '+ Közösségi csatorna hozzáadása' })); };
    paintKforr();
    const koz = p.kozossegi || { platformok: [], hangnem: '', tiltott_temak: [], hashtagek: [], emoji: false };
    const kozPlat = Object.entries(p.platformok).map(([k, v]) => ({ k, el: h('input', { type: 'checkbox', id: `f-kp-${k}`, ...(koz.platformok.includes(k) ? { checked: true } : {}) }), v }));
    const kozHang = h('textarea', { id: 'f-kozhang', rows: '3', maxlength: '300', placeholder: 'Pl.: közvetlen, de nem barátkozó; tárgyilagos' }); kozHang.value = koz.hangnem || '';
    const kozTilt = tagInput('Tiltott témák', koz.tiltott_temak || [], 'Ezekről az ügynök nem javasol posztot, csak megjegyzést tesz.');
    const kozHash = tagInput('Szokásos hashtagek', koz.hashtagek || [], 'Legfeljebb 5 kerül egy posztba.');
    const kozEmoji = h('input', { type: 'checkbox', id: 'f-kozemoji', ...(koz.emoji ? { checked: true } : {}) });
    const ido = h('input', { type: 'time', id: 'f-ido', value: p.utemezes.szemle || '07:30' });
    const email = h('input', { type: 'email', id: 'f-email', value: p.vezeto.email, ...(op ? {} : { readonly: true }) });
    const ai = h('textarea', { id: 'f-ai', ...(op ? {} : { readonly: true }) }, p.ai_jelzes);
    ai.value = p.ai_jelzes;
    const alairas = h('textarea', { id: 'f-alairas', rows: '4', maxlength: '400', placeholder: 'Pl.: Üdvözlettel:\nSzabó Anna, sajtófőnök' }); alairas.value = p.kapcsolattarto?.alairas || '';
    const hangnem = h('textarea', { id: 'f-hangnem', rows: '3', maxlength: '300', placeholder: 'Pl.: udvarias, tárgyilagos, tömör; nem védekező' }); hangnem.value = p.kapcsolattarto?.hangnem || '';
    const szab = h('textarea', { id: 'f-szab', rows: '3', maxlength: '600', placeholder: 'Pl.: Pénteken délután nem szólalunk meg. Hétvégén csak vörös vonalnál.' }); szab.value = p.proaktiv?.szabalyok || '';
    const pfs = p.postafiok || {};
    const pf = { szolg: h('select', { id: 'f-pf-szolg' }, h('option', { value: '', text: 'Nincs (kézi felvitel)' }), Object.entries(SZOLG).map(([k, v]) => h('option', { value: k, text: v, ...(pfs.szolgaltato === k ? { selected: true } : {}) }))),
      cim: h('input', { type: 'email', id: 'f-pf-cim', value: pfs.cim || '', maxlength: '200' }), mappa: h('input', { type: 'text', id: 'f-pf-mappa', value: pfs.mappa || 'Sajtó', maxlength: '100' }), titok: h('input', { type: 'text', id: 'f-pf-titok', value: pfs.titok || '', maxlength: '64', placeholder: 'Pl.: POSTAFIOK_NULLADIK' }) };
    const mentes = guard(async () => {
      const patch = { megnevezes: nev.value, kulcsszavak: { szervezet: kw.szervezet.get(), szemelyek: kw.szemelyek.get(), temak: kw.temak.get(), kizaro: kw.kizaro.get() }, forrasok: { rss, hirkereso: keres.get(), kozossegi: kforr.filter(s => s.url && s.url !== 'https://') }, vorosvonalak: voros.get(), utemezes: { szemle: ido.value } };
      patch.kapcsolattarto = { alairas: alairas.value, hangnem: hangnem.value };
      patch.proaktiv = { szabalyok: szab.value };
      patch.kozossegi = { platformok: kozPlat.filter(x => x.el.checked).map(x => x.k), hangnem: kozHang.value, tiltott_temak: kozTilt.get(), hashtagek: kozHash.get(), emoji: kozEmoji.checked };
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
      h('div', { class: 'kartya' }, h('h2', { text: 'Források' }), h('div', { class: 'mezo' }, h('span', { class: 'felirat', text: 'Hírportálok (RSS)' }), rssBox, h('span', { class: 'sugo', text: 'Csak https:// címek adhatók meg.' })), keres.el,
        h('div', { class: 'mezo' }, h('span', { class: 'felirat', text: 'Közösségi csatornák (nyilvános RSS/Atom)' }), kforrBox, h('span', { class: 'sugo', text: 'Pl. YouTube-csatorna, subreddit, Mastodon- vagy Bluesky-fiók csatornája. Az X, Facebook, Instagram és TikTok közvetlenül nem olvasható (fizetős hozzáférést kér). A Közösségi média asztalára külön szemle készül belőlük.' }))),
      h('div', { class: 'kartya' }, h('h2', { text: 'Riasztás' }), voros.el),
      h('div', { class: 'kartya' }, h('h2', { text: 'Időzítés és címzett' }),
        h('div', { class: 'mezo' }, h('label', { for: 'f-ido', text: 'A napi szemle időpontja (az ügyfél időzónájában)' }), ido),
        h('div', { class: 'mezo' }, h('label', { for: 'f-email', text: 'A jelentések címzettje' }), email, h('span', { class: 'sugo', text: op ? 'Üzemeltetőként módosíthatja; a változás naplózódik.' : 'A címzett módosítását az üzemeltető végzi, mert ez dönti el, kihez érkeznek a jelentések.' })),
        h('div', { class: 'mezo' }, h('label', { for: 'f-ai', text: 'AI-jelzés a jelentések alján' }), ai, h('span', { class: 'sugo', text: op ? 'Az átláthatóság miatt nem hagyható el.' : 'Az átláthatóság miatt rögzített szöveg.' }))),
      h('div', { class: 'kartya' }, h('h2', { text: 'Kapcsolattartó: a válaszok hangja' }),
        h('div', { class: 'mezo' }, h('label', { for: 'f-alairas', text: 'Aláírás a válaszok végén' }), alairas, h('span', { class: 'sugo', text: 'Üresen hagyva a vezető neve és a szervezet neve kerül a tervezet aljára.' })),
        h('div', { class: 'mezo' }, h('label', { for: 'f-hangnem', text: 'A válaszok hangneme' }), hangnem, h('span', { class: 'sugo', text: 'Az AI ezt követi a tervezeteknél. A tervezet minden esetben csak javaslat.' }))),
      h('div', { class: 'kartya' }, h('h2', { text: 'Proaktív: időzítési szabályok' }),
        h('div', { class: 'mezo' }, h('label', { for: 'f-szab', text: 'Szabályok az időzítéshez' }), szab, h('span', { class: 'sugo', text: 'Szabad szöveg: az AI ezt veszi figyelembe a megszólalási javaslatoknál.' }))),
      h('div', { class: 'kartya' }, h('h2', { text: 'Közösségi média' }),
        h('fieldset', { class: 'opciok' }, h('legend', { text: 'Platformok, ahol posztol' }), kozPlat.map(({ el, v }) => h('label', { for: el.id, class: 'cimke' }, el, ` ${v}`))),
        h('div', { class: 'mezo' }, h('label', { for: 'f-kozhang', text: 'A posztok hangneme' }), kozHang), kozTilt.el, kozHash.el,
        h('label', { class: 'cimke', for: 'f-kozemoji' }, kozEmoji, ' Emoji engedélyezett'),
        h('p', { class: 'sugo', text: 'A Közösségi média ügynök csak javasol; semmit nem tesz közzé.' })),
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
