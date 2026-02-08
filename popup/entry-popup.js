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

  // mute banner
  if (muteBannerEl && muteBannerTextEl) {
    const show = !s.enabled;
    muteBannerEl.hidden = !show;
    muteBannerTextEl.textContent = show ? MSG_MUTE.REQUIRE_ENABLE : "";
  }
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

  onSettingsChanged(async (patch) => {
    const s = await loadSettings();
    renderSettings(s);

    // wordMute 以外の変更なら何もしない/または必要に応じて
    if (!("wordMute" in patch)) return;

    // wordMute は「入力中に再描画するとフォーカスが飛ぶ」のでガードする
    const ae = document.activeElement;
    const isTyping =
      ae instanceof HTMLInputElement && ae.classList.contains("textInput");

    if (isTyping) return; // 入力中は何もしない

    // 入力中じゃないなら同期反映してOK
    muteState = normalizeWordMute(s.wordMute);
    renderMute();
  });

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
 * tabs（popup local UI）
 * ---------------------------------------------------------- */

const TAB = {
  LAYOUT: "layout",
  MUTE: "mute",
};

const tabButtons = {
  [TAB.LAYOUT]: $("tabLayout"),
  [TAB.MUTE]: $("tabMute"),
};

const tabPanels = {
  [TAB.LAYOUT]: $("panelLayout"),
  [TAB.MUTE]: $("panelMute"),
};

let activeTab = TAB.LAYOUT;

const applyTabUi = (next) => {
  activeTab = next;

  Object.entries(tabButtons).forEach(([key, btn]) => {
    const selected = key === next;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    btn.tabIndex = selected ? 0 : -1;
  });

  Object.entries(tabPanels).forEach(([key, panel]) => {
    panel.hidden = key !== next;
  });
};

const bindTabs = () => {
  Object.entries(tabButtons).forEach(([key, btn]) => {
    btn.addEventListener("click", () => applyTabUi(key));
  });

  // キーボード操作（左右で移動）
  const order = [TAB.LAYOUT, TAB.MUTE];
  const move = (dir) => {
    const idx = order.indexOf(activeTab);
    const next = order[(idx + dir + order.length) % order.length];
    applyTabUi(next);
    tabButtons[next].focus();
  };

  Object.values(tabButtons).forEach((btn) => {
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        move(1);
      }
    });
  });
};

/* ------------------------------------------------------------
 * mute UI
 * ---------------------------------------------------------- */

const muteEls = {
  list: $("muteList"),
  add: $("muteAdd"),
  presetDefault: $("replacePresetDefault"),
  presetNyan: $("replacePresetNyan"),
  muteForChat: $("muteApplyChat"),
};

const MUTE_LIMIT = 15;
const WORD_LIMIT = 15;

const clampText = (v, max) => (v || "").slice(0, max);

// UUID 生成（保険付き）
const genId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// settings から来た値を “安全な形” に整形
const normalizeWordMute = (wm) => {
  const preset = wm?.preset === "nyan" ? "nyan" : "default";
  const muteForChat = wm?.muteForChat !== false; // default true

  const itemsRaw = Array.isArray(wm?.items) ? wm.items : [];
  let items = itemsRaw.map((x) => ({
    id: typeof x?.id === "string" && x.id ? x.id : genId(),
    word: clampText(x?.word ?? "", WORD_LIMIT),
  }));

  // 0件は作らない
  if (items.length === 0) items = [{ id: genId(), word: "" }];

  // 上限
  if (items.length > MUTE_LIMIT) items = items.slice(0, MUTE_LIMIT);

  return { preset, muteForChat, items };
};

// local state
let muteState = {
  preset: "default",
  muteForChat: true,
  items: [{ id: genId(), word: "" }],
};

const saveMuteState = async () => {
  await saveSettings({ wordMute: muteState });
};

const muteCountEl = $("muteCount");

