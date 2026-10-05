// Hides Reddit posts and collapses comments that match the user's filters.
// New Reddit renders each post as <shreddit-post> with its data in plain
// attributes (post-title, author, subreddit-prefixed-name, domain), which is
// far steadier than its generated CSS classes, so everything keys off those.

(() => {
  const { DEFAULTS, compile, postReason, commentReason } = globalThis.RedditFilter;

  const POST = 'shreddit-post';
  const COMMENT = 'shreddit-comment';
  const AD = 'shreddit-ad-post, shreddit-comment-tree-ad, shreddit-comments-page-ad, shreddit-sidebar-ad, ' +
    'reddit-pdp-right-rail-post:has(ad-event-tracker)';

  let rules = compile(DEFAULTS);
  let ready = false;
  let lastRightClicked = null;

  // ---- reading posts and comments ------------------------------------------

  function readPost(el) {
    return {
      title: el.getAttribute('post-title') ?? '',
      author: el.getAttribute('author') ?? '',
      subreddit: el.getAttribute('subreddit-prefixed-name') ?? '',
      domain: el.getAttribute('domain') ?? '',
      flair: el.querySelector('shreddit-post-flair')?.textContent.trim() ?? '',
      promoted: el.hasAttribute('is-promoted') || el.matches('shreddit-ad-post'),
    };
  }

  // In feeds each post sits in its own <article>; hide that so no gap is left.
  const postBox = el => el.closest('article') ?? el;

  // ---- hiding ------------------------------------------------------------------

  function hidePost(el, reason) {
    const box = postBox(el);
    if (box.dataset.rfHidden === reason) return;
    unhidePost(el);
    box.dataset.rfHidden = reason;
    if (rules.showPlaceholder) {
      const bar = document.createElement('div');
      bar.className = 'rf-placeholder';
      bar.textContent = `Hidden post (${reason}) `;
      const show = document.createElement('button');
      show.type = 'button';
      show.textContent = 'Show';
      show.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        box.dataset.rfShown = '';
        bar.remove();
      });
      bar.append(show);
      box.before(bar);
    }
  }

  function unhidePost(el) {
    const box = postBox(el);
    if (!('rfHidden' in box.dataset)) return;
    delete box.dataset.rfHidden;
    delete box.dataset.rfShown;
    if (box.previousElementSibling?.classList.contains('rf-placeholder')) box.previousElementSibling.remove();
  }

  // Each comment's content sits in a <details>; closing it is exactly what
  // Reddit's own "−" button does, so its "+" still expands the thread.
  const commentDetails = el => el.querySelector(':scope > details');

  function collapseComment(el, reason) {
    const details = commentDetails(el);
    if (!details || el.dataset.rfHidden) return;
    el.dataset.rfHidden = reason;
    details.open = false;
  }

  function uncollapseComment(el) {
    if (!el.dataset.rfHidden) return;
    delete el.dataset.rfHidden;
    const details = commentDetails(el);
    if (details) details.open = true;
  }

  function applyPost(el) {
    const reason = postReason(rules, readPost(el));
    if (reason) hidePost(el, reason);
    else unhidePost(el);
  }

  function applyComment(el) {
    const reason = commentReason(rules, { author: el.getAttribute('author') ?? '' });
    if (reason) collapseComment(el, reason);
    else uncollapseComment(el);
  }

  function applyRoot(root) {
    if (root.matches?.(POST)) applyPost(root);
    else if (root.matches?.(COMMENT)) applyComment(root);
    for (const el of root.querySelectorAll?.(POST) ?? []) applyPost(el);
    for (const el of root.querySelectorAll?.(COMMENT) ?? []) applyComment(el);
  }

  function setPageFlags() {
    const html = document.documentElement;
    html.classList.toggle('rf-hide-promoted', rules.enabled && rules.hidePromoted);
  }

  // ---- counting -------------------------------------------------------------------

  let countTimer = 0;
  function reportCount() {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      const count = document.querySelectorAll('[data-rf-hidden]').length +
        (rules.enabled && rules.hidePromoted ? document.querySelectorAll(AD).length : 0);
      chrome.runtime.sendMessage({ type: 'count', count }).catch(() => {});
    }, 300);
  }

  // ---- watching the page --------------------------------------------------------

  const pending = new Set();
  let scheduled = false;
  const observer = new MutationObserver(mutations => {
    if (!ready) return;
    for (const m of mutations) {
      if (m.type === 'attributes') pending.add(m.target);
      for (const node of m.addedNodes) if (node.nodeType === 1) pending.add(node);
    }
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        for (const node of pending) {
          if (!node.isConnected) continue;
          applyRoot(node);
          // Content streamed into an existing post or comment (its <details>,
          // flair) can change the result, so recheck the nearest one.
          const owner = node.parentElement?.closest(`${POST}, ${COMMENT}`);
          if (owner) applyRoot(owner);
        }
        pending.clear();
        reportCount();
      });
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    // Reddit fills these in after the element is created on client-side navigation.
    attributeFilter: ['post-title', 'author', 'subreddit-prefixed-name', 'domain'],
  });

  function applyAll() {
    setPageFlags();
    applyRoot(document);
    reportCount();
  }

  async function loadSettings() {
    rules = compile(await chrome.storage.sync.get(DEFAULTS));
    ready = true;
    applyAll();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') loadSettings();
  });

  // ---- right-click "hide this ..." ----------------------------------------------

  document.addEventListener('contextmenu', e => {
    const el = e.target.closest?.(`${POST}, ${COMMENT}`) ??
      postBox(e.target).querySelector?.(POST) ?? null;
    lastRightClicked = el && {
      author: el.getAttribute('author'),
      subreddit: el.getAttribute('subreddit-prefixed-name'),
      domain: el.getAttribute('domain'),
    };
  }, true);

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type !== 'menu') return;
    addRule(msg.menu, msg.linkUrl).then(reply);
    return true;
  });

  async function addRule(menu, linkUrl) {
    const target = lastRightClicked ?? {};
    let list, value;
    if (menu === 'hide-user') {
      list = 'users';
      value = target.author ?? userFromUrl(linkUrl);
    } else if (menu === 'hide-subreddit') {
      list = 'subreddits';
      value = target.subreddit?.replace(/^r\//, '') ?? subredditFromUrl(linkUrl);
    } else if (menu === 'hide-domain') {
      list = 'domains';
      value = target.domain && !target.domain.startsWith('self.') ? target.domain : null;
    }
    if (!list || !value || value === '[deleted]') return { ok: false };
    const current = (await chrome.storage.sync.get({ [list]: [] }))[list];
    if (!current.some(v => v.toLowerCase() === value.toLowerCase())) {
      await chrome.storage.sync.set({ [list]: [...current, value] });
    }
    return { ok: true, list, value };
  }

  const userFromUrl = url => url?.match(/reddit\.com\/(?:u|user)\/([\w-]+)/)?.[1] ?? null;
  const subredditFromUrl = url => url?.match(/reddit\.com\/r\/(\w+)/)?.[1] ?? null;

  // Test hook: lets the e2e suite wait until filters are applied.
  document.documentElement.dataset.rfLoaded = '';
  loadSettings();
})();
