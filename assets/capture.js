// Captures store screenshots (1280x800) and a demo video from live Reddit.
// Usernames, avatars and ad content are blurred. Output: assets/screenshots/, assets/video/.
// Run: node assets/capture.js   (needs network; video needs ffmpeg)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, 'screenshots');
const RAW = path.join(here, '.raw');
const VIDEO = path.join(here, 'video');
for (const d of [SHOTS, RAW, VIDEO]) fs.mkdirSync(d, { recursive: true });

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FEED = 'https://www.reddit.com/r/AskReddit/new/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Anonymise people and advertisers; hide Reddit's sign-up panel and header clutter.
const PRIVACY_CSS = `
  a[href*="/user/"], faceplate-hovercard, [slot="authorName"], shreddit-comment [slot="commentMeta"] a,
  shreddit-post img, shreddit-comment img, shreddit-post [slot="post-media-container"]
  { filter: blur(5px) !important; }
  shreddit-ad-post > * { filter: blur(16px) !important; }
  shreddit-ad-post { position: relative !important; display: block; outline: 3px solid #ff4500 !important; outline-offset: -3px; border-radius: 12px; }
  shreddit-ad-post::after { content: "Ad disguised as a post"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: #ff4500; color: #fff; font: 700 18px system-ui, sans-serif; padding: 8px 16px; border-radius: 999px; }
  shreddit-comment[data-rf-hidden] > details > summary { outline: 3px solid #2f4f5a; outline-offset: 4px; border-radius: 8px; position: relative; }
  shreddit-comment[data-rf-hidden] > details > summary::after { content: "Hidden user: collapsed"; position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: #2f4f5a; color: #fff; font: 700 14px system-ui, sans-serif; padding: 4px 12px; border-radius: 999px; }
  /* Keep the sticky search bar out of crops. */
  reddit-header-large, header { position: static !important; }
`;

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: true, args: ['--hide-scrollbars'] });
const extId = await browser.installExtension(path.join(here, '../src'));
const sw = await (await browser.waitForTarget(t => t.type() === 'service_worker')).worker();
const setSettings = s => sw.evaluate(s => chrome.storage.sync.set(s), s);
const RESET = { enabled: true, keywords: [], users: [], subreddits: [], domains: [], hideDefaultNames: false, hidePromoted: true, showPlaceholder: true };

async function redditPage() {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 800 });
  return page;
}

// Live titles are unpredictable (and sometimes upsetting), so feed shots use
// neutral sample titles on Reddit's real interface.
const SAMPLE_TITLES = [
  "What's a small habit that genuinely improved your life?",
  'Spoiler: what did you think of last night\'s season finale?',
  'What book do you end up recommending to everyone?',
  "What's the best advice you got from a total stranger?",
  'Is crypto still worth getting into in 2026?',
  "What's a hobby that's cheaper than people think?",
  'What did you learn the hard way at your first job?',
  "What's your favourite way to spend a rainy Sunday?",
  'Which city surprised you the most when you visited?',
  "What's a kitchen tool you can't live without?",
  'Is the new season worth watching? No spoilers please',
  "What's something everyone should know how to cook?",
];
const DEMO_KEYWORDS = ['spoiler', 'crypto'];

async function prep(page, { titles = false } = {}) {
  await page.addStyleTag({ content: PRIVACY_CSS });
  if (titles) {
    await page.evaluate(list => {
      [...document.querySelectorAll('shreddit-post')].forEach((p, i) => {
        const t = list[i % list.length];
        const link = p.querySelector('[slot="title"]');
        if (link) link.textContent = t;
        p.setAttribute('post-title', t);
      });
    }, SAMPLE_TITLES);
  }
  await sleep(400);
}

// Feed column crop around an element.
async function feedClip(page, selector, { height = 640 } = {}) {
  const box = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    el.scrollIntoView({ block: 'center' });
    const feed = el.closest('main') ?? document.querySelector('main');
    const f = feed.getBoundingClientRect();
    return { x: f.left, width: f.width };
  }, selector);
  await sleep(600);
  const top = Math.max(60, (800 - height) / 2);
  const scrollY = await page.evaluate(() => window.scrollY);
  return { x: box.x, y: scrollY + top, width: box.width, height: Math.min(height, 800 - top) };
}

// ---- 1. ads: before / after ---------------------------------------------------