const renderMute = () => {
  // preset radios
  muteEls.presetDefault.checked = muteState.preset === "default";
  muteEls.presetNyan.checked = muteState.preset === "nyan";

  // apply to chat
  if (muteEls.muteForChat) {
    muteEls.muteForChat.checked = muteState.muteForChat;
  }

  // count + add enable
  if (muteCountEl) {
    muteCountEl.textContent = `${muteState.items.length}/${MUTE_LIMIT}`;
  }
  if (muteEls.add) {
    muteEls.add.disabled = muteState.items.length >= MUTE_LIMIT;
  }

  // list
  const root = muteEls.list;
  root.innerHTML = "";

  muteState.items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "muteItem";
    el.dataset.id = item.id;

    el.innerHTML = `
      <div class="muteItem__head">
        <div class="muteItem__left">
          <span class="muteItem__label">部分一致</span>
        </div>

        <div class="muteItem__actions">
          <button class="iconBtn iconBtn--danger" type="button" data-action="remove" aria-label="削除">
            ✕
          </button>
        </div>
      </div>

      <div class="muteItem__body">
        <div class="muteItem__bodyRow">
          <div class="textInputWrap">
            <input
              class="textInput"
              type="text"
              inputmode="text"
              maxlength="${WORD_LIMIT}"
              placeholder="ミュートワード（最大${WORD_LIMIT}文字）"
              value="${escapeHtml(item.word)}"
              data-field="word"
            />
          </div>

          <div class="textCounter" aria-hidden="true"></div>
        </div>
      </div>
    `;

    const input = el.querySelector(".textInput");
    const bodyRow = el.querySelector(".muteItem__bodyRow");
    if (bodyRow) {
      updateCounter(bodyRow, item.word, WORD_LIMIT);
    }

    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.dataset.action === "remove") {
        muteState.items = muteState.items.filter((x) => x.id !== item.id);
        if (muteState.items.length === 0) {
          muteState.items = [{ id: genId(), word: "" }];
        }
        renderMute();
        markMuteDirty();
        scheduleSaveMute();
      }
    });

    el.addEventListener("input", (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.dataset.field !== "word") return;

      item.word = clampText(input.value, WORD_LIMIT);
      if (input.value !== item.word) input.value = item.word;

      const bodyRow = input.closest(".muteItem__bodyRow");
      if (bodyRow) {
        updateCounter(bodyRow, item.word, WORD_LIMIT);
      }

      markMuteDirty();
      scheduleSaveMute();
    });

    root.appendChild(el);
  });
};

const updateCounter = (root, value, maxLen) => {
  const counter = root.querySelector(".textCounter");
  if (!counter) return;

  const len = value.length;
  counter.textContent = `${len}/${maxLen}`;
  counter.classList.toggle("is-max", len >= maxLen);
};

const bindMuteUi = async () => {
  const s = await loadSettings();
  muteState = normalizeWordMute(s.wordMute);

  const onPreset = async (value) => {
    muteState.preset = value;
    renderMute();
    markMuteDirty();
    scheduleSaveMute();
  };

  muteEls.presetDefault.addEventListener("change", (e) => {
    if (e.target.checked) onPreset("default");
  });
  muteEls.presetNyan.addEventListener("change", (e) => {
    if (e.target.checked) onPreset("nyan");
  });

  if (muteEls.muteForChat) {
    muteEls.muteForChat.addEventListener("change", (e) => {
      muteState.muteForChat = !!e.target.checked;
      markMuteDirty();
      scheduleSaveMute();
    });
  }

  muteEls.add.addEventListener("click", () => {
    if (muteState.items.length >= MUTE_LIMIT) return;
    muteState.items.push({ id: genId(), word: "" });
    renderMute();
    markMuteDirty();
    scheduleSaveMute();
  });

  renderMute();
};

let muteSaveTimer = 0;
let muteDirty = false;

const markMuteDirty = () => (muteDirty = true);

const flushMuteSave = async () => {
  clearTimeout(muteSaveTimer);
  muteSaveTimer = 0;

  if (!muteDirty) return; // 変更なしなら保存しない
  muteDirty = false;

  await saveMuteState();
};
const scheduleSaveMute = () => {
  clearTimeout(muteSaveTimer);
  muteSaveTimer = setTimeout(() => flushMuteSave().catch(() => {}), 200);
};

// XSS対策（popup内でも一応）
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const muteBannerEl = $("muteBanner");
const muteBannerTextEl = $("muteBannerText");

const MSG_MUTE = {
  REQUIRE_ENABLE:
    "適用するには「YCLHを有効化」をONにしてください\nOFFの状態でも設定は保存できます",
};

const bindCloseFlush = () => {
  const flush = async () => {
    try {
      await flushMuteSave();
    } catch {}
  };

  // popup が閉じられるとき
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flushMuteSave().catch(() => {});
    }
  });

  // 入力欄から離れたとき（自然なタイミングだけ）
  document.addEventListener("focusout", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.classList.contains("textInput")) {
      flush();
    }
  });
};

/* ------------------------------------------------------------
 * 起動シーケンス
 * ---------------------------------------------------------- */
resetStatusUi();

bindTabs();
applyTabUi(TAB.LAYOUT);

await bindMuteUi();

bindCloseFlush();

await initSettingsUi();
await renderRuntimeForActiveTab();
watchRuntimeChanges();
