// Visual QA harness. Needs the dev server (`npm run dev -- --port 5199`) and
// a local Chrome; set CHROME to its binary if it isn't the macOS default.
// Screenshots land in qa-shots/ (gitignored).
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.QA_BASE || 'http://localhost:5199';
mkdirSync('qa-shots', { recursive: true });
import puppeteer from 'puppeteer-core';
const routes = ['/', '/login', '/apply', '/network', '/search', '/projects', '/vault', '/people', '/messages', '/analytics', '/profile/jessica-belkin', '/tvshow/EMdDAmAjbRJg', '/movie/nope-404', '/profile/nobody-here'];
const widths = [[1440, 900], [1000, 800], [390, 844]];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
const issues = [];
let cur = '';
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') issues.push([cur, 'console.' + m.type(), m.text().slice(0, 160)]); });
page.on('pageerror', e => issues.push([cur, 'pageerror', String(e).slice(0, 160)]));
page.on('requestfailed', r => issues.push([cur, 'requestfailed', r.url().slice(0, 120) + ' ' + (r.failure()?.errorText || '')]));
page.on('response', r => { const u = r.url(); if (u.includes('localhost:5199') && r.status() >= 400 && !u.includes('/api/')) issues.push([cur, 'http' + r.status(), u.slice(0, 120)]); });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.setItem('hsi-persona-selected', 'creators'));
for (const [w, h] of widths) {
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  for (const r of routes) {
    cur = `${w} ${r}`;
    await page.goto(BASE + r, { waitUntil: 'networkidle0', timeout: 30000 }).catch(e => issues.push([cur, 'nav', e.message]));
    await new Promise(res => setTimeout(res, 700));
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 && r.width > 20 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 3).map(el => el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.'));
      return { scrollW: de.scrollWidth, innerW: window.innerWidth, wide, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i) };
    });
    if (m.scrollW > m.innerW + 1) issues.push([cur, 'h-overflow', `${m.scrollW}>${m.innerW} ${m.wide.join(', ')}`]);
    if (r === '/' && w === 1440) console.log('fonts loaded:', m.fonts.join(', '));
  }
}
await browser.close();
const seen = new Set();
for (const [where, kind, what] of issues) { const k = kind + what; if (seen.has(k)) continue; seen.add(k); console.log(`${where.padEnd(34)} ${kind.padEnd(14)} ${what}`); }
console.log('total issues', issues.length, 'unique', seen.size);
