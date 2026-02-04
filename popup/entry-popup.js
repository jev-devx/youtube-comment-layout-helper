import {
  loadSettings,
  saveSettings,
  onSettingsChanged,
} from "../content/shared/storage.js";
import { DEFAULT_SETTINGS } from "../content/shared/settings.js";

/* ------------------------------------------------------------
 * DOM ユーティリティ
 * ---------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// --- Status UI ---
const overlayEl = $("statusOverlay");
const statusTextEl = $("statusText");

// --- Info Banner ---
const infoBannerEl = $("infoBanner");
const infoBannerTextEl = $("infoBannerText");

const statusHintEl = $("statusHint");

/** UI初期化：popup起動直後は必ず隠す */
const resetStatusUi = () => {
  overlayEl.hidden = true;
  statusTextEl.textContent = "";
  infoBannerEl.hidden = true;
  infoBannerTextEl.textContent = "";
  statusHintEl.hidden = true;
};

const showOverlay = (msg, hintText = "") => {
  statusTextEl.textContent = msg;
  overlayEl.hidden = false;

  if (hintText) {
    statusHintEl.textContent = hintText;
    statusHintEl.hidden = false;
  } else {
    statusHintEl.textContent = "";
    statusHintEl.hidden = true;
  }
};

const showInfo = (msg) => {
  infoBannerTextEl.textContent = msg;
  infoBannerEl.hidden = false;
};

/* ------------------------------------------------------------
 * runtime（session）表示ロジック
 * ---------------------------------------------------------- */

const MSG = {
  // 共通
  NOT_YOUTUBE: "YCLHはYouTube専用の拡張機能です",
  NOT_WATCH: "YouTubeの動画ページで有効になります",
  RELOAD_HINT: "うまく反映されない場合は、ページをリロードしてください",

  // Runtime / 状態系
  RUNTIME_UNAVAILABLE:
    "ページ情報を取得できませんでした（タブを更新すると改善することがあります）",

  // 設定系
  REQUIRE_ENABLE:
    "このページで有効にするには、下の「YCLHを有効化する」をONにしてください",

  // Overlay（環境要因）
  THEATER_DISABLED: "シアターモードのため自動でOFFになりました",
  THEATER_HINT: "シアターモード解除してONにしてください",

  NARROW_DISABLED: "ウィンドウ幅が小さいため自動でOFFになりました",
  NARROW_HINT: "ウィンドウ幅を広げてONにしてください",
};

const renderRuntimeStatus = (rt, settings) => {
  // 確認用
  // showInfo(JSON.stringify(rt));
  // return;

  resetStatusUi();

  if (!rt) {
    showInfo(MSG.RUNTIME_UNAVAILABLE);
    return;
  }

  // Youtubeではないページ
  if (rt.pageType === "unsupported") {
    showInfo(MSG.NOT_YOUTUBE);
    return;
  }

  // YouTubeだが watch ではない（Top / 検索 / チャンネル）
  if (rt.suspendReason === "non-watch") {
    showInfo(MSG.NOT_WATCH);
    return;
  }

  // 環境要因（シアターモード）
  if (rt.suspendReason === "theater") {
    showOverlay(MSG.THEATER_DISABLED, MSG.THEATER_HINT);
    return;
  }

  // 環境要因（ウィンドウ幅が狭い）
  if (rt.suspendReason === "narrow") {
    showOverlay(MSG.NARROW_DISABLED, MSG.NARROW_HINT);
    return;
  }

  // 視聴ページにはいるがOFFになっている
  if (rt.suspendReason === "disabled") {
    showInfo(MSG.REQUIRE_ENABLE);
    return;
  }

  // watch だが SPA直後で runtime 未確定 ＋ OFF
  if (
    rt.pageType === "youtube" &&
    rt.suspendReason == null &&
    settings.enabled !== true
  ) {
    showInfo(MSG.REQUIRE_ENABLE);
    return;
  }

  // watch & 有効だが反映が遅いケース
  if (rt.pageType === "youtube" && rt.suspended !== true) {
    if (settings.enabled === true) showInfo(MSG.RELOAD_HINT);
    return;
  }

  // 最後の保険
  if (settings.enabled === true) {
    showInfo(MSG.RELOAD_HINT);
    return;
  }

  showInfo(MSG.NOT_YOUTUBE);
};

