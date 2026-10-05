# Filter for Reddit

A Chrome extension for new Reddit:

1. **Removes ads**: promoted posts in feeds, ads inside comment threads and sidebar ads.
2. **Blocks without an account**: hide users, subreddits and websites even when you're logged out. Reddit's own block and mute need a login, and they also affect the other person; this is private and one-way.
3. **Filters by keyword**: hide posts whose title or flair matches words or phrases.

Blocked users' posts are hidden and their comments collapsed.

- Keyword rules match whole words, or `/regex/`.
- Right-click any post or comment and choose **Filter for Reddit** to hide that user, subreddit or website.
- Hidden posts leave a small "Hidden post (reason) · Show" line, which you can turn off.
- An optional switch hides auto-generated usernames (like `Original-Ad6801`).
- No tracking, no network requests. Filters sync through your Chrome profile.

## How it works
New Reddit renders posts as `<shreddit-post>` and comments as `<shreddit-comment>`, with the title, author, subreddit and domain in plain attributes. The content script reads only those attributes, which change far less often than Reddit's CSS classes.

## Develop
```
npm test         # matching rules (Node)
npm run e2e      # real Chrome on a fixture page; LIVE=1 also checks real Reddit
npm run build    # dist/reddit-filter-<version>.zip
```
Load `src/` with chrome://extensions → Developer mode → Load unpacked.

## Contributing
Open issues and PRs as you like.

MIT licensed.
