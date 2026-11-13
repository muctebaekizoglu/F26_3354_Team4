// End-to-end scenario driven through the real UI with Playwright, plus screenshots.
// Needs the app running (npm run dev) and a Chromium-based browser installed.
//   BASE_URL (default http://localhost:5173), SHOT_DIR (default ../docs/screenshots)
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = process.env.SHOT_DIR || path.resolve(here, '../../docs/screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const PW = { worker: 'Worker#2026', supervisor: 'Supervisor#2026', admin: 'Admin#2026' };
const consoleProblems = [];

async function launch() {
  for (const channel of [undefined, 'msedge', 'chrome']) {
    try { return await chromium.launch(channel ? { channel } : {}); } catch { /* try next */ }
  }
  throw new Error('No Chromium-based browser found (install Chrome/Edge or run: npx playwright install chromium)');
}

async function newPage(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    // 4xx responses that the scenario provokes on purpose show up as "Failed to load resource".
    if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) consoleProblems.push(`[${label}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleProblems.push(`[${label}] ${e.message}`));
  return page;
}

async function login(page, username, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(SHOT_DIR, name), ...opts });

const browser = await launch();
try {
  // ---- 8 (first, for screenshot 01): wrong password shows the generic error ----
  const ana = await newPage(browser, 'ana');
  await login(ana, 'amorales', 'definitely-wrong');
  const err = ana.getByRole('alert');
  await err.waitFor();
  assert.equal((await err.innerText()).trim(), 'Invalid username or password');
  await shot(ana, '01-login.png');
  console.log('ok: generic login error');

  // ---- 1: a worker logs in ----
  await login(ana, 'amorales', PW.worker);
  await ana.getByRole('heading', { name: 'Equipment Status' }).waitFor();
  assert.ok(await ana.getByText('LOTO Manager').first().isVisible());

  // ---- 2: the worker locks Conveyor Belt A (dashboard -> equipment -> apply = 2 clicks) ----
  await ana.getByRole('link', { name: 'Conveyor Belt A' }).click();
  await ana.getByRole('button', { name: 'Apply My Lock' }).click();
  await ana.getByRole('button', { name: 'Release My Lock' }).waitFor();
  console.log('ok: Ana locked Conveyor Belt A');

  // ---- 3: second authorized worker also locks it (group lockout) ----
  const ben = await newPage(browser, 'ben');
  await login(ben, 'bchen', PW.worker);
  await ben.getByRole('link', { name: 'Conveyor Belt A' }).click();
  await ben.getByRole('button', { name: 'Apply My Lock' }).click();
  await ben.getByRole('button', { name: 'Release My Lock' }).waitFor();
  console.log('ok: Ben also locked it (group lockout)');

  // unauthorized apply (Ana is not authorized for Lathe 4) -> 403 + LOCK_DENIED audit entry
  const denied = await ana.evaluate(async () => {
    const eq = (await (await fetch('/api/equipment')).json()).equipment.find((e) => e.name === 'Lathe 4');
    return (await fetch(`/api/equipment/${eq.equipmentId}/locks`, { method: 'POST' })).status;
  });
  assert.equal(denied, 403);

  // ---- 4: first worker cannot release the second worker's lock ----
  await ana.reload();
  await ana.getByText('Ben Chen').first().waitFor();
  const refusal = ana.getByRole('button', { name: 'Only Ben Chen can release' });
  assert.ok(await refusal.isDisabled(), 'release of others\' locks must be disabled');
  const releaseStatus = await ana.evaluate(async () => {
    const eq = (await (await fetch('/api/equipment')).json()).equipment.find((e) => e.name === 'Conveyor Belt A');
    const theirs = eq.activeLocks.find((l) => l.workerName === 'Ben Chen');
    return (await fetch(`/api/locks/${theirs.lockId}/release`, { method: 'POST' })).status;
  });
  assert.equal(releaseStatus, 403, 'server must refuse a non-owner release');
  await ana.getByRole('heading', { name: 'Conveyor Belt A' }).waitFor();
  await shot(ana, '03-lock-release.png');
  console.log('ok: non-owner release refused (UI disabled + API 403)');

  // ---- dashboard with banner + chart showing both states ----
  await ana.getByRole('link', { name: '← Dashboard' }).click();
  await ana.getByText(/Conveyor Belt A was LOCKED by/).first().waitFor();
  await ana.getByText('UNLOCKED:').waitFor();
  await shot(ana, '02-dashboard.png');
  console.log('ok: dashboard banner and chart');

  // ---- 5: supervisor overrides the abandoned lock ----
  const sup = await newPage(browser, 'supervisor');
  await login(sup, 'esingh', PW.supervisor);
  await sup.getByRole('link', { name: 'Conveyor Belt A' }).click();
  await sup.getByText('Ben Chen').first().waitFor();
  await sup.getByRole('row', { name: /Ben Chen/ }).getByRole('button', { name: 'Override' }).click();
  const confirm = sup.getByRole('button', { name: 'Confirm override' });
  assert.ok(await confirm.isDisabled(), 'Confirm must be disabled while the reason is blank');
  await sup.getByLabel('Reason (required)').fill('   ');
  assert.ok(await confirm.isDisabled(), 'whitespace-only reason must not enable Confirm');
  await sup.getByLabel('Reason (required)').fill('Worker left site; area verified safe');
  assert.ok(await confirm.isEnabled());
  await shot(sup, '04-override.png');
  await confirm.click();
  await sup.getByText(/Override recorded/).waitFor();
  await sup.getByText('Only Ben Chen can release').waitFor({ state: 'detached' });
  console.log('ok: supervisor override');

  // ---- 6: supervisor opens the compliance report ----
  await sup.getByRole('link', { name: 'Compliance Report' }).click();
  await sup.getByText(/Hash chain verified/).waitFor();
  await sup.locator('td code', { hasText: 'LOCK_OVERRIDDEN' }).first().waitFor();
  await sup.locator('td code', { hasText: 'LOCK_DENIED' }).first().waitFor();
  const countText = await sup.getByTestId('result-count').innerText();
  const rows = await sup.locator('tbody tr').count();
  assert.equal(Number(countText.match(/\d+/)[0]), rows, 'result count must match the table rows');
  await shot(sup, '05-compliance-report.png', { fullPage: true });
  console.log(`ok: compliance report (${countText})`);

  // ---- 7: admin tries to retire the (still locked) Conveyor Belt A ----
  const admin = await newPage(browser, 'admin');
  await login(admin, 'admin', PW.admin);
  await admin.getByRole('link', { name: 'Admin' }).click();
  await admin.getByRole('tab', { name: 'Equipment' }).click();
  const row = admin.getByRole('row', { name: /Conveyor Belt A/ });
  await row.getByText('LOCKED', { exact: true }).waitFor();
  await row.getByRole('button', { name: 'Retire' }).click();
  await row.getByRole('button', { name: 'Confirm retire' }).click();
  const refused = admin.getByRole('alert').filter({ hasText: /active lock/ });
  await refused.waitFor();
  console.log(`ok: retire refused -> ${(await refused.innerText()).trim()}`);
  await shot(admin, '06-admin.png');

  // narrow-width smoke test (768px)
  await admin.setViewportSize({ width: 768, height: 900 });
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'no horizontal page scroll at 768px');
  console.log('ok: 768px layout has no horizontal page overflow');
} finally {
  await browser.close();
}

if (consoleProblems.length) {
  console.error('Console problems:\n' + consoleProblems.join('\n'));
  process.exit(1);
}
console.log('Scenario complete. Screenshots in', SHOT_DIR);
