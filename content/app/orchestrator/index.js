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
} from "../dom/sideRoot.js";

import { createSizing } from "../dom/sizing.js";

export const createOrchestrator = () => {
  // ------------------------------------------------------------
  // runtime flags / state
  // ------------------------------------------------------------
  // orchestrator の有効/無効、boot監視、CSS挿入状態などの内部状態を保持する。
  // ここは “SPA + DOM遅延生成” を吸収するためのフラグ群。
  let applied = false;
  let bootObserver = null;
  let bootTimer = 0;

  let cssInserted = false;
  const sizing = createSizing();

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
  // content側にCSSを差し込む（有効化時）メッセージを送る。
  // 二重実行を避けるため cssInserted をガードにする。
  const ensureCssInserted = () => {
    if (cssInserted) return;
    cssInserted = true;
    try {
      chrome.runtime.sendMessage({ type: "YCLH_INSERT_CSS" });
    } catch {}
  };

  // content側にCSSを外す（無効化時）メッセージを送る。
  // 二重実行を避けるため cssInserted をガードにする。
  const ensureCssRemoved = () => {
    if (!cssInserted) return;
    cssInserted = false;
    try {
      chrome.runtime.sendMessage({ type: "YCLH_REMOVE_CSS" });
    } catch {}
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
  let pinRaf = 0;
  let pinRO = null;
  let pinOnScroll = null;

  const startPinChat = () => {
    if (chatPinned) return;
    chatPinned = true;

    const tick = () => {
      pinRaf = 0;
      if (!chatPinned) return;
      applyPin();
      pinRaf = requestAnimationFrame(tick);
    };
    pinRaf = requestAnimationFrame(tick);

    const panelChat = getPanelChat();
    if (panelChat && !pinRO) {
      pinRO = new ResizeObserver(() => applyPin());
      pinRO.observe(panelChat);
    }

    pinOnScroll = () => applyPin();
    window.addEventListener("scroll", pinOnScroll, true);
    window.addEventListener("resize", pinOnScroll, true);

    applyPin();
  };

  // chat の pin を停止し、chat-container に付けた inline style を元に戻す。
  // overlayを止めて通常レイアウトに戻す（DOMは動かさない）。
  const stopPinChat = () => {
    if (!chatPinned) return;
    chatPinned = false;

    if (pinRaf) {
      cancelAnimationFrame(pinRaf);
      pinRaf = 0;
    }
    if (pinRO) {
      pinRO.disconnect();
      pinRO = null;
    }
    if (pinOnScroll) {
      window.removeEventListener("scroll", pinOnScroll, true);
      window.removeEventListener("resize", pinOnScroll, true);
      pinOnScroll = null;
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
      document.documentElement.dataset.yclhActive = name;
    } else {
      stopPinChat();
      delete document.documentElement.dataset.yclhActive;
    }
  };

  // ------------------------------------------------------------
  // moveLeft sync
  // ------------------------------------------------------------
  // enabled中の html dataset を更新し、CSS側の moveLeft を切り替える。
  // 無効中は何もしない（restore と競合させない）。
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

    applyActive(runtimeState.activePanel || "comments");

    document.documentElement.dataset.yclh = "1";
    ensureCssInserted();

    sizing.start();

    dockPlaylistIfExists();

    return true;
  };

  // ------------------------------------------------------------
  // public: apply
  // ------------------------------------------------------------
  // 有効化のエントリ。まずwatch開始→tryApplyOnce、ダメなら短命boot監視でリトライ。
  // 永久監視にしないため 4秒で監視停止する。
  const apply = () => {
    if (applied) return;
    applied = true;

    startPlaylistWatch();

    if (tryApplyOnce()) return;

    stopBootWatch();

    bootObserver = new MutationObserver(() => {
      if (!applied) return;
      if (tryApplyOnce()) stopBootWatch();
    });

    bootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    bootTimer = setTimeout(() => stopBootWatch(), 4000);
  };

  // ------------------------------------------------------------
  // public: restore
  // ------------------------------------------------------------
  // 無効化のエントリ。sizing停止→元位置復帰→UI/Root/CSS/flags/state を掃除する。
  // 監視やpinも必ず止め、次回applyが綺麗に動く状態に戻す。
  const restore = () => {
    if (!applied) return;
    applied = false;

    stopBootWatch();

    // chat の overlay/pin を必ず解除
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

    // state 掃除
    resetOriginal();

    stopPlaylistWatch();
  };

  return { apply, restore, syncMoveLeft };
};
