// Visual QA harness. Needs the dev server (`npm run dev -- --port 5199`) and
// a local Chrome; set CHROME to its binary if it isn't the macOS default.
// Screenshots land in qa-shots/ (gitignored).
import { mkdirSync } from 'node:fs';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.QA_BASE || 'http://localhost:5199';
mkdirSync('qa-shots', { recursive: true });
import puppeteer from 'puppeteer-core';
import { fixtures, SESSION } from './fixtures.mjs';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
const issues = []; let cur = '';
page.on('pageerror', e => issues.push([cur, 'pageerror', String(e).slice(0, 200)]));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('status of 4')) issues.push([cur, 'console', m.text().slice(0, 160)]); });
await page.setRequestInterception(true);
page.on('request', req => { const u = new URL(req.url()); if (!u.pathname.startsWith('/api/')) return req.continue(); const key = `${req.method()} ${u.pathname}`; let fx = fixtures[key]; if (typeof fx === 'function') { let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch {} fx = fx(b); } if (fx !== undefined) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fx) }); if (['/api/people/featured', '/api/profile/get', '/api/entity/', '/api/network/posts/list', '/api/search'].some(p => u.pathname.startsWith(p))) return req.continue(); req.respond({ status: 200, contentType: 'application/json', body: '{}' }); });
const shot = async (name) => page.screenshot({ path: `qa-shots/i_${name}.png` });
const clickText = async (sel, text) => { const ok = await page.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find(e => e.textContent.trim().includes(text)); if (!el) return false; el.click(); return true; }, sel, text); if (!ok) issues.push([cur, 'noclick', `${sel} "${text}"`]); await new Promise(r => setTimeout(r, 700)); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const overflow = async () => { const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth })); if (m.s > m.w + 1) issues.push([cur, 'h-overflow', `${m.s}>${m.w}`]); };

await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
// landing persona popup, fresh visitor
cur = 'landing persona popup'; await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' }); await wait(600); await shot('persona_popup');
await clickText('button, div', 'Producers'); await shot('persona_after');
await page.evaluate((s) => { localStorage.setItem('hsi-user-email', s.email); localStorage.setItem('hsi-session-token', s.token); }, SESSION);

for (const [w, h] of [[1440, 900], [390, 844]]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  // search
  cur = `${w} search`; await page.goto(`${BASE}/search`, { waitUntil: 'networkidle0' });
  await page.type('.search-bar-input', 'jessica'); await wait(1500); await overflow(); await shot(`${w}_search_results`);
  // people with states
  cur = `${w} people`; await page.goto(`${BASE}/people`, { waitUntil: 'networkidle0' }); await wait(800); await overflow(); await shot(`${w}_people_states`);
  await page.type('.ppl-search', 'jess'); await wait(500); await shot(`${w}_people_filtered`);
  // home composer
  cur = `${w} composer`; await page.goto(`${BASE}/network`, { waitUntil: 'networkidle0' }); await wait(600);
  await page.type('.net-composer-input', 'Testing the composer on the refreshed Home.'); await wait(300); await shot(`${w}_composer_typed`);
  await clickText('button', 'Messages'); await shot(`${w}_home_messages_tab`);
  // vault modals and menus
  cur = `${w} vault`; await page.goto(`${BASE}/vault`, { waitUntil: 'networkidle0' }); await wait(800);
  await clickText('button', 'New Folder'); await shot(`${w}_vault_folder_modal`); await page.keyboard.press('Escape'); await clickText('button', 'Cancel');
  await clickText('button', 'New'); await clickText('button, div', 'Upload Project'); await shot(`${w}_vault_upload_step`); await clickText('button', 'Cancel'); await clickText('button', 'Back'); await clickText('button', 'Cancel');
  await page.goto(`${BASE}/vault`, { waitUntil: 'networkidle0' }); await wait(600);
  await page.evaluate(() => document.querySelector('.vault-card:not(.vault-folder-card) .vault-card-dots')?.click()); await wait(400); await shot(`${w}_vault_card_menu`);
  await clickText('.vault-dropdown-item', 'Share'); await shot(`${w}_vault_share_modal`);
  await page.goto(`${BASE}/vault`, { waitUntil: 'networkidle0' }); await wait(600);
  await clickText('button', 'Board'); await shot(`${w}_vault_board`);
  await clickText('.vault-card', 'Pilots 2026'); await wait(500); await shot(`${w}_vault_folder_open`);
  // script page: share modal, tracking tab, mobile
  cur = `${w} script`; await page.goto(`${BASE}/vault/script/qa-script-1`, { waitUntil: 'networkidle0' }); await wait(900); await overflow();
  await clickText('button', 'Share'); await shot(`${w}_script_share`); await page.keyboard.press('Escape');
  // settings tabs
  cur = `${w} settings`; await page.goto(`${BASE}/vault`, { waitUntil: 'networkidle0' }); await wait(500);
  await clickText('button', w < 600 ? 'You' : 'Settings');
  for (const tab of ['Your Pages', 'Access Codes', 'Connections', 'Network', 'Create Page', 'Upgrade Account']) { cur = `${w} settings ${tab}`; await clickText('.set-sidebar-item, button', tab); await overflow(); await shot(`${w}_settings_${tab.replace(/\W+/g, '_')}`); }
  // messages: new chat modal
  cur = `${w} messages new`; await page.goto(`${BASE}/messages`, { waitUntil: 'networkidle0' }); await wait(600);
  await clickText('button', w < 600 ? '' : ''); // noop
  await page.evaluate(() => document.querySelector('.dm-new-btn')?.click()); await wait(600); await shot(`${w}_messages_new_chat`);
}
await browser.close();
const seen = new Set();
for (const [where, kind, what] of issues) { const k = where + kind + what; if (seen.has(k)) continue; seen.add(k); console.log(`${where.padEnd(36)} ${kind.padEnd(11)} ${what}`); }
console.log('issues', seen.size);
