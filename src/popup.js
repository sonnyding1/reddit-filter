(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = `count:${tab?.id}`;
  const count = (await chrome.storage.session.get(key))[key];
  if (count === undefined) {
    document.getElementById('count').textContent = '–';
    document.getElementById('count-label').textContent = 'Open a Reddit page to filter it';
  } else {
    document.getElementById('count').textContent = count;
  }

  const enabled = document.getElementById('enabled');
  enabled.checked = (await chrome.storage.sync.get({ enabled: true })).enabled;
  enabled.addEventListener('change', () => chrome.storage.sync.set({ enabled: enabled.checked }));

  document.getElementById('edit').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
})();
