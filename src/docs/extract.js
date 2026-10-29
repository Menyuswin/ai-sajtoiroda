// Dokumentumok szövegének kinyerése. A fájl típusát a TARTALOM alapján ellenőrizzük, nem csak a kiterjesztés szerint.
// Támogatott: txt, md, csv, docx, szöveges PDF. (A beolvasott PDF és a képek felismerése későbbi ütem: docs/09.)
import { unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';

export class DocError extends Error {} // felhasználónak szánt, magyar hibaüzenet

export const DOC_LIMITS = { fileBytes: 10 * 1024 * 1024, count: 200, tenantBytes: 100 * 1024 * 1024, textChars: 2_000_000, sectionWords: 450 };
const EXT = new Set(['txt', 'md', 'csv', 'docx', 'pdf']);
const dec = (b, enc, fatal = false) => new TextDecoder(enc, { fatal }).decode(b);
const startsWith = (b, s) => s.every((c, i) => b[i] === c);

export function extensionOf(name) { const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }

function decodeText(bytes) {
  if (bytes.subarray(0, 8000).includes(0)) throw new DocError('A fájl nem szöveges (bináris tartalmat észleltem), ezért nem fogadható el.');
  const b = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes;
  try { return dec(b, 'utf-8', true); } catch { return dec(b, 'windows-1250'); } // régi, nem UTF-8 exportok (ő, ű helyesen)
}
const xmlText = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

// ---- blokkok: [{ cim, bekezdesek: [szöveg] }]
function blocksFromPlain(text) {
  return [{ cim: '', bekezdesek: text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean) }];
}
function blocksFromMarkdown(text) {
  const blocks = [{ cim: '', bekezdesek: [] }];
  let para = [];
  const flush = () => { if (para.length) blocks[blocks.length - 1].bekezdesek.push(para.join('\n').trim()); para = []; };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) { flush(); blocks.push({ cim: m[1].trim(), bekezdesek: [] }); }
    else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return blocks.filter(b => b.cim || b.bekezdesek.length);
}
function blocksFromCsv(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const header = lines[0], rows = lines.slice(1), blocks = [];
  for (let i = 0; i < Math.max(1, rows.length); i += 40) blocks.push({ cim: `Sorok ${i + 1}–${Math.min(i + 40, rows.length)}`, bekezdesek: [[header, ...rows.slice(i, i + 40)].join('\n')] });
  return blocks;
}
function blocksFromDocx(bytes) {
  if (!startsWith(bytes, [0x50, 0x4b, 3, 4])) throw new DocError('A fájl nem érvényes Word-dokumentum (docx).');
  let files;
  try { files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' && f.originalSize <= 30 * 1024 * 1024 }); }
  catch { throw new DocError('A Word-dokumentum nem olvasható (sérült vagy védett fájl).'); }
  const xml = files['word/document.xml'] && dec(files['word/document.xml'], 'utf-8');
  if (!xml) throw new DocError('A fájl nem Word-dokumentum: hiányzik belőle a szöveg (word/document.xml), vagy túl nagy.');
  const paraText = (p) => xmlText([...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)].map(m => (m[1] !== undefined ? m[1] : ' ')).join(''));
  const blocks = [{ cim: '', bekezdesek: [] }];
  for (const m of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>|<w:p\b[\s\S]*?<\/w:p>/g)) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tr')) { // táblázatsor: a cellák egy sorba, „ | ” jellel
      const cells = [...chunk.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(c => [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(p => paraText(p[0]).trim()).filter(Boolean).join(' '));
      const row = cells.join(' | ').trim();
      if (row.replace(/[|\s]/g, '')) blocks[blocks.length - 1].bekezdesek.push(row);
      continue;
    }
    const text = paraText(chunk).trim();
    if (!text) continue;
    const style = (chunk.match(/<w:pStyle\s+w:val="([^"]+)"/) || [])[1] || '';
    if (/^(heading\s*\d|title|cím|címsor)/i.test(style)) blocks.push({ cim: text, bekezdesek: [] });
    else blocks[blocks.length - 1].bekezdesek.push(text);
  }
  return blocks.filter(b => b.cim || b.bekezdesek.length);
}
async function blocksFromPdf(bytes) {
  if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw new DocError('A fájl nem érvényes PDF.');
  let pages;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    pages = (await extractText(pdf, { mergePages: false })).text;
  } catch { throw new DocError('A PDF nem olvasható (sérült vagy jelszóval védett fájl).'); }
  const chars = pages.join('').replace(/\s/g, '').length;
  if (chars < 20 * Math.max(1, pages.length)) throw new DocError('A PDF-ben nincs kinyerhető szöveg (valószínűleg beolvasott kép). A beolvasott dokumentumok felismerése későbbi ütemben érkezik.');
  return pages.map((t, i) => ({ cim: `${i + 1}. oldal`, bekezdesek: t.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) })).filter(b => b.bekezdesek.length);
}

