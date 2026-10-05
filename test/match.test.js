import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/match.js';

const { compile, postReason, commentReason, parseList } = globalThis.RedditFilter;
const post = p => ({ title: '', author: 'someone', subreddit: 'r/pics', domain: 'self.pics', ...p });

test('keywords match whole words, case-insensitively', () => {
  const r = compile({ keywords: ['Cat', 'election results'] });
  assert.equal(postReason(r, post({ title: 'My cat did this' })), '"Cat"');
  assert.equal(postReason(r, post({ title: 'Free education tips' })), null);
  assert.equal(postReason(r, post({ title: 'ELECTION  results are in' })), '"election results"');
});

test('keywords also check flair', () => {
  const r = compile({ keywords: ['spoiler'] });
  assert.equal(postReason(r, post({ title: 'Episode 5', flair: 'Spoiler' })), '"spoiler"');
});

test('regex keywords, and bad regex is ignored', () => {
  const r = compile({ keywords: ['/\\bgpt-?\\d/', '/(unclosed/'] });
  assert.equal(postReason(r, post({ title: 'GPT5 is out' })), '"/\\bgpt-?\\d/"');
  assert.equal(postReason(r, post({ title: 'nothing here' })), null);
});

test('users, with or without u/ prefix', () => {
  const r = compile({ users: ['u/SpamBot', 'other'] });
  assert.equal(postReason(r, post({ author: 'spambot' })), 'user u/spambot');
  assert.equal(commentReason(r, { author: 'Other' }), 'user u/Other');
  assert.equal(commentReason(r, { author: 'fine' }), null);
});

test('subreddits in any format', () => {
  const r = compile({ subreddits: ['/r/News', 'politics'] });
  assert.equal(postReason(r, post({ subreddit: 'r/news' })), 'r/news');
  assert.equal(postReason(r, post({ subreddit: 'r/politics' })), 'r/politics');
  assert.equal(postReason(r, post({ subreddit: 'r/worldnews' })), null);
});

test('domains match subdomains but not lookalikes', () => {
  const r = compile({ domains: ['https://www.example.com/path', 'x.com'] });
  assert.equal(postReason(r, post({ domain: 'example.com' })), 'example.com');
  assert.equal(postReason(r, post({ domain: 'news.example.com' })), 'example.com');
  assert.equal(postReason(r, post({ domain: 'notexample.com' })), null);
  assert.equal(postReason(r, post({ domain: 'x.com' })), 'x.com');
});

test('auto-generated usernames', () => {
  const r = compile({ hideDefaultNames: true });
  for (const name of ['Original-Ad6801', 'Hot_Mess_1234', 'Lazy-Cat-42']) {
    assert.equal(commentReason(r, { author: name }), 'auto-generated username', name);
  }
  for (const name of ['Super_un_stable', 'spez', 'Gallowboob', 'Two_Words']) {
    assert.equal(commentReason(r, { author: name }), null, name);
  }
  assert.equal(commentReason(compile({}), { author: 'Original-Ad6801' }), null);
});

test('promoted posts and master switch', () => {
  assert.equal(postReason(compile({}), post({ promoted: true })), 'promoted');
  assert.equal(postReason(compile({ hidePromoted: false }), post({ promoted: true })), null);
  assert.equal(postReason(compile({ enabled: false, keywords: ['a'] }), post({ title: 'a' })), null);
});

test('parseList skips blanks and comments', () => {
  assert.deepEqual(parseList(' a \n\n# note\nb\n'), ['a', 'b']);
});
