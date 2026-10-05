// Rule matching, shared by the content script and the Node tests.
// Classic script (content scripts can't be modules), so it sets a global.

(() => {
  const DEFAULTS = {
    enabled: true,
    keywords: [],      // matched against post titles and flair
    users: [],         // hides their posts and comments
    subreddits: [],    // hides posts from these subreddits in mixed feeds
    domains: [],       // hides link posts to these sites
    hideDefaultNames: false,
    hidePromoted: true,
    showPlaceholder: true,
  };

  // Reddit's suggested usernames look like "Original-Ad6801" or "Hot_Mess_1234".
  const DEFAULT_NAME = /^[A-Z][a-z]+[-_][A-Z][a-z]+[-_]?\d{1,5}$/;

  const norm = s => String(s ?? '').trim().toLowerCase();
  const stripPrefix = (s, prefix) => {
    s = norm(s).replace(/^\/+/, '');
    return s.startsWith(prefix) ? s.slice(prefix.length) : s;
  };

  // One rule per line; blank lines and lines starting with # are ignored.
  function parseList(text) {
    return String(text ?? '')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  }

  // "/pattern/flags" is a regex, anything else a case-insensitive phrase
  // matched on word boundaries, so "cat" doesn't hide "education".
  function compileKeyword(rule) {
    const re = rule.match(/^\/(.+)\/([a-z]*)$/);
    if (re) {
      try {
        return { rule, test: new RegExp(re[1], re[2].includes('i') ? re[2] : re[2] + 'i') };
      } catch {
        return null;
      }
    }
    const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return { rule, test: new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu') };
  }

  function compile(settings) {
    const s = { ...DEFAULTS, ...settings };
    return {
      enabled: s.enabled,
      hidePromoted: s.hidePromoted,
      showPlaceholder: s.showPlaceholder,
      hideDefaultNames: s.hideDefaultNames,
      keywords: s.keywords.map(compileKeyword).filter(Boolean),
      users: new Set(s.users.map(u => stripPrefix(u, 'u/'))),
      subreddits: new Set(s.subreddits.map(r => stripPrefix(r, 'r/'))),
      domains: s.domains.map(d => norm(d).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')),
    };
  }

  function domainMatches(domain, rule) {
    domain = norm(domain).replace(/^www\./, '');
    return domain === rule || domain.endsWith('.' + rule);
  }

  function userReason(rules, author) {
    if (!author) return null;
    if (rules.users.has(norm(author))) return `user u/${author}`;
    if (rules.hideDefaultNames && DEFAULT_NAME.test(author)) return 'auto-generated username';
    return null;
  }

  // post: { title, author, subreddit, domain, flair, promoted }
  // Returns a short reason string when the post should be hidden, else null.
  function postReason(rules, post) {
    if (!rules.enabled) return null;
    if (post.promoted) return rules.hidePromoted ? 'promoted' : null;
    const user = userReason(rules, post.author);
    if (user) return user;
    if (post.subreddit && rules.subreddits.has(stripPrefix(post.subreddit, 'r/'))) {
      return `r/${stripPrefix(post.subreddit, 'r/')}`;
    }
    if (post.domain && !norm(post.domain).startsWith('self.')) {
      const d = rules.domains.find(rule => domainMatches(post.domain, rule));
      if (d) return d;
    }
    const text = [post.title, post.flair].filter(Boolean).join(' • ');
    const kw = rules.keywords.find(k => k.test.test(text));
    if (kw) return `"${kw.rule}"`;
    return null;
  }

  // comment: { author }
  function commentReason(rules, comment) {
    if (!rules.enabled) return null;
    return userReason(rules, comment.author);
  }

  globalThis.RedditFilter = { DEFAULTS, DEFAULT_NAME, parseList, compile, postReason, commentReason };
})();
