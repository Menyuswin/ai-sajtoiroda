// A közösségi posztok platform-szabályai. A PROGRAM ellenőrzi (nem az AI): hosszkorlát, hashtagek, @megemlítés, a megkereső kiszűrése.
// Ami a szabályba ütközik, azt vagy javítja (pl. a @megemlítés törlése), vagy jelzi (a hosszkorlát túllépését nem csonkítja, mert a csonkított szöveg értelmet veszthet).
import { norm } from '../../core/text.js';

// Ajánlott felső határok (karakter). Az X 280, a többi platform szigorúbb tényleges korlátját a gyakorlatban ajánlott hossz adja.
export const PLATFORM_LIMITS = { facebook: 2000, linkedin: 3000, instagram: 2200, x: 280 };
export const MAX_HASHTAGS = 5;
const FREEMAIL = new Set(['gmail', 'icloud', 'outlook', 'hotmail', 'yahoo', 'freemail', 'citromail', 'protonmail', 'live', 'me']);
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
export const PLACEHOLDER = /\[KITÖLTENDŐ/;

// Azok a kifejezések, amelyek a nyilvános szövegben nem szerepelhetnek: a megkereső neve, e-mail-címe, médiuma (a címtartományból).
export function exclusionTerms(letter) {
  if (!letter) return [];
  const out = new Set();
  const name = String(letter.felado_nev || '').replace(/\s+/g, ' ').trim();
  if (name.length >= 4) out.add(name);
  for (const part of name.split(/\s+/)) if (part.length >= 5) out.add(part);
  const email = String(letter.felado || '').toLowerCase();
  if (email) out.add(email);
  const m = email.match(/@([a-z0-9-]+)\./);
  if (m && m[1].length >= 4 && !FREEMAIL.has(m[1])) out.add(m[1]);
  return [...out];
}

const hashtagsIn = (s) => (String(s).match(/#[\p{L}\p{N}_]+/gu) || []);

// Egy platformváltozat ellenőrzése és javítása. Visszatér: { szoveg, hashtagek, hossz, hosszkorlat, tul_hosszu, javitasok[], blokkolo[] }
export function checkVariant({ platform, szoveg, hashtagek = [], kepotlet = '' }, { profile, exclude = [] }) {
  const javitasok = [], blokkolo = [];
  let text = String(szoveg ?? '').replace(/\r\n?/g, '\n').trim();
  // forrásjelölések nem kerülhetnek a nyilvános szövegbe
  const noRefs = text.replace(/\[(\d{1,3}|D\d+\s*§\d+)\]/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  if (noRefs !== text) { javitasok.push('Forrásjelölés törölve a nyilvános szövegből.'); text = noRefs; }
  const noMentions = text.replace(/(^|[\s(])@[\p{L}\p{N}_.]+/gu, (m, pre) => pre);
  if (noMentions !== text) { javitasok.push('@megemlítés törölve.'); text = noMentions.replace(/[ \t]{2,}/g, ' ').trim(); }
  if (!profile.kozossegi?.emoji) {
    const noEmoji = text.replace(EMOJI, '');
    if (noEmoji !== text) { javitasok.push('Emoji törölve (a profil szerint nem engedélyezett).'); text = noEmoji.replace(/[ \t]{2,}/g, ' ').trim(); }
  }
  const nText = norm(text);
  const hit = new Set(exclude.filter(term => nText.includes(norm(term))).map(term => (term.includes('@') ? 'e-mail-cím' : 'név vagy médium')));
  for (const kind of hit) blokkolo.push(`A megkereső adata (${kind}) szerepel a nyilvános szövegben; törölje, mielőtt jóváhagyja.`);
  if (PLACEHOLDER.test(text)) blokkolo.push('A szöveg kitöltendő részt tartalmaz ([KITÖLTENDŐ: …]); írja meg, mielőtt jóváhagyja.');
  // hashtagek: a szövegbeliekkel együtt legfeljebb 5
  const inBody = hashtagsIn(text).length;
  const tags = [];
  for (const h of hashtagek) {
    const t = `#${String(h).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`;
    if (t.length > 1 && !tags.some(x => norm(x) === norm(t)) && !hashtagsIn(text).some(x => norm(x) === norm(t))) tags.push(t);
  }
  const room = Math.max(0, MAX_HASHTAGS - inBody);
  if (tags.length > room) javitasok.push(`A hashtagek száma ${MAX_HASHTAGS}-ra csökkentve.`);
  if (inBody > MAX_HASHTAGS) blokkolo.push(`A szövegben ${inBody} hashtag van; legfeljebb ${MAX_HASHTAGS} lehet.`);
  const limit = PLATFORM_LIMITS[platform] || 2000;
  const withTags = tags.slice(0, room);
  const total = text.length + (withTags.length ? 1 + withTags.join(' ').length : 0);
  const tooLong = total > limit;
  if (tooLong) javitasok.push(`A szöveg ${total} karakter, a(z) ${platform} ajánlott határa ${limit}: rövidítse (a program nem csonkít).`);
  return { platform, szoveg: text, hashtagek: withTags, kepotlet: String(kepotlet || '').slice(0, 300), hossz: total, hosszkorlat: limit, tul_hosszu: tooLong, javitasok, blokkolo };
}

// Tiltott téma: a profilban megadott kifejezések bármelyike a témában vagy a jelzésben.
export function forbiddenHit(profile, ...texts) {
  const t = norm(texts.join(' '));
  return (profile.kozossegi?.tiltott_temak || []).find(x => x && t.includes(norm(x))) || null;
}
