// End-to-end checks in Chrome for Testing with the extension loaded.
// Fixture mode (default) serves a fake page at https://www.reddit.com/ built
// from the same elements real Reddit uses. LIVE=1 also checks real Reddit.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const post = (id, { title, author = 'someone', sub = 'r/pics', domain = 'self.pics', flair = '' }) => `
  <article><shreddit-post id="${id}" post-title="${title}" author="${author}" subreddit-prefixed-name="${sub}" domain="${domain}">
    ${flair ? `<shreddit-post-flair>${flair}</shreddit-post-flair>` : ''}<a href="/${id}">${title}</a>
  </shreddit-post></article><hr>`;

const FIXTURE = `<!doctype html><html><head><title>fixture</title></head><body>
  <main id="feed">
    ${post('p1', { title: 'My cat did a thing' })}
    ${post('p2', { title: 'Education reform news' })}
    ${post('p3', { title: 'Hello', author: 'SpamBot' })}
    ${post('p4', { title: 'News item', sub: 'r/politics' })}
    ${post('p5', { title: 'Link', domain: 'news.example.com' })}
    ${post('p6', { title: 'Episode 5 thoughts', flair: 'Spoiler' })}
    ${post('p7', { title: 'Plain post', author: 'Original-Ad6801' })}
    <article><shreddit-ad-post id="ad1">Buy stuff</shreddit-ad-post></article>
  </main>
  <shreddit-comment id="c1" author="SpamBot" depth="0"><details open><summary>SpamBot</summary><div><p id="c1-body">spam</p>
    <shreddit-comment id="c2" author="nice_person" depth="1"><details open><summary>nice_person</summary><div><p id="c2-body">reply</p></div></details></shreddit-comment>
  </div></details></shreddit-comment>
  <shreddit-comment id="c3" author="nice_person" depth="0"><details open><summary>nice_person</summary><div><p id="c3-body">good comment</p></div></details></shreddit-comment>
