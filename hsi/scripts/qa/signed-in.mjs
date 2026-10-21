// Visual QA harness. Needs the dev server (`npm run dev -- --port 5199`) and
// a local Chrome; set CHROME to its binary if it isn't the macOS default.
// Screenshots land in qa-shots/ (gitignored).
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.QA_BASE || 'http://localhost:5199';
mkdirSync('qa-shots', { recursive: true });
import puppeteer from 'puppeteer-core';
import { fixtures, SESSION } from './fixtures.mjs';
const routes = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
const issues = [];
let cur = '';
page.on('pageerror', e => issues.push([cur, 'pageerror', String(e).slice(0, 200)]));
page.on('console', m => { if (m.type() === 'error') issues.push([cur, 'console', m.text().slice(0, 160)]); });
await page.setRequestInterception(true);
page.on('request', req => {
  const u = new URL(req.url());
  if (!u.pathname.startsWith('/api/')) return req.continue();
  const key = `${req.method()} ${u.pathname}`;
  let fx = fixtures[key];
  if (typeof fx === 'function') { let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {} fx = fx(body); }
  if (fx !== undefined) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fx) });
  if (['/api/people/featured', '/api/profile/get', '/api/entity/get', '/api/entity/projects', '/api/network/posts/list', '/api/search/trending', '/api/search', '/api/entity/view'].some(p => u.pathname.startsWith(p))) return req.continue();
  issues.push([cur, 'unmocked', key]);
  req.respond({ status: 200, contentType: 'application/json', body: '{}' });
});
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.evaluate((s) => { localStorage.setItem('hsi-persona-selected', 'creators'); localStorage.setItem('hsi-user-email', s.email); localStorage.setItem('hsi-session-token', s.token); }, SESSION);
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  for (const r of routes) {
    const [path0, click] = r.split('@'); const bottom = path0.endsWith('#bottom'); const path = path0.replace('#bottom','');
    cur = `${w} ${r}`;
    await page.goto(BASE + path, { waitUntil: 'networkidle0', timeout: 30000 }).catch(e => issues.push([cur, 'nav', e.message]));
    await new Promise(res => setTimeout(res, 900));
    if (click) {
      const el = await page.evaluateHandle((sel) => [...document.querySelectorAll('button, a, [role=tab], .dm-conv-item, .net-side-row, .vault-card, .vault-analysis-card-header')].find(b => b.textContent.trim().includes(sel)), click);
      if (el.asElement()) { await el.asElement().evaluate(e => e.click()).catch(e => issues.push([cur, 'clickerr', String(e).slice(0,100)])); await new Promise(res => setTimeout(res, 900)); } else issues.push([cur, 'noclick', click]);
    }
    const m = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, path: location.pathname }));
    if (m.scrollW > m.innerW + 1) issues.push([cur, 'h-overflow', `${m.scrollW}>${m.innerW}`]);
    if (m.path !== path) issues.push([cur, 'redirected', m.path]);
    if (bottom) { await page.evaluate(() => { const sc = document.querySelector('.vault-work-container, .net-content, .prof-layout, .ppl-page'); if (sc) sc.scrollTop = sc.scrollHeight; }); await new Promise(res => setTimeout(res, 500)); }
    await page.screenshot({ path: `qa-shots/${w}_${r.replace(/[^a-z0-9]+/gi, '_')}.png` });
  }
}
await browser.close();
const seen = new Set();
for (const [where, kind, what] of issues) { const k = where + kind + what; if (seen.has(k)) continue; seen.add(k); console.log(`${where.padEnd(44)} ${kind.padEnd(11)} ${what}`); }
console.log('issues', seen.size);