// ---- szakaszokra bontás (kb. 450 szó, címhez kötve)
export function chunkBlocks(blocks, maxWords = DOC_LIMITS.sectionWords) {
  const out = [];
  const words = (s) => s.split(/\s+/).filter(Boolean);
  for (const b of blocks) {
    let cur = [], n = 0;
    const flush = () => { if (cur.length) out.push({ cim: b.cim, szoveg: cur.join('\n\n') }); cur = []; n = 0; };
    for (const para of b.bekezdesek) {
      const parts = words(para).length > maxWords ? para.split(/(?<=[.!?])\s+/) : [para];
      for (const part of parts) {
        const w = words(part).length;
        if (w > maxWords) { // nagyon hosszú mondat: szószám szerint vágjuk
          const all = words(part);
          for (let i = 0; i < all.length; i += maxWords) { flush(); cur.push(all.slice(i, i + maxWords).join(' ')); n = Math.min(maxWords, all.length - i); flush(); }
          continue;
        }
        if (n + w > maxWords) flush();
        cur.push(part); n += w;
      }
    }
    flush();
    if (!b.bekezdesek.length && b.cim) out.push({ cim: b.cim, szoveg: b.cim });
  }
  return out.map((s, i) => ({ ...s, sorszam: i + 1 }));
}

export async function extractDocument(bytes, filename) {
  const ext = extensionOf(filename);
  if (!EXT.has(ext)) throw new DocError(`Ez a fájltípus nem támogatott (${ext ? `.${ext}` : 'kiterjesztés nélkül'}). Támogatott: txt, md, csv, docx, szöveges PDF.`);
  if (!bytes.length) throw new DocError('A fájl üres.');
  if (bytes.length > DOC_LIMITS.fileBytes) throw new DocError(`A fájl túl nagy (legfeljebb ${DOC_LIMITS.fileBytes / 1024 / 1024} MB tölthető fel).`);
  let blocks;
  if (ext === 'docx') blocks = blocksFromDocx(bytes);
  else if (ext === 'pdf') blocks = await blocksFromPdf(bytes);
  else {
    if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46]) || startsWith(bytes, [0x50, 0x4b, 3, 4]) || startsWith(bytes, [0x4d, 0x5a])) throw new DocError('A fájl tartalma nem egyezik a kiterjesztésével.');
    const text = decodeText(bytes);
    blocks = ext === 'md' ? blocksFromMarkdown(text) : ext === 'csv' ? blocksFromCsv(text) : blocksFromPlain(text);
  }
  const chars = blocks.reduce((s, b) => s + b.cim.length + b.bekezdesek.join('').length, 0);
  if (!chars) throw new DocError('A fájlban nem találtam szöveget.');
  if (chars > DOC_LIMITS.textChars) throw new DocError('A dokumentum szövege túl hosszú a feldolgozáshoz.');
  const szakaszok = chunkBlocks(blocks);
  return { tipus: ext, karakterek: chars, szakaszok };
}