</body></html>`;

const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: true });
await browser.installExtension(EXT);

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n     got      ${JSON.stringify(actual)}\n     expected ${JSON.stringify(expected)}`}`);
}

try {
  const sw = await (await browser.waitForTarget(t => t.type() === 'service_worker')).worker();
  const setSettings = s => sw.evaluate(s => chrome.storage.sync.set(s), s);
  await setSettings({
    keywords: ['cat', 'spoiler'], users: ['u/SpamBot'], subreddits: ['politics'], domains: ['example.com'],
    hideDefaultNames: true, hidePromoted: true, showPlaceholder: true, enabled: true,
  });

  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().startsWith('https://www.reddit.com/r/fixture')) {
      req.respond({ status: 200, contentType: 'text/html', body: FIXTURE });
    } else if (req.url().startsWith('https://www.reddit.com/')) {
      req.continue();
    } else {
      req.continue();
    }
  });

  await page.goto('https://www.reddit.com/r/fixture/');
  await page.waitForSelector('html[data-rf-loaded]');
  await sleep(300);
  const visible = () => page.evaluate(() =>
    [...document.querySelectorAll('shreddit-post, shreddit-ad-post')]
      .filter(el => el.getClientRects().length > 0).map(el => el.id));
  // A comment counts as collapsed when its body text is not on screen.
  const collapsed = () => page.evaluate(() =>
    [...document.querySelectorAll('shreddit-comment')].filter(el => !document.getElementById(el.id + '-body').checkVisibility() && !el.parentElement.closest('details:not([open])')).map(el => el.id));

  check('only unmatched posts stay visible', await visible(), ['p2']);
  check('placeholders explain why', await page.evaluate(() =>
    [...document.querySelectorAll('.rf-placeholder')].map(b => b.firstChild.textContent.trim())), [
    'Hidden post ("cat")', 'Hidden post (user u/SpamBot)', 'Hidden post (r/politics)',
    'Hidden post (example.com)', 'Hidden post ("spoiler")', 'Hidden post (auto-generated username)',
  ]);
  check("blocked user's comment collapsed, replies untouched", await collapsed(), ['c1']);

  // "Show" reveals one post
  await page.click('.rf-placeholder button');
  check('Show reveals the post', (await visible()).includes('p1'), true);

  // Posts added later (infinite scroll, client navigation)
  await page.evaluate(html => document.getElementById('feed').insertAdjacentHTML('beforeend', html),
    post('p8', { title: 'Another cat picture' }) + post('p9', { title: 'Dogs are fine' }));
  await sleep(200);
  check('posts loaded later are filtered', (await visible()).filter(id => ['p8', 'p9'].includes(id)), ['p9']);

  // Attributes filled in after insertion
  await page.evaluate(() => {
    const el = document.createElement('shreddit-post');
    el.id = 'p10';
    el.textContent = 'late';
    const art = document.createElement('article');
    art.append(el);
    document.getElementById('feed').append(art);
    setTimeout(() => el.setAttribute('post-title', 'late cat news'), 50);
  });
  await sleep(300);
  check('post whose title arrives late is filtered', (await visible()).includes('p10'), false);

  // Live settings change
  await setSettings({ keywords: [] });
  await sleep(400);
  check('removing a keyword brings posts back', (await visible()).includes('p8'), true);
  await setSettings({ enabled: false });
  await sleep(400);
  check('switching off shows everything', (await visible()).length, 11);
  check('switching off expands comments', await collapsed(), []);
  await setSettings({ enabled: true });
  await sleep(400);

  // Right-click menu path: contextmenu on a post, then the menu message
  await page.evaluate(() => document.querySelector('#p9 a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
  const pageTab = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  const res = await sw.evaluate(id => chrome.tabs.sendMessage(id, { type: 'menu', menu: 'hide-subreddit' }), pageTab);
  check('right-click adds the subreddit', res, { ok: true, list: 'subreddits', value: 'pics' });
  await sleep(400);
  check('...and hides its posts', (await visible()).includes('p9'), false);

  check('badge shows hidden count', Number(await sw.evaluate(id => chrome.action.getBadgeText({ tabId: id }), pageTab)) > 0, true);

  if (process.env.LIVE) {
    await setSettings({ keywords: [], users: [], subreddits: [], domains: [], hideDefaultNames: false });
    const live = await browser.newPage();
    await live.setUserAgent(UA);
    await live.goto('https://www.reddit.com/r/AskReddit/top/?t=day', { waitUntil: 'networkidle2' });
    const first = await live.evaluate(() => {
      const el = document.querySelector('shreddit-post');
      return el && { id: el.id, author: el.getAttribute('author') };
    });
    check('live: Reddit still renders shreddit-post', !!first, true);
    check('live: promoted posts hidden', await live.evaluate(() =>
      [...document.querySelectorAll('shreddit-ad-post')].every(a => a.getClientRects().length === 0)), true);
    if (first) {
      await setSettings({ users: [first.author] });
      await sleep(600);
      check('live: post by blocked user hidden', await live.evaluate(id => document.getElementById(id).getClientRects().length === 0, first.id), true);
      const link = await live.evaluate(id => document.getElementById(id).getAttribute('permalink'), first.id);
      await live.goto('https://www.reddit.com' + link, { waitUntil: 'networkidle2' });
      const commenter = await live.evaluate(() => document.querySelector('shreddit-comment')?.getAttribute('author'));
      check('live: comments render as shreddit-comment', !!commenter, true);
      if (commenter) {
        await setSettings({ users: [commenter] });
        await sleep(600);
        check('live: blocked commenter collapsed on screen', await live.evaluate(a =>
          [...document.querySelectorAll(`shreddit-comment[author="${a}"]`)].every(c => {
            const body = c.querySelector(':scope > details > div p, :scope > details > div [slot="comment"]');
            return !body || !body.checkVisibility();
          }), commenter), true);
        for (let i = 0; i < 4; i++) { await live.evaluate(() => window.scrollBy(0, 1500)); await sleep(600); }
        check('live: comment-page ads hidden', await live.evaluate(() =>
          [...document.querySelectorAll('shreddit-comments-page-ad, shreddit-comment-tree-ad, reddit-pdp-right-rail-post:has(ad-event-tracker)')]
            .every(a => a.getClientRects().length === 0)), true);
        await live.screenshot({ path: process.env.LIVE_SHOT || '/dev/null' }).catch(() => {});
      }
    }
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
