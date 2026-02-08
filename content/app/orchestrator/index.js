import {
  settings,
  original,
  resetOriginal,
  runtimeState,
} from "../../shared/state.js";

import {
  rememberChatOriginal,
  restoreChatOriginal,
  rememberCommentsOriginal,
  restoreCommentsOriginal,
  rememberPlaylistOriginal,
  restorePlaylistOriginal,
  rememberRelatedOriginal,
  restoreRelatedOriginal,
} from "../dom/originals.js";

import {
  canBuildLayoutRoot,
  cleanupLayoutRoot,
  ensureLayoutRoot,
} from "../dom/layoutRoot.js";

import {
  cleanupSideUi,
  ensureSidePanels,
  ensureSideTabs,
  getPanelChat,
  getPanelComments,
  getPanelPlaylist,
  getPanelRelated,
  hasTabButton,
  setActivePanel,
  setActiveTab,
  setTabEnabled,
  setTabVisible,
} from "../dom/sideRoot.js";

import { createSizing } from "../dom/sizing.js";

export const createOrchestrator = () => {
  // ------------------------------------------------------------
  // runtime flags / state
  // ------------------------------------------------------------
  // orchestrator の有効/無効、boot監視、CSS挿入状態などの内部状態を保持する。
  let applied = false;
  let bootObserver = null;
  let bootTimer = 0;

  let cssInserted = false;
  const sizing = createSizing();

  let replayClickedForVideoId = "";

  let suspendedReason = null; // null | "narrow" | "theater" | "non-watch" | "disabled"

  let narrowState = null; // null | boolean
  const NARROW_BREAKPOINT = 1260;
  const NARROW_BREAKPOINT_ENTER = 1240;
  const NARROW_BREAKPOINT_EXIT = 1280;

  let wordMuteCommentsObserver = null;
  let wordMuteCommentsBootObserver = null;
  let wordMuteCommentsBootTimer = 0;

  // ------------------------------------------------------------
  // boot watch (短命監視)
  // ------------------------------------------------------------
  // 初期DOMが揃うまで MutationObserver + timer で apply をリトライする仕組み。
  // 永久監視にならないよう stopBootWatch で確実に止める。
  const stopBootWatch = () => {
    if (bootObserver) {
      bootObserver.disconnect();
      bootObserver = null;
    }
    if (bootTimer) {
      clearTimeout(bootTimer);
      bootTimer = 0;
    }
  };

  // ------------------------------------------------------------
  // css injection (content.css の on/off)
  // ------------------------------------------------------------
  // content側にCSSを差し込む（有効化 / 無効化時）メッセージを送る。
  // 二重実行を避けるため cssInserted をガードにする。
  const ensureCssInserted = () => {
    if (cssInserted) return;
    cssInserted = true;
    try {
      chrome.runtime.sendMessage({ type: "YCLH_INSERT_CSS" });
    } catch {}
  };

  const ensureCssRemoved = () => {
    if (!cssInserted) return;
    cssInserted = false;
    try {
      chrome.runtime.sendMessage({ type: "YCLH_REMOVE_CSS" });
    } catch {}
  };

  // ------------------------------------------------------------
  // ready gate (DOM準備が整った瞬間に tryApplyOnce を再試行)
  // ------------------------------------------------------------
  let readyGateObserver = null;
  let readyGateTimer = 0;

  const startReadyGate = (why = "") => {
    if (readyGateObserver) return;

    const tick = () => {
      if (!applied) return;
      if (runtimeState.suspended) return;

      // canBuildLayoutRoot が false なら tryApplyOnce しない
      if (!canBuildLayoutRoot()) return;

      if (tryApplyOnce()) {
        stopReadyGate();
        return;
      }
    };

    readyGateObserver = new MutationObserver(() => tick());
    readyGateObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 保険：observerが拾えないケース用に低頻度tick
    readyGateTimer = setInterval(tick, 700);

    // 初回も試す
    tick();
  };

  const stopReadyGate = () => {
    if (readyGateObserver) {
      readyGateObserver.disconnect();
      readyGateObserver = null;
    }
    if (readyGateTimer) {
      clearInterval(readyGateTimer);
      readyGateTimer = 0;
    }
  };

  // ------------------------------------------------------------
  // 署名ガード
  // ------------------------------------------------------------
  let lastAppliedSig = "";
  const getApplySig = () => {
    // 重要なものだけでOK（増やしすぎると無意味に変わる）
    const vid = (() => {
      try {
        return new URL(location.href).searchParams.get("v") || "";
      } catch {
        return "";
      }
    })();

    return [
      "v2",
      location.pathname,
      vid,
      settings.enabled ? "E1" : "E0",
      settings.moveLeft ? "L1" : "L0",
    ].join("|");
  };

  // ------------------------------------------------------------
  // state change
  // ------------------------------------------------------------
  const isWatch = () => location.pathname === "/watch";

  const getViewportWidth = () => {
    const vv = window.visualViewport;
    const w1 = vv && vv.width != null ? vv.width : null;
    const w2 = window.innerWidth != null ? window.innerWidth : null;
    const w3 = document.documentElement.clientWidth;
    return Math.round(w1 != null ? w1 : w2 != null ? w2 : w3);
  };

  const isNarrowMode = () => {
    const w = getViewportWidth();
    if (narrowState == null) narrowState = w < NARROW_BREAKPOINT;

    if (!narrowState && w < NARROW_BREAKPOINT_ENTER) narrowState = true;
    else if (narrowState && w > NARROW_BREAKPOINT_EXIT) narrowState = false;

    return narrowState;
  };

  const isTheaterMode = () => {
    const flexy = document.querySelector("ytd-watch-flexy");
    if (!flexy) return false;

    return (
      flexy.hasAttribute("theater") ||
      flexy.hasAttribute("theater-requested") ||
      flexy.classList.contains("theater") ||
      flexy.hasAttribute("is-theater-mode") ||
      flexy.classList.contains("theater-mode")
    );
  };

  const publishRuntime = () => {
    try {
      chrome.runtime.sendMessage({
        type: "YCLH_SET_RUNTIME",
        payload: {
          pageType: location.hostname.endsWith("youtube.com")
            ? "youtube"
            : "unsupported",

          // popupが見てるやつ
          suspended: runtimeState.suspended,
          suspendReason: runtimeState.suspendReason,

          // デバッグ用（任意）
          navSeq,
          lastUrl: location.href,
        },
      });
    } catch {}
  };

  const setSuspended = (reason) => {
    if (suspendedReason === reason) return false;
    suspendedReason = reason;

    runtimeState.suspended = !!reason;
    runtimeState.suspendReason =
      reason === "narrow" ||
      reason === "theater" ||
      reason === "non-watch" ||
      reason === "disabled"
        ? reason
        : null;

    // ここで「popupが読む runtime」を更新
    publishRuntime();

    return true;
  };

  const evaluateEnvAndSync = (from = "") => {
    if (!applied) return;

    // 設定OFFなら “disabled” 扱い（popupに出すなら）
    if (!settings.enabled) {
      if (setSuspended("disabled")) restore({ hard: true });
      return;
    }

    if (!isWatch()) {
      if (setSuspended("non-watch")) restore({ hard: false });
      return;
    }

    if (isNarrowMode()) {
      if (setSuspended("narrow")) restore({ hard: false });
      return;
    }

    if (isTheaterMode()) {
      if (setSuspended("theater")) restore({ hard: false });
      return;
    }

    // ここまで来たら環境OK
    if (setSuspended(null)) {
      // 復帰（DOMが揃ってない可能性があるので bumpNav か tryApplyOnce で再開）
      bumpNav("env-resume:" + from);
    }
  };

  let envTimer = 0;
  let envFlexyObserver = null;
  let envOnResize = null;
  const startEnvWatch = () => {
    if (envTimer) return;

    // resize / visualViewport
    envOnResize = () => evaluateEnvAndSync("resize");
    window.addEventListener("resize", envOnResize, true);
    window.visualViewport?.addEventListener?.("resize", envOnResize, true);

    envTimer = setInterval(() => evaluateEnvAndSync("tick"), 800); // 保険（軽め）

    // theater attribute 監視（flexyがある時）
    const attachFlexyObserver = () => {
      if (envFlexyObserver) return;
      const flexy = document.querySelector("ytd-watch-flexy");
      if (!flexy) return;

      envFlexyObserver = new MutationObserver(() =>
        evaluateEnvAndSync("flexy"),
      );
      envFlexyObserver.observe(flexy, {
        attributes: true,
        attributeFilter: ["theater", "theater-requested", "class"],
      });
    };

    attachFlexyObserver();
    const boot = new MutationObserver(() => attachFlexyObserver());
    boot.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => boot.disconnect(), 6000);

    // 初回評価
    evaluateEnvAndSync("start");
  };

  const stopEnvWatch = () => {
    if (!envTimer) return;

    // remove listeners
    window.removeEventListener("resize", envOnResize, true);
    window.visualViewport?.removeEventListener?.("resize", envOnResize, true);
    envOnResize = null;

    clearInterval(envTimer);
    envTimer = 0;

    if (envFlexyObserver) {
      envFlexyObserver.disconnect();
      envFlexyObserver = null;
    }

    suspendedReason = null;
    narrowState = null;
  };

  // ------------------------------------------------------------
  // navigation (SPA) generation
  // ------------------------------------------------------------
  let navSeq = 0;
  let lastUrl = location.href;
  let navReapplyTimer = 0;

  const bumpNav = (reason) => {
    if (runtimeState.suspended) return;

    navSeq++;
    const seq = navSeq;

    // 動画単位の状態はここでリセット（超重要）
    replayClickedForVideoId = "";
    chatViewTries = 0;
    lastChatViewPickAt = 0;

    stopWordMuteComments({ restore: false });
    stopWordMuteChat({ restore: false });

    // いま pin / pick が走ってるなら止めて、次のDOMでやり直す
    stopPickSecondChatView();
    stopPinChat();

    // playlistは再出現するので監視は動かし続ける（or 再起動）
    startPlaylistWatch();

    // すぐtryApplyすると負けやすいので少し待つ（YouTubeがDOMを差し替える）
    if (navReapplyTimer) clearTimeout(navReapplyTimer);
    navReapplyTimer = setTimeout(() => {
      navReapplyTimer = 0;
      if (!applied) return;
      if (seq !== navSeq) return;

      // 1回だけ再適用を試して、300ms後に再度呼ぶ
      if (tryApplyOnce()) {
        syncTabsByContext();

        // active=chat なら pin 追随を確実に起動
        if (runtimeState.activePanel === "chat") startPinChat();

        setTimeout(() => {
          if (applied) syncTabsByContext();
        }, 300);

        return;
      }

      // まだ揃ってないなら、短命bootWatchを“この遷移世代”で再開
      stopBootWatch();
      bootObserver = new MutationObserver(() => {
        if (!applied) return;
        if (seq !== navSeq) return;
        if (tryApplyOnce()) stopBootWatch();
      });
      bootObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      bootTimer = setTimeout(() => {
        if (seq === navSeq) {
          stopBootWatch();

          if (!applied) return;
          if (runtimeState.suspended) return;

          // DOMが遅れて揃ったときのためのゲート
          startReadyGate("boot-timeout");
        }
      }, 5000);
    }, 80);
  };

  // ------------------------------------------------------------
  // UI: active panel / tab
  // ------------------------------------------------------------
  // runtimeState と UI の active を同期し、chatタブだけ pin を開始する。
  // CSS側制御のため dataset.yclhActive もここで更新する。
  const isChatAutoRecommended = () => settings.chatAutoMode !== "default";

  const applyActive = (name) => {
    runtimeState.activePanel = name;
    setActivePanel(name);
    setActiveTab(name);

    if (name === "chat") {
      startPinChat();

      if (isChatAutoRecommended()) {
        startChatAutoChase();
      } else {
        stopPickSecondChatView();
        stopChatAutoChase();
      }

      document.documentElement.dataset.yclhActive = name;
    } else {
      stopPickSecondChatView();
      stopChatAutoChase();
      stopPinChat();
      delete document.documentElement.dataset.yclhActive;
    }
  };

  // ------------------------------------------------------------
  // tab gating: context
  // ------------------------------------------------------------
  const isPlaylistCheck = () => {
    try {
      return new URL(location.href).searchParams.has("list");
    } catch {
      return false;
    }
  };

  const getPlayerResponse = () => {
    return (
      window.ytInitialPlayerResponse ||
      window.ytcfg?.get?.("PLAYER_RESPONSE") ||
      window.ytcfg?.data_?.PLAYER_RESPONSE ||
      null
    );
  };

  const getLiveBroadcastDetails = () => {
    const pr = getPlayerResponse();
    return (
      pr?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails || null
    );
  };

  const isLiveFact = () => {
    const flexy = document.querySelector("ytd-watch-flexy");
    const pr = getPlayerResponse();
    const liveDetails = getLiveBroadcastDetails();

    if (liveDetails?.isLiveNow === true) return true;

    if (pr?.videoDetails?.isLiveContent === true) {
      if (document.querySelector(".ytp-live-badge")) return true;
      if (document.querySelector("ytd-live-chat-frame, yt-live-chat-renderer"))
        return true;
    }

    if (document.querySelector("ytd-live-chat-frame, yt-live-chat-renderer"))
      return true;

    if (
      flexy &&
      (flexy.isLiveContent === true || flexy.hasAttribute("is-live-content"))
    )
      return true;

    return false;
  };

  const hasReplayEntryUi = () => {
    const scope =
      document.querySelector("#secondary") ||
      document.querySelector("ytd-watch-flexy") ||
      document;

    const btns = scope.querySelectorAll("button, a, tp-yt-paper-button");

    for (const el of btns) {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();
      const tip = (el.getAttribute("data-tooltip-text") || "").toLowerCase();
      const text = (el.textContent || "").trim();

      if (
        aria.includes("replay") ||
        title.includes("replay") ||
        tip.includes("replay")
      )
        return true;

      if (text.includes("チャットのリプレイ")) return true;
    }
    return false;
  };

  const isReplayFact = () => {
    const pr = getPlayerResponse();
    const liveDetails = getLiveBroadcastDetails();

    if (
      document.querySelector("ytd-live-chat-replay-renderer") ||
      document.querySelector('iframe[src*="live_chat_replay"]')
    ) {
      return true;
    }

    if (
      pr?.videoDetails?.isLiveContent === true &&
      liveDetails &&
      liveDetails.isLiveNow === false
    ) {
      return true;
    }

    if (hasReplayEntryUi()) return true;

    return false;
  };

  const detectContext = () => {
    const playlist = isPlaylistCheck();
    const liveFact = isLiveFact();
    const replayFact = isReplayFact();

    if (!liveFact && !replayFact)
      return { kind: "normal", playlist, hasChat: false };

    if (liveFact && !replayFact)
      return { kind: "live", playlist: false, hasChat: true };

    // replay
    return { kind: "replay", playlist, hasChat: true };
  };

  // live / replay は chat を初期選択タブとする
  const getDefaultPanelByContext = (ctx) => {
    if (ctx.kind === "live" || ctx.kind === "replay") return "chat";
    return "comments";
  };

  // タブの出し分け
  let lastCtxSig = "";
  const syncTabsByContext = () => {
    if (!applied) return;

    // tabs がまだ生成されていない場合は何もしない
    // related は常に存在する前提なので existence check に使う
    if (!hasTabButton("related")) return;

    const ctx = detectContext();
    const sig = `${ctx.kind}|pl:${ctx.playlist ? 1 : 0}`;

    if (sig === lastCtxSig) return;
    lastCtxSig = sig;

    const preferred = getDefaultPanelByContext(ctx);
    let active = runtimeState.activePanel || preferred;

    if (
      isChatAutoRecommended() &&
      (ctx.kind === "live" || ctx.kind === "replay") &&
      active !== "chat"
    ) {
      applyActive("chat");
      active = "chat";
    }

    // 全消し
    setTabVisible("comments", false);
    setTabVisible("related", false);
    setTabVisible("playlist", false);
    setTabVisible("chat", false);

    setTabEnabled("comments", false);
    setTabEnabled("related", false);
    setTabEnabled("playlist", false);
    setTabEnabled("chat", false);

    // related は常に
    setTabVisible("related", true);
    setTabEnabled("related", true);

    if (ctx.kind === "normal") {
      setTabVisible("comments", true);
      setTabEnabled("comments", true);

      if (ctx.playlist) {
        setTabVisible("playlist", true);
        setTabEnabled("playlist", true);
      }
    } else if (ctx.kind === "live") {
      setTabVisible("chat", true);
      setTabEnabled("chat", true);
    } else {
      // replay
      setTabVisible("comments", true);
      setTabEnabled("comments", true);

      if (ctx.playlist) {
        setTabVisible("playlist", true);
        setTabEnabled("playlist", true);
      }

      setTabVisible("chat", true);
      setTabEnabled("chat", true);
    }

    // activeが死んだらフォールバック（ここだけ今回の構造に合わせる）
    const activeFinal = runtimeState.activePanel || preferred;
    const activeOk =
      (activeFinal === "comments" &&
        (ctx.kind === "normal" || ctx.kind === "replay")) ||
      activeFinal === "related" ||
      (activeFinal === "playlist" && ctx.playlist) ||
      (activeFinal === "chat" && ctx.hasChat);

    if (!activeOk) applyActive(preferred);
  };

  // ------------------------------------------------------------
  // navigation detectors
  // ------------------------------------------------------------
  let flexyObserver = null;

  const checkUrlChanged = (reason) => {
    const url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;

    bumpNav(reason);
  };

  // ------------------------------------------------------------
  // double-injection guard (global)
  // ------------------------------------------------------------
  // content script が何かの事情で二重に走った場合に、history hook が二重化しないようにする。
  const GLOBAL_KEY = "__yclhV2OrcGlobal";
  const g = (window[GLOBAL_KEY] ||= {
    navInstalled: false,
    cleanupNav: null,
    origPush: null,
    origReplace: null,
  });

  const installNavDetectors = () => {
    if (g.navInstalled) return;
    g.navInstalled = true;

    // --- History hook (pushState/replaceState) ---
    g.origPush = history.pushState;
    g.origReplace = history.replaceState;

    const wrappedPush = function (...args) {
      const r = g.origPush.apply(this, args);
      checkUrlChanged("pushState");
      return r;
    };
    const wrappedReplace = function (...args) {
      const r = g.origReplace.apply(this, args);
      checkUrlChanged("replaceState");
      return r;
    };

    history.pushState = wrappedPush;
    history.replaceState = wrappedReplace;

    const onPop = () => checkUrlChanged("popstate");
    const onYtStart = () => checkUrlChanged("yt-navigate-start");
    const onYtFinish = () => checkUrlChanged("yt-navigate-finish");
    const onPageUpdated = () => checkUrlChanged("yt-page-data-updated");

    window.addEventListener("popstate", onPop, true);
    window.addEventListener("yt-navigate-start", onYtStart, true);
    window.addEventListener("yt-navigate-finish", onYtFinish, true);
    window.addEventListener("yt-page-data-updated", onPageUpdated, true);

    // --- Backup: watch flexy の video-id 変化 ---
    const startFlexyWatch = () => {
      if (flexyObserver) return;

      const flexy = document.querySelector("ytd-watch-flexy");
      if (!flexy) return;

      let lastVid = flexy.getAttribute("video-id") || "";

      flexyObserver = new MutationObserver(() => {
        const vid = flexy.getAttribute("video-id") || "";
        if (vid && vid !== lastVid) {
          lastVid = vid;
          bumpNav("flexy-video-id");
        }
      });

      flexyObserver.observe(flexy, {
        attributes: true,
        attributeFilter: ["video-id"],
      });
    };

    const flexyBoot = new MutationObserver(() => startFlexyWatch());
    flexyBoot.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    const flexyBootTimer = setTimeout(() => flexyBoot.disconnect(), 6000);
    startFlexyWatch();

    // cleanup（hard restore で戻す用）
    g.cleanupNav = () => {
      try {
        history.pushState = g.origPush;
        history.replaceState = g.origReplace;
      } catch {}

      window.removeEventListener("popstate", onPop, true);
      window.removeEventListener("yt-navigate-start", onYtStart, true);
      window.removeEventListener("yt-navigate-finish", onYtFinish, true);
      window.removeEventListener("yt-page-data-updated", onPageUpdated, true);

      try {
        flexyBoot.disconnect();
      } catch {}
      clearTimeout(flexyBootTimer);

      if (flexyObserver) {
        try {
          flexyObserver.disconnect();
        } catch {}
        flexyObserver = null;
      }

      g.navInstalled = false;
      g.cleanupNav = null;
      g.origPush = null;
      g.origReplace = null;
    };
  };

  // ------------------------------------------------------------
  // playlist: docking + watch
  // ------------------------------------------------------------
  // playlist が遅れて出現することがあるので、存在したら panel に吸い込む。
  // rememberPlaylistOriginal が “元位置記録” も兼ねる。
  const dockPlaylistIfExists = () => {
    const panelPlaylist = getPanelPlaylist();
    if (!panelPlaylist) return false;

    const playlist = rememberPlaylistOriginal(original);
    if (!playlist) return false;

    if (playlist.parentElement !== panelPlaylist) {
      panelPlaylist.appendChild(playlist);
    }
    return true;
  };

  // playlist の遅延生成を MutationObserver で拾い、吸い込み完了したら監視を止める。
  // 監視範囲は #playlist 周辺（なければ #secondary / document）で軽量化する。
  let playlistObserver = null;
  const startPlaylistWatch = () => {
    if (playlistObserver) return;

    playlistObserver = new MutationObserver(() => {
      if (!applied) return;
      if (dockPlaylistIfExists()) {
        playlistObserver.disconnect();
        playlistObserver = null;

        syncTabsByContext();
      }
    });

    const root =
      document.querySelector("#playlist") ||
      document.querySelector("#secondary") ||
      document.documentElement;

    playlistObserver.observe(root, { childList: true, subtree: true });
  };

  // playlist監視を明示的に停止する（restore 時に必ず呼ぶ）。
  // これを忘れると SPA 遷移で監視が残り続ける。
  const stopPlaylistWatch = () => {
    if (!playlistObserver) return;
    playlistObserver.disconnect();
    playlistObserver = null;
  };

  // ------------------------------------------------------------
  // chat: pinned overlay (DOMは動かさない)
  // ------------------------------------------------------------
  // chat に関する timer を止める（現状は保険の残骸として保持）。
  // 使わなくても副作用はないので “処理を変えず” そのまま残す。
  let chatDockTimer = 0;
  const stopChatDocking = () => {
    if (chatDockTimer) {
      clearTimeout(chatDockTimer);
      chatDockTimer = 0;
    }
  };

  // chat-container を取得する（YouTube の配置ゆらぎを吸収する簡易getter）。
  // panelへ移動させず、overlay対象として掴むだけ。
  const getChatEl = () =>
    document.querySelector("ytd-watch-flexy #chat-container") ||
    document.querySelector("#chat-container");

  // panelChat の rect に合わせて chat-container を fixed で重ねる。
  // chat は iframe を含むので “display:none” などは避ける前提。
  const applyPin = () => {
    const chat = getChatEl();
    const panelChat = getPanelChat();
    if (!chat || !panelChat) return false;

    const r = panelChat.getBoundingClientRect();

    chat.style.position = "fixed";
    chat.style.left = `${r.left}px`;
    chat.style.top = `${r.top}px`;
    chat.style.width = `${r.width}px`;
    chat.style.height = `${r.height}px`;
    chat.style.margin = "0";
    chat.style.zIndex = "2147483647";
    chat.style.display = "block";

    chat.style.maxWidth = "none";
    chat.style.maxHeight = "none";

    return true;
  };

  // chat の pin を開始する（rAF / ResizeObserver / scroll-resize で追随）。
  // “DOMを動かさず” 見た目だけ panel 上に載せるのが狙い。
  let chatPinned = false;
  let pinRO = null;
  let pinOnScroll = null;
  let pinOnResize = null;
  let pinTimer = 0;

  const throttle = (fn, wait = 80) => {
    let t = 0;
    let pending = false;
    return () => {
      if (!chatPinned) return;
      const now = Date.now();
      if (now - t >= wait) {
        t = now;
        fn();
        return;
      }
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        if (!chatPinned) return;
        t = Date.now();
        fn();
      }, wait);
    };
  };

  const startPinChat = () => {
    if (chatPinned) return;
    chatPinned = true;

    const panelChat = getPanelChat();
    if (panelChat && !pinRO) {
      pinRO = new ResizeObserver(() => applyPin());
      pinRO.observe(panelChat);
    }

    const onMove = throttle(() => applyPin(), 80);
    pinOnScroll = onMove;
    pinOnResize = onMove;

    window.addEventListener("scroll", pinOnScroll, true);
    window.addEventListener("resize", pinOnResize, true);
    window.visualViewport?.addEventListener?.("resize", pinOnResize, true);

    // 保険：DOMが微妙に動くケース（ヘッダー展開など）対策
    pinTimer = setInterval(() => applyPin(), 900);

    applyPin();
  };

  // chat の pin を停止し、chat-container に付けた inline style を元に戻す。
  // overlayを止めて通常レイアウトに戻す（DOMは動かさない）。
  const stopPinChat = () => {
    if (!chatPinned) return;
    chatPinned = false;

    if (pinRO) {
      pinRO.disconnect();
      pinRO = null;
    }
    if (pinOnScroll) {
      window.removeEventListener("scroll", pinOnScroll, true);
      pinOnScroll = null;
    }
    if (pinOnResize) {
      window.removeEventListener("resize", pinOnResize, true);
      window.visualViewport?.removeEventListener?.("resize", pinOnResize, true);
      pinOnResize = null;
    }
    if (pinTimer) {
      clearInterval(pinTimer);
      pinTimer = 0;
    }

    const chat = getChatEl();
    if (chat) {
      chat.style.position = "";
      chat.style.left = "";
      chat.style.top = "";
      chat.style.width = "";
      chat.style.height = "";
      chat.style.margin = "";
      chat.style.zIndex = "";
      chat.style.display = "";
      chat.style.maxWidth = "";
      chat.style.maxHeight = "";
    }
  };

  // ------------------------------------------------------------
  // moveLeft sync
  // ------------------------------------------------------------
  // enabled中の html dataset を更新し、CSS側の moveLeft を切り替える。
  const applyMoveLeftFlags = () => {
    if (settings.moveLeft) {
      document.documentElement.dataset.yclhLeft = "1";
    } else {
      delete document.documentElement.dataset.yclhLeft;
    }
  };

  // 設定変更（moveLeft）を、有効化中だけ即時反映する。
  // restore後に触らないよう applied でガードする。
  const syncMoveLeft = () => {
    if (!applied) return;
    applyMoveLeftFlags();
  };

  // ------------------------------------------------------------
  // chatAutoMode sync
  // ------------------------------------------------------------
  const getChatFrame = () => document.querySelector("#chatframe");

  const canTouchChat = () => {
    // iframe (#chatframe) がいる、または chat-container がいる
    return !!getChatFrame() || !!getChatEl();
  };

  const syncChatAutoMode = () => {
    if (!applied) return;
    if (runtimeState.suspended) return;

    // チャットがまだ無いなら何もしない（タブを開いたら発火する）
    if (!canTouchChat()) return;

    if (isChatAutoRecommended()) {
      clickReplayOnceOnChatTab?.();
      startPickSecondChatView();
    } else {
      stopPickSecondChatView();
      pickFirstChatViewOnce?.();
    }
  };

  // ------------------------------------------------------------
  // wordMute sync
  // ------------------------------------------------------------
  const syncWordMute = () => {
    if (!applied) return;
    if (runtimeState.suspended) return;

    // いったん再判定（ルール0なら復元される）
    applyWordMuteOnCommentsOnce();
    applyWordMuteOnChatOnce();

    // chat の observer は includeChat のON/OFFで切り替え
    const { includeChat } = buildWordMuteMatchers();

    if (includeChat) startWordMuteChat();
    else stopWordMuteChat({ restore: true });
  };

  const waitFor = (predicate, { timeout = 5000, interval = 100 } = {}) =>
    new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (predicate()) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(tick, interval);
      };
      tick();
    });

  const hasCommentText = (root = document) =>
    root.querySelector(
      "ytd-comment-renderer #content-text, ytd-comment-view-model #content-text",
    );

  const waitForCommentsReady = async ({ timeout = 7000 } = {}) => {
    // まずDOM上に comments の器が生えたか
    await waitFor(() => document.querySelector("ytd-comments#comments"), {
      timeout,
      interval: 100,
    });
    // 次に本文が1個でも出たか
    return await waitFor(() => !!hasCommentText(), { timeout, interval: 100 });
  };

  // ------------------------------------------------------------
  // replay auto open: "click as last resort"
  // ------------------------------------------------------------
  const getVideoId = () => new URL(location.href).searchParams.get("v") || "";

  const findChatReplayButton = () => {
    const root =
      document.querySelector("ytd-watch-flexy #chat-container") ||
      document.querySelector("#chat-container") ||
      document;

    const candidates = root.querySelectorAll(
      "button, yt-button-renderer, tp-yt-paper-button, ytd-button-renderer",
    );

    return (
      Array.from(candidates).find((el) => {
        const text = (el.textContent || "").trim();
        const aria = (el.getAttribute?.("aria-label") || "").trim();
        return (
          /チャットのリプレイ|Chat replay/i.test(text) ||
          /チャットのリプレイ|Chat replay/i.test(aria)
        );
      }) || null
    );
  };

  // 1回だけ押す（見つかったら押す／見つからなければ何もしない）
  const clickReplayOnceOnChatTab = () => {
    const vid = getVideoId();
    if (!vid) return false;

    // 同じ動画では1回だけ
    if (replayClickedForVideoId === vid) return false;

    const el = findChatReplayButton();
    if (!el) return false;

    // 内側buttonがあればそれを押す（renderer系対策）
    const btn = el.querySelector?.("button") || el;
    btn.click();

    replayClickedForVideoId = vid;
    return true;
  };

  // ------------------------------------------------------------
  // chat view dropdown: open label -> pick item
  // ------------------------------------------------------------
  let chatViewTimer = 0;
  let chatViewTries = 0;
  let lastChatViewPickAt = 0;

  const CHAT_VIEW_CLICK_COOLDOWN_MS = 1500;
  const CHAT_VIEW_MAX_TRIES = 10;

  const getChatDoc = () => {
    const iframe = getChatFrame();
    if (!iframe) return null;
    try {
      return iframe.contentDocument || null;
    } catch {
      return null;
    }
  };

  const getChatWin = () => {
    const iframe = getChatFrame();
    if (!iframe) return null;
    try {
      return iframe.contentWindow || null;
    } catch {
      return null;
    }
  };

  const isVisible = (el) => {
    if (!el) return false;
    if (el.closest?.('[hidden], [aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect?.();
    return !r || (r.width > 0 && r.height > 0);
  };

  const dispatchClickInFrame = (win, el) => {
    if (!win || !el) return false;
    const opt = { bubbles: true, cancelable: true, composed: true, view: win };
    el.dispatchEvent(new win.MouseEvent("pointerdown", opt));
    el.dispatchEvent(new win.MouseEvent("mousedown", opt));
    el.dispatchEvent(new win.MouseEvent("mouseup", opt));
    el.dispatchEvent(new win.MouseEvent("click", opt));
    return true;
  };

  const getLabelTextInFrame = (doc) => {
    const label = doc?.querySelector(
      "#live-chat-view-selector-sub-menu yt-dropdown-menu #label-text",
    );
    return (label?.textContent || "").trim();
  };

  const findTriggerInFrame = (doc) => {
    return (
      doc?.querySelector(
        "#live-chat-view-selector-sub-menu yt-dropdown-menu tp-yt-paper-button#label",
      ) ||
      doc?.querySelector(
        "#live-chat-view-selector-sub-menu yt-dropdown-menu #label",
      ) ||
      null
    );
  };

  const findVisibleMenuInFrame = (doc) => {
    const menus = Array.from(
      doc?.querySelectorAll("tp-yt-paper-listbox#menu") || [],
    );
    const visible = menus.filter((m) => isVisible(m));
    if (visible.length) return visible[visible.length - 1];

    return (
      doc?.querySelector(
        "#live-chat-view-selector-sub-menu tp-yt-paper-listbox#menu",
      ) || null
    );
  };

  // 2番目(=index 1)を選択
  const clickSecondItemInMenu = (win, menu) => {
    if (!win || !menu) return false;

    const links = Array.from(menu.querySelectorAll("a.yt-simple-endpoint"));
    if (links.length < 2) return false;

    const second = links[1];
    return dispatchClickInFrame(win, second);
  };

  const pickSecondChatViewOnce = () => {
    const doc = getChatDoc();
    const win = getChatWin();
    if (!doc || !win) return false;

    const label = getLabelTextInFrame(doc);
    if (label === "チャット" || label === "チャットのリプレイ") return true;

    const trigger = findTriggerInFrame(doc);
    if (!trigger) return false;

    const now = Date.now();
    if (now - lastChatViewPickAt < CHAT_VIEW_CLICK_COOLDOWN_MS) return false;
    lastChatViewPickAt = now;

    dispatchClickInFrame(win, trigger);

    let innerTries = 0;
    const tick = () => {
      innerTries++;
      const menu = findVisibleMenuInFrame(doc);
      if (menu && clickSecondItemInMenu(win, menu)) return;
      if (innerTries < 6) setTimeout(tick, 120);
    };
    setTimeout(tick, 120);

    return true;
  };

  // 1番目(=index 0)を選択
  const clickNthItemInMenu = (win, menu, n) => {
    if (!win || !menu) return false;

    const links = Array.from(menu.querySelectorAll("a.yt-simple-endpoint"));
    if (links.length <= n) return false;

    return dispatchClickInFrame(win, links[n]);
  };

  const pickFirstChatViewOnce = () => {
    const doc = getChatDoc();
    const win = getChatWin();
    if (!doc || !win) return false;

    const trigger = findTriggerInFrame(doc);
    if (!trigger) return false;

    const now = Date.now();
    if (now - lastChatViewPickAt < CHAT_VIEW_CLICK_COOLDOWN_MS) return false;
    lastChatViewPickAt = now;

    dispatchClickInFrame(win, trigger);

    let innerTries = 0;
    const tick = () => {
      innerTries++;
      const menu = findVisibleMenuInFrame(doc);
      if (menu && clickNthItemInMenu(win, menu, 0)) return; // 先頭
      if (innerTries < 6) setTimeout(tick, 120);
    };
    setTimeout(tick, 120);

    return true;
  };

  const startPickSecondChatView = () => {
    if (chatViewTimer) return;
    chatViewTries = 0;

    const tick = () => {
      chatViewTimer = 0;
      if (!applied) return;

      chatViewTries++;

      if (pickSecondChatViewOnce()) return;

      if (chatViewTries < CHAT_VIEW_MAX_TRIES) {
        chatViewTimer = setTimeout(tick, 200);
      }
    };

    chatViewTimer = setTimeout(tick, 350);
  };

  const stopPickSecondChatView = () => {
    if (chatViewTimer) {
      clearTimeout(chatViewTimer);
      chatViewTimer = 0;
    }
  };

  // ------------------------------------------------------------
  // chat auto: delayed chase (short-lived)
  // ------------------------------------------------------------
  let chatChaseObserver = null;
  let chatChaseTimer = 0;
  let chatChaseStopTimer = 0;
  let chatFrameLoadBound = false;

  const startChatAutoChase = () => {
    if (!applied) return;
    if (runtimeState.suspended) return;
    if (!isChatAutoRecommended()) return;
    if (runtimeState.activePanel !== "chat") return;

    // まず即1回（今の挙動）
    clickReplayOnceOnChatTab?.();
    startPickSecondChatView();

    // 既に動いてるなら二重起動しない
    if (chatChaseObserver || chatChaseTimer) return;

    const kick = () => {
      if (!applied) return stopChatAutoChase();
      if (runtimeState.suspended) return stopChatAutoChase();
      if (!isChatAutoRecommended()) return stopChatAutoChase();
      if (runtimeState.activePanel !== "chat") return stopChatAutoChase();

      clickReplayOnceOnChatTab?.();
      startPickSecondChatView();
    };

    // 1) chatframe を見つけたら iframe load を付ける
    const bindFrameLoad = () => {
      const iframe = getChatFrame?.();
      if (!iframe || chatFrameLoadBound) return;

      chatFrameLoadBound = true;
      iframe.addEventListener(
        "load",
        () => {
          // load は “刺さる” のでここで確実に追撃
          kick();
        },
        { passive: true },
      );
    };

    bindFrameLoad();

    // 2) chatframe / chat-container の出現を短命監視
    chatChaseObserver = new MutationObserver(() => {
      bindFrameLoad();
      // chat DOM が生えたタイミングで追撃
      if (getChatFrame?.() || getChatEl?.()) kick();
    });

    chatChaseObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 3) 保険の低頻度追撃（軽め・短命）
    chatChaseTimer = setInterval(() => kick(), 900);

    // 4) 永久監視はしない（短命で止める）
    chatChaseStopTimer = setTimeout(() => stopChatAutoChase(), 6000);
  };

  const stopChatAutoChase = () => {
    if (chatChaseObserver) {
      chatChaseObserver.disconnect();
      chatChaseObserver = null;
    }
    if (chatChaseTimer) {
      clearInterval(chatChaseTimer);
      chatChaseTimer = 0;
    }
    if (chatChaseStopTimer) {
      clearTimeout(chatChaseStopTimer);
      chatChaseStopTimer = 0;
    }
    chatFrameLoadBound = false;
  };

  // ------------------------------------------------------------
  // word mute
  // ------------------------------------------------------------
  const WORD_MUTE_PRESET_TEXT = {
    default: "ミュートワードが含まれています",
    nyan: "にゃーん",
  };

  const buildWordMuteMatchers = () => {
    const wm = settings.wordMute || {};
    const items = Array.isArray(wm.items) ? wm.items : [];

    const rules = items
      .map((x) => ({
        exact: !!x?.exact,
        word: (x?.word || "").trim(),
      }))
      .filter((x) => x.word.length > 0);

    const presetKey = wm.preset === "nyan" ? "nyan" : "default";
    const replaceText = WORD_MUTE_PRESET_TEXT[presetKey];

    const includeChat = wm.includeChat === true;

    const isHit = (text) => {
      const t = (text || "").trim();
      if (!t) return false;
      for (const r of rules) {
        if (r.exact) {
          if (t === r.word) return true;
        } else {
          if (t.includes(r.word)) return true;
        }
      }
      return false;
    };

    return { rules, replaceText, includeChat, isHit };
  };

  const applyWordMuteToTextNode = (el, isHit, replaceText) => {
    if (!el) return;

    // 原文DOMを退避/更新
    // YouTubeが後から本文DOMを書き換えることがあるので、
    // 「非ミュート状態」のときだけスナップショット更新を許可する
    const isMutedNow = el.dataset.yclhMuted === "1";
    const currentText = el.textContent ?? "";

    if (!el.__yclhMuteOrigNodes) {
      // 初回スナップショット
      el.__yclhMuteOrigText = currentText;
      el.__yclhMuteOrigNodes = Array.from(el.childNodes).map((n) =>
        n.cloneNode(true),
      );
    } else if (!isMutedNow) {
      // 非ミュート中に本文が変わったなら、原文として更新
      if (el.__yclhMuteOrigText !== currentText) {
        el.__yclhMuteOrigText = currentText;
        el.__yclhMuteOrigNodes = Array.from(el.childNodes).map((n) =>
          n.cloneNode(true),
        );
      }
    }

    // 判定は「必ず原文」に対して行う
    const baseText = el.__yclhMuteOrigText ?? el.textContent ?? "";
    const hit = isHit(baseText);

    if (hit) {
      el.textContent = replaceText;
      el.classList.add("yclh-mute-hit");
      el.dataset.yclhMuted = "1";
    } else {
      // 以前ミュートしていたが、条件が変わった場合の復元
      if (el.dataset.yclhMuted === "1") {
        if (el.__yclhMuteOrigNodes) {
          el.textContent = "";
          for (const n of el.__yclhMuteOrigNodes) {
            el.appendChild(n.cloneNode(true));
          }
        }
      }
      el.classList.remove("yclh-mute-hit");
      delete el.dataset.yclhMuted;

      // origNodes は「次回またミュートする」ために残してOK
    }
  };

  const restoreWordMuteForScope = (root) => {
    if (!root) return;
    // dataset だけでは「origNodes持ってる要素」を拾えないので、
    // 今回は muted マークのある要素を対象に復元する（origNodes があればDOM復元できる）
    const els = root.querySelectorAll?.("[data-yclh-muted], .yclh-mute-hit");
    els?.forEach((el) => {
      if (el.__yclhMuteOrigNodes) {
        el.textContent = "";
        for (const n of el.__yclhMuteOrigNodes) {
          el.appendChild(n.cloneNode(true));
        }
      }

      el.classList.remove("yclh-mute-hit");
      delete el.dataset.yclhMuted;
      // origNodes は残してOK（再ミュート時に再退避不要）
    });
  };

  const getCommentTextEls = (root) =>
    root?.querySelectorAll?.(
      "ytd-comment-renderer #content-text, ytd-comment-view-model #content-text",
    ) || [];

  const getCommentsScopes = () => {
    // 初回ロード直後は「panel」と「オリジナル位置」でツリーが揺れることがあるので、
    // 複数候補を全部スキャンする（重複は後で排除）
    const panel = getPanelComments?.() || null;
    const orig = original.commentsEl || null;
    const yt = document.querySelector("ytd-comments#comments") || null;
    const secondary = document.querySelector("#secondary") || null;

    // null除去 & 重複排除（参照同一のとき）
    const arr = [panel, yt, orig, secondary].filter(Boolean);
    return Array.from(new Set(arr));
  };

  const applyWordMuteOnCommentsOnce = () => {
    const scopes = getCommentsScopes();
    if (!scopes.length) return false;

    const { rules, replaceText, isHit } = buildWordMuteMatchers();

    if (rules.length === 0) {
      for (const scope of scopes) restoreWordMuteForScope(scope);
      return true;
    }

    // 要素自体は document 全体で同一参照なので、二重適用しないようにSetで排除
    const seen = new Set();
    for (const scope of scopes) {
      for (const el of getCommentTextEls(scope)) {
        if (seen.has(el)) continue;
        seen.add(el);
        applyWordMuteToTextNode(el, isHit, replaceText);
      }
    }
    return true;
  };

  let wordMuteCommentsWarmupTimer = 0;

  const startWordMuteComments = () => {
    // observer が既にいても、初回ロードの warmup（短命）は回したい
    const alreadyObserving = !!wordMuteCommentsObserver;

    const stopBoot = () => {
      if (wordMuteCommentsBootObserver) {
        wordMuteCommentsBootObserver.disconnect();
        wordMuteCommentsBootObserver = null;
      }
      if (wordMuteCommentsBootTimer) {
        clearTimeout(wordMuteCommentsBootTimer);
        wordMuteCommentsBootTimer = 0;
      }
    };

    // まず一回適用（存在していれば）
    applyWordMuteOnCommentsOnce();

    // 初回ロード保険：しばらくポーリング（observerが拾えない/初期DOMが揺れる保険）
    if (!wordMuteCommentsWarmupTimer) {
      const startedAt = Date.now();
      const MAX_MS = 9000;
      let lastCount = -1;
      let stableHits = 0;
      let lastSig = "";
      let sigStableHits = 0;

      const getWordMuteSig = () => {
        const wm = settings.wordMute || {};
        const items = Array.isArray(wm.items) ? wm.items : [];
        const rules = items
          .map((x) => ({
            exact: !!x?.exact,
            word: (x?.word || "").trim(),
          }))
          .filter((x) => x.word.length > 0)
          // 順序が変わっても同一扱いにしたいなら sort（任意）
          .sort((a, b) => (a.word + a.exact).localeCompare(b.word + b.exact));

        return [
          wm.preset === "nyan" ? "nyan" : "default",
          wm.includeChat === true ? "C1" : "C0",
          ...rules.map((r) => (r.exact ? "E:" : "P:") + r.word),
        ].join("|");
      };

      const countAll = (scopes) => {
        const seen = new Set();
        let n = 0;
        for (const s of scopes) {
          for (const el of getCommentTextEls(s)) {
            if (seen.has(el)) continue;
            seen.add(el);
            n++;
          }
        }
        return n;
      };

      const tick = () => {
        wordMuteCommentsWarmupTimer = 0;
        if (!applied) return;
        if (runtimeState.suspended) return;

        // 毎回スキャン（初回はとにかく “揃うまで殴る”）
        applyWordMuteOnCommentsOnce();

        // ルールの安定チェック（後から items が確定するケース対策）
        const sig = getWordMuteSig();
        if (sig === lastSig) sigStableHits++;
        else {
          lastSig = sig;
          sigStableHits = 0;
          // ルールが変わったら count 安定判定もリセット（再ロード扱い）
          lastCount = -1;
          stableHits = 0;
        }

        const scopes = getCommentsScopes();
        if (scopes.length) {
          const count = countAll(scopes);
          if (count === lastCount) stableHits++;
          else stableHits = 0;
          lastCount = count;

          // DOMもルールも安定したら warmup 終了
          if (stableHits >= 3 && sigStableHits >= 3 && count > 0) return;
        }

        if (Date.now() - startedAt < MAX_MS) {
          wordMuteCommentsWarmupTimer = setTimeout(tick, 250);
        }
      };

      wordMuteCommentsWarmupTimer = setTimeout(tick, 250);
    }

    const getStableCommentsRoot = () =>
      document.querySelector("ytd-comments#comments") ||
      document.querySelector("ytd-item-section-renderer#sections") ||
      document.querySelector("#comment-items") ||
      getPanelComments?.() ||
      document.querySelector("#secondary") ||
      null;

    const tryAttach = () => {
      if (alreadyObserving) return true; // 監視は既に張ってある前提
      const stableRoot = getStableCommentsRoot();
      if (!stableRoot) return false;

      // 初回適用
      applyWordMuteOnCommentsOnce();

      // 本監視
      let wmCommentsDebounce = 0;

      wordMuteCommentsObserver = new MutationObserver(() => {
        if (!applied) return;
        if (runtimeState.suspended) return;
        if (wmCommentsDebounce) return;
        wmCommentsDebounce = setTimeout(() => {
          wmCommentsDebounce = 0;
          applyWordMuteOnCommentsOnce();
        }, 200);
      });

      wordMuteCommentsObserver.observe(stableRoot, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      return true;
    };

    // まず即トライ
    if (tryAttach()) {
      stopBoot();
      return;
    }

    // comments がまだ無い → 短命で待つ（永久監視しない）
    if (wordMuteCommentsBootObserver) return;

    wordMuteCommentsBootObserver = new MutationObserver(() => {
      if (!applied) return;
      if (runtimeState.suspended) return;
      if (tryAttach()) stopBoot();
    });

    wordMuteCommentsBootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 8秒で諦める（軽量）
    wordMuteCommentsBootTimer = setTimeout(stopBoot, 8000);
  };

  const stopWordMuteComments = ({ restore = true } = {}) => {
    if (wordMuteCommentsObserver) {
      wordMuteCommentsObserver.disconnect();
      wordMuteCommentsObserver = null;
    }
    if (wordMuteCommentsBootObserver) {
      wordMuteCommentsBootObserver.disconnect();
      wordMuteCommentsBootObserver = null;
    }
    if (wordMuteCommentsBootTimer) {
      clearTimeout(wordMuteCommentsBootTimer);
      wordMuteCommentsBootTimer = 0;
    }
    if (wordMuteCommentsWarmupTimer) {
      clearTimeout(wordMuteCommentsWarmupTimer);
      wordMuteCommentsWarmupTimer = 0;
    }

    if (restore) {
      const commentsRoot = original.commentsEl;
      if (commentsRoot) restoreWordMuteForScope(commentsRoot);
    }
  };

  let wordMuteChatObserver = null;

  const getChatMessageTextEls = (doc) =>
    doc?.querySelectorAll?.(
      "yt-live-chat-text-message-renderer #message, yt-live-chat-paid-message-renderer #message",
    ) || [];

  const applyWordMuteOnChatOnce = () => {
    const doc = getChatDoc?.();
    if (!doc) return false;

    const { rules, replaceText, isHit, includeChat } = buildWordMuteMatchers();
    if (!includeChat) return true;

    if (rules.length === 0) {
      restoreWordMuteForScope(doc.documentElement);
      return true;
    }

    for (const el of getChatMessageTextEls(doc)) {
      applyWordMuteToTextNode(el, isHit, replaceText);
    }
    return true;
  };

  let wordMuteChatBootTimer = 0;

  const startWordMuteChat = () => {
    const { includeChat } = buildWordMuteMatchers();
    if (!includeChat) return;

    const doc = getChatDoc?.();
    if (!doc) {
      // chat iframe がまだなら短命リトライ
      if (wordMuteChatBootTimer) return;
      let tries = 0;
      const tick = () => {
        wordMuteChatBootTimer = 0;
        if (!applied) return;
        if (runtimeState.suspended) return;

        tries++;
        const d = getChatDoc?.();
        if (d) {
          startWordMuteChat(); // 今度は入る
          return;
        }
        if (tries < 20) wordMuteChatBootTimer = setTimeout(tick, 250);
      };
      wordMuteChatBootTimer = setTimeout(tick, 250);
      return;
    }

    applyWordMuteOnChatOnce();

    if (wordMuteChatObserver) return;
    wordMuteChatObserver = new MutationObserver(() => {
      if (!applied) return;
      if (runtimeState.suspended) return;
      applyWordMuteOnChatOnce();
    });

    wordMuteChatObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  const stopWordMuteChat = ({ restore = true } = {}) => {
    if (wordMuteChatBootTimer) {
      clearTimeout(wordMuteChatBootTimer);
      wordMuteChatBootTimer = 0;
    }
    if (wordMuteChatObserver) {
      wordMuteChatObserver.disconnect();
      wordMuteChatObserver = null;
    }
    if (restore) {
      const doc = getChatDoc?.();
      if (doc) restoreWordMuteForScope(doc.documentElement);
    }
  };

  // ------------------------------------------------------------
  // apply: one shot (DOMが揃ったらtrue)
  // ------------------------------------------------------------
  // layoutRoot / sideUI を構築し、comments/related/playlist を panel に移動する。
  // chat は触らず、active切替で pin する（＝初期化を壊さない）。
  const tryApplyOnce = () => {
    if (!canBuildLayoutRoot()) return false;

    const roots = ensureLayoutRoot();
    const side = roots?.side;
    if (!side) return false;

    ensureSideTabs(side, {
      onTabClick: (name) => {
        if (!applied) return;
        applyActive(name);
      },
    });
    ensureSidePanels(side);

    const panelComments = getPanelComments();
    const panelRelated = getPanelRelated();
    const panelPlaylist = getPanelPlaylist();
    const panelChat = getPanelChat();
    if (!panelComments || !panelRelated || !panelPlaylist || !panelChat) {
      return false;
    }

    // DOM移動の前にsigガード
    const sig = getApplySig();
    if (sig === lastAppliedSig) {
      // 既に同条件で適用済みなら、tabsの再同期だけ軽く
      syncTabsByContext();

      // sig同一でも moveLeft だけは毎回整合させる
      applyMoveLeftFlags();

      const ctx = detectContext();
      const active = runtimeState.activePanel || getDefaultPanelByContext(ctx);
      applyActive(active);

      // playlistも一応
      dockPlaylistIfExists();

      // 既に適用済み判定でも、word mute は起動/同期しておく
      startWordMuteComments();
      startWordMuteChat();
      applyWordMuteOnCommentsOnce();
      applyWordMuteOnChatOnce();

      return true;
    }

    const comments = rememberCommentsOriginal(original);
    const related = rememberRelatedOriginal(original);
    const playlist = rememberPlaylistOriginal(original);
    rememberChatOriginal(original);

    if (!comments && !related && !playlist) return false;

    lastAppliedSig = sig;

    waitForCommentsReady().then(() => {
      if (!applied || runtimeState.suspended) return;
      applyWordMuteOnCommentsOnce();
    });

    if (comments && comments.parentElement !== panelComments) {
      panelComments.appendChild(comments);
    }
    if (related && related.parentElement !== panelRelated) {
      panelRelated.appendChild(related);
    }
    if (playlist && playlist.parentElement !== panelPlaylist) {
      panelPlaylist.appendChild(playlist);
    }

    const ctx = detectContext();
    const initial = runtimeState.activePanel || getDefaultPanelByContext(ctx);
    applyActive(initial);

    syncTabsByContext();

    document.documentElement.dataset.yclh = "1";

    // soft restore からの復帰でも moveLeft を復元
    applyMoveLeftFlags();

    ensureCssInserted();

    startWordMuteComments();
    startWordMuteChat();

    sizing.start();

    dockPlaylistIfExists();

    applyWordMuteOnCommentsOnce();
    applyWordMuteOnChatOnce();
    setTimeout(() => {
      if (!applied || runtimeState.suspended) return;
      applyWordMuteOnCommentsOnce();
      applyWordMuteOnChatOnce();
    }, 800);

    return true;
  };

  // ------------------------------------------------------------
  // public: apply
  // ------------------------------------------------------------
  // 有効化のエントリ。まずwatch開始→tryApplyOnce、ダメなら短命boot監視でリトライ。
  // 永久監視にしないため 4秒で監視停止する。
  const apply = () => {
    if (applied) return;

    // 先に環境判定（まだappliedにしない）
    if (!settings.enabled) return;
    if (!isWatch()) return;
    if (isNarrowMode()) return;
    if (isTheaterMode()) return;

    applied = true;

    lastCtxSig = "";

    installNavDetectors();

    // popupに「enabledになった」反映を即出す（この直後 env 判定でsuspendになる可能性もある）
    publishRuntime();

    startEnvWatch();
    evaluateEnvAndSync("apply");
    if (runtimeState.suspended) return;

    // playlist は遅延生成/作り直しがあるため watch が必要。
    // 初回 apply で watch を開始し、SPA 遷移時は bumpNav 側で再起動（または起動保証）する。
    startPlaylistWatch();

    if (tryApplyOnce()) return;

    // まず gate も動かす（bootWatchが短命でも復帰できる）
    startReadyGate("apply-failed");

    stopBootWatch();

    bootObserver = new MutationObserver(() => {
      if (!applied) return;
      if (tryApplyOnce()) stopBootWatch();
    });

    bootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    bootTimer = setTimeout(() => {
      stopBootWatch();

      if (!applied) return;
      if (runtimeState.suspended) return;

      startReadyGate("apply-boot-timeout");
    }, 4000);
  };

  // ------------------------------------------------------------
  // public: restore
  // ------------------------------------------------------------
  // 無効化のエントリ。sizing停止→元位置復帰→UI/Root/CSS/flags/state を掃除する。
  // 監視やpinも必ず止め、次回applyが綺麗に動く状態に戻す。
  const restore = ({ hard = true } = {}) => {
    if (!applied) return;

    // hard: ユーザーOFF → 完全停止
    // soft: theater/narrow など → 「一時停止」なので applied は維持する
    if (hard) applied = false;

    stopReadyGate();
    stopBootWatch();

    // chat の overlay/pin を必ず解除
    stopPickSecondChatView();
    stopPinChat();
    stopChatDocking();

    // sizing停止
    sizing.stop();

    // word mute 停止 & 復元
    stopWordMuteComments({ restore: true });
    stopWordMuteChat({ restore: true });

    // 元位置へ（DOM構造）
    restoreCommentsOriginal(original);
    restoreRelatedOriginal(original);
    restorePlaylistOriginal(original);
    restoreChatOriginal(original);

    // UI / layout の破棄
    cleanupSideUi();
    cleanupLayoutRoot();

    // CSS / flags 掃除
    ensureCssRemoved();
    delete document.documentElement.dataset.yclh;
    delete document.documentElement.dataset.yclhLeft;
    delete document.documentElement.dataset.yclhActive;

    // soft/hard 共通：次回のタブ分岐は必ず再計算させたい
    lastCtxSig = "";
    lastAppliedSig = "";

    // hard だけ：動画単位の状態や退避参照を完全リセット
    if (hard) {
      g.cleanupNav?.();
      replayClickedForVideoId = "";
      resetOriginal();
      stopPlaylistWatch();
      stopEnvWatch();
    } else {
      stopPlaylistWatch();
    }

    // 最終状態をpopupへ
    publishRuntime();
  };

  return {
    apply,
    restore,
    syncMoveLeft,
    syncChatAutoMode,
    syncWordMute,
    publishRuntime,
  };
};