await setSettings({ ...RESET, enabled: false });
const feed = await redditPage();
await feed.goto(FEED, { waitUntil: 'networkidle2' });
for (let i = 0; i < 4 && !(await feed.$('shreddit-ad-post')); i++) {
  await feed.evaluate(() => window.scrollBy(0, 1500));
  await sleep(900);
}
await prep(feed, { titles: true });
const adId = await feed.evaluate(() => {
  const ad = document.querySelector('shreddit-ad-post');
  ad.id ||= 'rf-demo-ad';
  return ad.id;
});
const clip = await feedClip(feed, `#${adId}`, { height: 600 });
await feed.screenshot({ path: path.join(RAW, 'ads-before.png'), clip, captureBeyondViewport: false });
// Mark the post below the ad so the "after" crop lines up on the same content.
await feed.evaluate(id => {
  const ad = document.getElementById(id);
  const next = [...document.querySelectorAll('shreddit-post')]
    .find(p => ad.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
  next?.setAttribute('data-rf-anchor', '');
}, adId);
await setSettings({ ...RESET });
await sleep(800);
const clipAfter = await feedClip(feed, '[data-rf-anchor]', { height: 600 });
await feed.screenshot({ path: path.join(RAW, 'ads-after.png'), clip: clipAfter, captureBeyondViewport: false });

// ---- 2. keyword and subreddit filters with placeholders ---------------------------

const picks = DEMO_KEYWORDS;
await setSettings({ ...RESET, keywords: picks });
await feed.evaluate(() => window.scrollTo(0, 0));
await sleep(900);
const firstHidden = await feed.evaluate(() => {
  const ph = document.querySelector('.rf-placeholder');
  ph?.setAttribute('data-rf-anchor2', '');
  return !!ph;
});
const clip2 = await feedClip(feed, firstHidden ? '[data-rf-anchor2]' : 'shreddit-post', { height: 640 });
await feed.screenshot({ path: path.join(RAW, 'keywords.png'), clip: clip2, captureBeyondViewport: false });

// ---- 3. comments from a hidden user collapse ------------------------------------------

await setSettings({ ...RESET });
const thread = await redditPage();
await thread.goto(process.env.THREAD_SUB || 'https://www.reddit.com/r/books/top/?t=day', { waitUntil: 'networkidle2' });
const permalink = await thread.evaluate(() => [...document.querySelectorAll('shreddit-post')]
  .filter(p => p.getAttribute('post-type') === 'text' || Number(p.getAttribute('comment-count')) > 50)
  .sort((a, b) => Number(b.getAttribute('comment-count')) - Number(a.getAttribute('comment-count')))[0].getAttribute('permalink'));
console.log('comment thread:', permalink);
await thread.goto('https://www.reddit.com' + permalink, { waitUntil: 'networkidle2' });
await prep(thread);
const target = await thread.evaluate(() => {
  const c = [...document.querySelectorAll('shreddit-comment[depth="0"]')][1];
  c.setAttribute('data-rf-anchor3', '');
  return c.getAttribute('author');
});
await setSettings({ ...RESET, users: [target] });
await sleep(900);
const clip3 = await feedClip(thread, '[data-rf-anchor3]', { height: 640 });
await thread.screenshot({ path: path.join(RAW, 'comments.png'), clip: clip3, captureBeyondViewport: false });

// ---- 4. settings page --------------------------------------------------------------------

const opts = await browser.newPage();
await opts.setViewport({ width: 1280, height: 800 });
await setSettings({ ...RESET, keywords: ['spoiler', 'election', '/\\bgpt-?\\d/'], users: ['example_user'], subreddits: ['somesub'], domains: ['example.com'] });
await opts.goto(`chrome-extension://${extId}/options.html`);
await opts.addStyleTag({ content: 'main { max-width: 1180px; display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; align-items: start; padding-top: 24px } header, footer, main > section:first-of-type { grid-column: 1 / -1 } section { margin-bottom: 12px } textarea { min-height: 72px }' });
await opts.screenshot({ path: path.join(SHOTS, '5-settings.png') });

// ---- compose framed screenshots -------------------------------------------------------------

const img = f => 'data:image/png;base64,' + fs.readFileSync(path.join(RAW, f)).toString('base64');
const frame = (title, sub, body) => `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; width:1280px; height:800px; background:#eef1f2; font-family:system-ui,sans-serif; color:#1a1a1b; box-sizing:border-box; padding:44px 56px; display:flex; flex-direction:column; }
  h1 { font-size:38px; margin:0 0 6px; } p.sub { font-size:20px; color:#576f76; margin:0 0 26px; }
  .row { display:flex; gap:28px; justify-content:center; align-items:flex-start; flex:1; min-height:0; }
  figure { margin:0; display:flex; flex-direction:column; align-items:center; gap:10px; min-height:0; }
  figcaption { font-size:18px; font-weight:700; color:#576f76; }
  figure img { max-height:560px; max-width:560px; border-radius:14px; box-shadow:0 4px 18px rgba(0,0,0,.12); background:#fff; }
  .single img { max-height:600px; max-width:1100px; }
  .good { color:#1a7f37; } .bad { color:#cf222e; }
</style><h1>${title}</h1><p class="sub">${sub}</p><div class="row">${body}</div>`;

const composer = await browser.newPage();
await composer.setViewport({ width: 1280, height: 800 });
async function compose(file, html) {
  await composer.setContent(html, { waitUntil: 'load' });
  await composer.screenshot({ path: path.join(SHOTS, file) });
}
await compose('1-ads.png', frame('Ads disguised as posts, gone',
  'Promoted posts, ads in comment threads and sidebar ads are removed. Logged in or out.',
  `<figure><figcaption class="bad">Without</figcaption><img src="${img('ads-before.png')}"></figure>
   <figure><figcaption class="good">With Filter for Reddit</figcaption><img src="${img('ads-after.png')}"></figure>`));
await compose('2-keywords.png', frame('Hide posts by keyword, user, subreddit or website',
  'Works without a Reddit account. Each hidden post leaves a small line you can click to show it.',
  `<figure class="single"><img src="${img('keywords.png')}"></figure>`));
await compose('3-comments.png', frame("Hidden users' comments collapse",
  'Private and one-way: unlike Reddit’s block, the other person isn’t affected. Replies stay one click away.',
  `<figure class="single"><img src="${img('comments.png')}"></figure>`));
await compose('4-right-click.png', frame('Right-click to hide a user, subreddit or website',
  'Or edit your lists in the settings page. Everything syncs through your Chrome profile.',
  `<div style="position:relative;width:560px;height:600px;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.12)">
     <img src="${img('ads-after.png')}" style="width:100%;height:100%;object-fit:cover;object-position:top;filter:blur(6px) brightness(.97)">
     <div style="position:absolute;left:16px;top:190px;display:flex;align-items:flex-start;gap:6px">
   <figure class="single" style="align-self:center"><div style="font:18px system-ui;background:#fff;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:8px 0;width:250px">
     ${['Open link in new tab', 'Copy link address', '—', 'Filter for Reddit ▸'].map(t => t === '—' ? '<div style="border-top:1px solid #ddd;margin:6px 0"></div>' : `<div style="padding:8px 18px;${t.startsWith('Filter') ? 'background:#e8f0fe;font-weight:600' : ''}">${t}</div>`).join('')}
   </div></figure>
   <figure class="single" style="margin-top:96px"><div style="font:18px system-ui;background:#fff;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:8px 0;width:250px">
     ${['Hide this user', 'Hide this subreddit', "Hide this post's website"].map((t, i) => `<div style="padding:8px 18px;${i === 0 ? 'background:#e8f0fe' : ''}">${t}</div>`).join('')}
   </div></figure></div></div>`));

// ---- promo tile (440x280) -----------------------------------------------------------------

await composer.setViewport({ width: 440, height: 280 });
await composer.setContent(`<!doctype html><meta charset="utf-8"><style>
  body { margin:0; width:440px; height:280px; background:#2f4f5a; color:#fff; font-family:system-ui,sans-serif; display:flex; align-items:center; gap:22px; padding:0 30px; box-sizing:border-box; }
  img { width:96px; height:96px; } h1 { font-size:30px; margin:0 0 8px; line-height:1.1; } p { margin:0; font-size:16px; opacity:.85; line-height:1.35; }
</style><img src="data:image/png;base64,${fs.readFileSync(path.join(here, '../src/icons/128.png')).toString('base64')}">
<div><h1>Filter for Reddit</h1><p>No ads. Hide users, subreddits and keywords, even logged out.</p></div>`);
await composer.screenshot({ path: path.join(SHOTS, 'promo-440x280.png') });

// ---- demo video -----------------------------------------------------------------------------

if (!process.env.NO_VIDEO) {
  await setSettings({ ...RESET, enabled: false });
  const v = await redditPage();
  await v.goto(FEED, { waitUntil: 'networkidle2' });
  await prep(v, { titles: true });
  const caption = text => v.evaluate(t => {
    let el = document.getElementById('rf-demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rf-demo-caption';
      el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;background:rgba(20,30,35,.92);color:#fff;font:600 22px system-ui;padding:12px 22px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:80%;text-align:center';
      document.body.append(el);
    }
    el.textContent = t;
  }, text);
  const smoothScroll = (dy, ms) => v.evaluate((dy, ms) => new Promise(r => {
    const start = scrollY, t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms); scrollTo(0, start + dy * k); k < 1 ? requestAnimationFrame(step) : r(); };
    requestAnimationFrame(step);
  }), dy, ms);

  const recorder = await v.screencast({ path: path.join(VIDEO, 'demo.webm') });
  await caption('Reddit, logged out, without the extension');
  await sleep(1500);
  await v.evaluate(() => document.querySelector('shreddit-ad-post')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(1800);
  await caption('This post is an ad');
  await sleep(2200);
  await caption('Filter for Reddit on: ads are gone');
  await setSettings({ ...RESET });
  await sleep(2500);
  await v.evaluate(() => scrollTo(0, 0));
  await caption(`Hide posts by keyword: "${picks[0]}"`);
  await sleep(1200);
  await setSettings({ ...RESET, keywords: [picks[0]] });
  await sleep(1500);
  await smoothScroll(900, 2500);
  await sleep(800);
  await caption('Click Show to see any hidden post');
  await v.evaluate(() => document.querySelector('.rf-placeholder')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await sleep(1500);
  await v.evaluate(() => document.querySelector('.rf-placeholder button')?.click());
  await sleep(2200);
  await caption('Also: users, subreddits, websites. Free and open source.');
  await sleep(2500);
  await recorder.stop();
  console.log('video recorded');
}

await browser.close();
console.log('done');
