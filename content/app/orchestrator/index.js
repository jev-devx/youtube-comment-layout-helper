import {
  settings,
  original,
  resetOriginal,
  runtimeState,
} from "../../shared/state.js";

import {
  rememberCommentsOriginal,
  restoreCommentsOriginal,
  rememberRelatedOriginal,
  restoreRelatedOriginal,
  rememberPlaylistOriginal,
  restorePlaylistOriginal,
  rememberChatOriginal,
  restoreChatOriginal,
} from "../dom/originals.js";

import {
  canBuildLayoutRoot,
  ensureLayoutRoot,
  cleanupLayoutRoot,
} from "../dom/layoutRoot.js";

import {
  ensureSideTabs,
  ensureSidePanels,
  getPanelComments,
  getPanelRelated,
  getPanelPlaylist,
  getPanelChat,
  setActivePanel,
  setActiveTab,
  cleanupSideUi,
  setTabEnabled,
  setTabVisible,
  hasTabButton,
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
  // tab gating: context (reuse old YCLH logic)
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
    if ((ctx.kind === "live" || ctx.kind === "replay") && active !== "chat") {
      applyActive("chat");
      active = "chat";
    }

    console.log("[YCLH] video type ->", ctx);

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

  // live / replay は chat を初期選択タブとする
  const getDefaultPanelByContext = (ctx) => {
    if (ctx.kind === "live" || ctx.kind === "replay") return "chat";
    return "comments";
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
  // UI: active panel / tab
  // ------------------------------------------------------------
  // runtimeState と UI の active を同期し、chatタブだけ pin を開始する。
  // CSS側制御のため dataset.yclhActive もここで更新する。
  const applyActive = (name) => {
    runtimeState.activePanel = name;
    setActivePanel(name);
    setActiveTab(name);

    if (name === "chat") {
      startPinChat();

      clickReplayOnceOnChatTab?.();
      startPickSecondChatView();

      document.documentElement.dataset.yclhActive = name;
    } else {
      stopPickSecondChatView();
      stopPinChat();

      delete document.documentElement.dataset.yclhActive;
    }
  };

  // ------------------------------------------------------------
  // moveLeft sync
  // ------------------------------------------------------------
  // enabled中の html dataset を更新し、CSS側の moveLeft を切り替える。
  const applyMoveLeftFlags = () => {
    document.documentElement.dataset.yclh = "1";

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

      const ctx = detectContext();
      const active = runtimeState.activePanel || getDefaultPanelByContext(ctx);
      applyActive(active);

      // playlistも一応
      dockPlaylistIfExists();

      return true;
    }
    lastAppliedSig = sig;

    const comments = rememberCommentsOriginal(original);
    const related = rememberRelatedOriginal(original);
    const playlist = rememberPlaylistOriginal(original);
    rememberChatOriginal(original);

    if (!comments && !related && !playlist) return false;

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
    ensureCssInserted();

    sizing.start();

    dockPlaylistIfExists();

    return true;
  };

  // ---- replay auto open: "click as last resort" ----
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
  // chat view dropdown: open label -> pick 2nd item
  // ------------------------------------------------------------
  let chatViewTimer = 0;
  let chatViewTries = 0;
  let lastChatViewPickAt = 0;

  const CHAT_VIEW_CLICK_COOLDOWN_MS = 1500;
  const CHAT_VIEW_MAX_TRIES = 10;

  const getChatFrame = () => document.querySelector("#chatframe");

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
  // public: apply
  // ------------------------------------------------------------
  // 有効化のエントリ。まずwatch開始→tryApplyOnce、ダメなら短命boot監視でリトライ。
  // 永久監視にしないため 4秒で監視停止する。
  const apply = () => {
    if (applied) return;
    applied = true;

    lastCtxSig = "";

    installNavDetectors();

    // popupに「enabledになった」反映を即出す（この直後 env 判定でsuspendになる可能性もある）
    publishRuntime();

    startEnvWatch();
    evaluateEnvAndSync("apply");
    if (runtimeState.suspended) return;

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

  return { apply, restore, syncMoveLeft, publishRuntime };
};