/* ------------------------------------------------------------
 * settings（sync）描画ロジック
 * ---------------------------------------------------------- */

const renderSettings = (s) => {
  $("enabled").checked = !!s.enabled;
  $("moveLeft").checked = !!s.moveLeft;

  $("moveLeft").disabled = !s.enabled;

  // chatAutoMode
  const mode = s.chatAutoMode || "recommended";
  $("chatAutoRecommended").checked = mode === "recommended";
  $("chatAutoDefault").checked = mode === "default";

  // enabled=false のとき触れないようにするなら
  $("chatAutoRecommended").disabled = !s.enabled;
  $("chatAutoDefault").disabled = !s.enabled;
};

/* ------------------------------------------------------------
 * 設定イベント（toggle / reset）
 * ---------------------------------------------------------- */

const bindToggle = (key) => {
  $(key).addEventListener("change", async (e) => {
    await saveSettings({ [key]: e.target.checked });
    renderSettings(await loadSettings());
  });
};

const bindRadio = (name, key) => {
  const els = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
  els.forEach((el) => {
    el.addEventListener("change", async (e) => {
      if (!e.target.checked) return;
      await saveSettings({ [key]: e.target.value });
      renderSettings(await loadSettings());
    });
  });
};

const initSettingsUi = async () => {
  renderSettings(await loadSettings());

  bindToggle("enabled");
  bindToggle("moveLeft");
  bindRadio("chatAutoMode", "chatAutoMode");

  onSettingsChanged(async () => renderSettings(await loadSettings()));

  $("reset").addEventListener("click", async () => {
    await saveSettings(DEFAULT_SETTINGS);
    renderSettings(await loadSettings());
  });
};

/* ------------------------------------------------------------
 * runtime 取得（session）: 現在タブの yclhRuntime:<tabId> を読む
 * ---------------------------------------------------------- */

const getActiveTabId = async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab && tab.id != null ? tab.id : null;
  } catch {
    return null;
  }
};

const loadRuntimeForActiveTab = async () => {
  const tabId = await getActiveTabId();
  const keyDetail = tabId != null ? `yclhRuntime:${tabId}` : "yclhRuntime";
  const keyBase =
    tabId != null ? `yclhRuntimeBase:${tabId}` : "yclhRuntimeBase";

  try {
    const obj = await chrome.storage.session.get([keyBase, keyDetail]);
    const base = obj[keyBase] ?? null;
    const detail = obj[keyDetail] ?? null;
    // detail があればそれを優先しつつ、base で穴埋め
    return { ...(base || {}), ...(detail || {}) } || null;
  } catch {
    return null;
  }
};

const renderRuntimeForActiveTab = async () => {
  const [rt, s] = await Promise.all([
    loadRuntimeForActiveTab(),
    loadSettings(),
  ]);
  renderRuntimeStatus(rt, s);
};

const watchRuntimeChanges = () => {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "session") return;

    const tabId = await getActiveTabId();
    const keyDetail = tabId != null ? `yclhRuntime:${tabId}` : "yclhRuntime";
    const keyBase =
      tabId != null ? `yclhRuntimeBase:${tabId}` : "yclhRuntimeBase";

    if (!changes[keyBase] && !changes[keyDetail]) return;

    const rt = await loadRuntimeForActiveTab();
    const s = await loadSettings();
    renderRuntimeStatus(rt, s);
  });
};

/* ------------------------------------------------------------
 * 起動シーケンス
 * ---------------------------------------------------------- */
resetStatusUi();
await initSettingsUi();
await renderRuntimeForActiveTab();
watchRuntimeChanges();
