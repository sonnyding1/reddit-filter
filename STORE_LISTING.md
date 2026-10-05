# Chrome Web Store listing: copy and paste

## Name (from manifest)
Filter for Reddit — Remove Ads, Hide Users & Subreddits, Even Logged Out

## Summary (max 132 chars; Chrome takes this from the manifest description)
Remove Reddit ads and hide users, subreddits and keywords, even when logged out. Private, one-way, free and open source.

## Category
Lifestyle → Social Networking (runner-up: Make Chrome Yours → Functionality & UI)

## Description
Filter for Reddit removes ads from new Reddit and lets you hide users, subreddits, websites and keywords, with or without a Reddit account.

REMOVES ADS
• Promoted posts in your feed
• Ads inside comment threads and in the sidebar

HIDES WITHOUT AN ACCOUNT
• Hide users, subreddits and websites even when you're logged out. Reddit's own block and mute need a login.
• Private and one-way: unlike Reddit's block, the other person isn't affected
• A hidden user's posts disappear and their comments collapse
• Right-click any post or comment, then Filter for Reddit, to hide that user, subreddit or website in one click

HIDES BY KEYWORD
• Hide posts whose title or flair matches words or phrases (whole words, or /regex/ for patterns)
• Optionally hide auto-generated usernames (like Original-Ad6801), which are often new or throwaway accounts

ALSO
• A small "Hidden post (reason) · Show" line marks each hidden post, so nothing disappears silently. You can turn it off.
• The toolbar badge shows how many items were hidden on the page

PRIVATE AND OPEN SOURCE
Runs only on reddit.com. No tracking, no network requests. Your filters sync through your Chrome profile. Source code: https://github.com/sonnyding1/reddit-filter

Not affiliated with Reddit, Inc.

## Permission justifications
- storage: saves your filter lists and settings, synced through your Chrome profile.
- contextMenus: adds "Hide this user / subreddit / website" to the right-click menu on Reddit.
- Host access to www.reddit.com and sh.reddit.com (content script): reads post titles, authors, subreddits and link domains on the page to hide the ones matching your filters. Runs on no other site.
- Remote code: No.

## Single purpose
Hides Reddit posts and comments that match the user's filters.

## Data usage
Collects none of the listed data types. Tick all three certifications.

## Screenshots (1280×800, upload in this order)
assets/screenshots/1-ads.png
assets/screenshots/2-keywords.png
assets/screenshots/3-comments.png
assets/screenshots/4-right-click.png
assets/screenshots/5-settings.png

## Small promo tile (440×280)
assets/screenshots/promo-440x280.png

## Video
assets/video/demo.mp4 (20 s, not in git). The store only accepts a YouTube link: upload it to YouTube as Unlisted and paste the URL.
Regenerate everything with `node assets/capture.js` (live Reddit; titles are replaced with neutral samples and people/ads are blurred).
