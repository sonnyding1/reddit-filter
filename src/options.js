const { DEFAULTS, parseList } = globalThis.RedditFilter;

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULTS);

  for (const box of document.querySelectorAll('[data-key]')) {
    box.checked = settings[box.dataset.key] === true;
    box.addEventListener('change', () => save({ [box.dataset.key]: box.checked }));
  }

  for (const area of document.querySelectorAll('[data-list]')) {
    const key = area.dataset.list;
    area.value = settings[key].join('\n');
    let timer = 0;
    area.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => save({ [key]: parseList(area.value) }), 500);
    });
  }

  // Keep the page current when a rule is added from Reddit's right-click menu.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      const field = document.querySelector(`[data-list="${key}"]`);
      if (field && document.activeElement !== field) field.value = (newValue ?? []).join('\n');
    }
  });
}

let savedTimer = 0;
async function save(values) {
  await chrome.storage.sync.set(values);
  const saved = document.getElementById('saved');
  saved.hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { saved.hidden = true; }, 1200);
}

init();
