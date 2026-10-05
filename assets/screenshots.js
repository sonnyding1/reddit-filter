// Renders store screenshots (1280x800) into assets/screenshots/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = name => path.join(here, 'screenshots', name);
const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: true });
const id = await browser.installExtension(path.join(here, '../src'));
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto('file://' + path.join(here, 'explainer.html'));
await page.screenshot({ path: out('1-explainer.png') });

await page.goto(`chrome-extension://${id}/options.html`);
await page.evaluate(() => chrome.storage.sync.set({
  keywords: ['spoiler', 'election', '/\\bgpt-?\\d/'], users: ['spam_account'], subreddits: ['somesub'], domains: ['example.com'],
}));
await page.reload();
await page.addStyleTag({ content: 'main { max-width: 1180px; display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; align-items: start; padding-top: 24px } header, footer, main > section:first-of-type { grid-column: 1 / -1 } section { margin-bottom: 12px } textarea { min-height: 72px }' });
await page.screenshot({ path: out('2-settings.png') });
await browser.close();
