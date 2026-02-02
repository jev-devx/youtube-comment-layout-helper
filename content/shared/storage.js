import { DEFAULT_SETTINGS } from "./settings.js";

export const loadSettings = () =>
  new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (res) => resolve(res));
  });

export const saveSettings = (patch) =>
  new Promise((resolve) => {
    chrome.storage.sync.set(patch, () => resolve());
  });

export const onSettingsChanged = (handler) => {
  const listener = (changes, area) => {
    if (area !== "sync") return;

    const patch = {};
    for (const [k, v] of Object.entries(changes)) {
      patch[k] = v.newValue;
    }
    handler(patch);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};
