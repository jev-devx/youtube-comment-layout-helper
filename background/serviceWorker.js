const log = {
  warn: (...a) => console.warn("[YCLH][SW]", ...a),
  error: (...a) => console.error("[YCLH][SW]", ...a),
};

const RUNTIME_PREFIX = "yclhRuntime:";
const RUNTIME_BASE_PREFIX = "yclhRuntimeBase:";

const isYoutubeUrl = (url) =>
  typeof url === "string" && url.startsWith("https://www.youtube.com/");
const isWatchUrl = (url) =>
  typeof url === "string" && url.startsWith("https://www.youtube.com/watch");
const isHttpUrl = (url) => /^https?:\/\//.test(url || "");

const runtimeKeyForTab = (tabId) => `${RUNTIME_PREFIX}${tabId}`;
const runtimeBaseKeyForTab = (tabId) => `${RUNTIME_BASE_PREFIX}${tabId}`;

/** URLだけで判定できる最低限 runtime（popup向けの base） */
const computeRuntimeFromUrl = (url) => {
  if (!isYoutubeUrl(url)) {
    return {
      suspended: true,
      suspendReason: "unsupported",
      pageType: "unsupported",
    };
  }
  if (isWatchUrl(url)) {
    return { suspended: false, suspendReason: null, pageType: "youtube" };
  }
  return { suspended: true, suspendReason: "non-watch", pageType: "youtube" };
};

/** base runtime は URL 由来として常に更新（detail は content が上書きする想定） */
const writeRuntimeBaseForTabFromUrl = async (tabId, url) => {
  const key = runtimeBaseKeyForTab(tabId);
  const rt = computeRuntimeFromUrl(url);
  await chrome.storage.session.set({ [key]: rt });
  return rt;
};

/** detail runtime は content 由来として常に上書きOK（theater/narrow等） */
const writeRuntimeDetailForTabFromContent = async (tabId, payload) => {
  const key = tabId != null ? runtimeKeyForTab(tabId) : "yclhRuntime";
  await chrome.storage.session.set({ [key]: payload });
};

// --------------------
// icon (imageData cache)
// --------------------

const ICON_CACHE = { enabled: null, disabled: null };

const iconPathMap = (disabled) =>
  disabled
    ? {
        16: "icons/icon16-disabled.png",
        32: "icons/icon32-disabled.png",
        48: "icons/icon48-disabled.png",
        128: "icons/icon128-disabled.png",
      }
    : {
        16: "icons/icon16.png",
        32: "icons/icon32.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png",
      };

const loadIconImageData = async (pathMap) => {
  const out = {};
  for (const [sizeStr, relPath] of Object.entries(pathMap)) {
    const size = Number(sizeStr);

    const res = await fetch(chrome.runtime.getURL(relPath));
    if (!res.ok) throw new Error(`fetch failed: ${relPath} -> ${res.status}`);

    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(bmp, 0, 0, size, size);

    out[size] = ctx.getImageData(0, 0, size, size);
    bmp.close?.();
  }
  return out;
};

const ensureIconCache = async () => {
  ICON_CACHE.enabled ??= await loadIconImageData(iconPathMap(false));
  ICON_CACHE.disabled ??= await loadIconImageData(iconPathMap(true));
};

// --------------------
// tab state update
// --------------------

const isNoTab = (e) => /No tab with id/i.test(e?.message || "");

const updateTabState = async (tabId, url) => {
  if (tabId == null) return;
  if (!isHttpUrl(url)) return;

  try {
    await writeRuntimeBaseForTabFromUrl(tabId, url);
  } catch (e) {
    log.warn("writeRuntimeBaseForTabFromUrl failed:", e, { tabId, url });
  }

  const disabled = !isYoutubeUrl(url);

  try {
    await ensureIconCache();
    await chrome.action.setIcon({
      tabId,
      imageData: disabled ? ICON_CACHE.disabled : ICON_CACHE.enabled,
    });
  } catch (e) {
    if (!isNoTab(e)) {
      log.warn("setIcon(imageData) failed:", e, { tabId, url, disabled });
    }
  }
};

// debounce for noisy events
const timers = new Map();
const pending = new Map();
const scheduleUpdate = (tabId, url) => {
  if (tabId == null) return;
  pending.set(tabId, url);

  clearTimeout(timers.get(tabId));
  timers.set(
    tabId,
    setTimeout(() => {
      const u = pending.get(tabId) || "";
      pending.delete(tabId);
      updateTabState(tabId, u);
    }, 60),
  );
};

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    scheduleUpdate(tabId, tab?.url ?? "");
  } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url ?? tab?.url;
  if (!url) return;
  scheduleUpdate(tabId, url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  pending.delete(tabId);

  chrome.storage.session.remove([
    runtimeKeyForTab(tabId),
    runtimeBaseKeyForTab(tabId),
  ]);
});

chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    scheduleUpdate(details.tabId, details.url);
  },
  { url: [{ hostEquals: "www.youtube.com" }] },
);

const refreshAllTabs = async () => {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (!t.id) continue;
    if (!isHttpUrl(t.url)) continue;
    scheduleUpdate(t.id, t.url ?? "");
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await ensureIconCache();
  } catch {}
  await refreshAllTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await ensureIconCache();
  } catch {}
  await refreshAllTabs();
});

// --------------------
// messages from content
// --------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender?.tab?.id;

  if (msg?.type === "YCLH_SET_RUNTIME") {
    (async () => {
      try {
        await writeRuntimeDetailForTabFromContent(tabId, msg.payload);
        sendResponse?.({ ok: true });
      } catch (e) {
        sendResponse?.({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (!tabId) return;

  (async () => {
    try {
      if (msg?.type === "YCLH_INSERT_CSS") {
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ["dist/content.css"],
        });
        sendResponse?.({ ok: true });
        return;
      }

      if (msg?.type === "YCLH_REMOVE_CSS") {
        await chrome.scripting.removeCSS({
          target: { tabId },
          files: ["dist/content.css"],
        });
        sendResponse?.({ ok: true });
        return;
      }
    } catch (e) {
      sendResponse?.({ ok: false, error: e?.message || String(e) });
    }
  })();

  return true;
});
