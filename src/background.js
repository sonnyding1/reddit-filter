const REDDIT = ['https://www.reddit.com/*', 'https://sh.reddit.com/*'];

const MENUS = [
  { id: 'hide-user', title: 'Hide this user' },
  { id: 'hide-subreddit', title: 'Hide this subreddit' },
  { id: 'hide-domain', title: "Hide this post's website" },
];

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'root', title: 'Filter for Reddit', contexts: ['all'], documentUrlPatterns: REDDIT });
    for (const m of MENUS) {
      chrome.contextMenus.create({ ...m, parentId: 'root', contexts: ['all'], documentUrlPatterns: REDDIT });
    }
  });
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || !MENUS.some(m => m.id === info.menuItemId)) return;
  chrome.tabs.sendMessage(tab.id, { type: 'menu', menu: info.menuItemId, linkUrl: info.linkUrl }, { frameId: info.frameId ?? 0 })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'count' || !sender.tab?.id) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#576f76' });
  chrome.action.setBadgeText({ tabId, text: msg.count ? String(Math.min(msg.count, 999)) : '' });
  chrome.storage.session.set({ [`count:${tabId}`]: msg.count });
});

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(`count:${tabId}`));
