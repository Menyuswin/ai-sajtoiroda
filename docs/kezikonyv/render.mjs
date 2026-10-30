import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
import { pathToFileURL } from 'node:url';
const [, , src, out, title] = process.argv;
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(pathToFileURL(src).href);
await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-size:8px;color:#5d7167;padding:0 18mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  margin: { top: '22mm', bottom: '22mm', left: '18mm', right: '18mm' } });
await b.close();
