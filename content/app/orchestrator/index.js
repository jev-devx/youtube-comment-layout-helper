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
  let applied = false;
  let bootObserver = null;
  let bootTimer = 0;

  let cssInserted = false;
  const sizing = createSizing();

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

  // playlist監視　ここから
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

    // #playlist 周辺だけ見れば十分（無ければ document でもOK）
    const root =
      document.querySelector("#playlist") ||
      document.querySelector("#secondary") ||
      document.documentElement;

    playlistObserver.observe(root, { childList: true, subtree: true });
  };

  const stopPlaylistWatch = () => {
    if (!playlistObserver) return;
    playlistObserver.disconnect();
    playlistObserver = null;
  };
  // ここまで

  // chat監視　ここから
  const dockChatIfExists = () => {
    const panelChat = getPanelChat();
    if (!panelChat) return false;

    const chat = rememberChatOriginal(original);
    if (!chat) return false;

    // すでに正しい場所なら何もしない
    if (chat.parentElement === panelChat) return true;

    panelChat.appendChild(chat);
    return true;
  };

  let chatObserver = null;
  let lastChatEnsureAt = 0;
  const startChatWatch = () => {
    if (chatObserver) return;

    const ensure = () => {
      if (!applied) return;

      // 連打・大量mutation対策（200msに1回だけ）
      const now = performance.now();
      if (now - lastChatEnsureAt < 200) return;
      lastChatEnsureAt = now;

      dockChatIfExists();
    };

    chatObserver = new MutationObserver(ensure);

    // YouTube は chat を #secondary / #panels 周りで入れ替えるので広めに監視
    const root =
      document.querySelector("#secondary") ||
      document.querySelector("ytd-watch-flexy") ||
      document.documentElement;

    chatObserver.observe(root, { childList: true, subtree: true });

    // 起動直後も一回だけ保証
    ensure();
  };

  const stopChatWatch = () => {
    if (!chatObserver) return;
    chatObserver.disconnect();
    chatObserver = null;
  };

  // ここまで

  const applyActive = (name) => {
    runtimeState.activePanel = name;
    setActivePanel(name);
    setActiveTab(name);
  };

  const applyMoveLeftFlags = () => {
    document.documentElement.dataset.yclh = "1";

    if (settings.moveLeft) {
      document.documentElement.dataset.yclhLeft = "1";
    } else {
      delete document.documentElement.dataset.yclhLeft;
    }
  };

  const syncMoveLeft = () => {
    // 有効中だけ即反映（無効中は何もしない）
    if (!applied) return;
    applyMoveLeftFlags();
  };

  const tryApplyOnce = () => {
    // layoutの器が作れるか
    if (!canBuildLayoutRoot()) return false;

    const roots = ensureLayoutRoot();
    const side = roots?.side;
    if (!side) return false;

    // tabs/panels を用意
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
    if (!panelComments || !panelRelated || !panelPlaylist || !panelChat)
      return false;

    // 元位置を覚える
    const comments = rememberCommentsOriginal(original);
    const related = rememberRelatedOriginal(original);
    const playlist = rememberPlaylistOriginal(original);
    const chat = rememberChatOriginal(original);

    // 何も無ければまだ早い
    if (!comments && !related && !playlist && !chat) return false;

    // panelへ移動（存在するものだけ）
    if (comments && comments.parentElement !== panelComments) {
      panelComments.appendChild(comments);
    }
    if (related && related.parentElement !== panelRelated) {
      panelRelated.appendChild(related);
    }
    if (playlist && playlist.parentElement !== panelPlaylist) {
      panelPlaylist.appendChild(playlist);
    }
    if (chat && chat.parentElement !== panelChat) {
      panelChat.appendChild(chat);
    }

    // active 初期適用（DOMが揃ってから）
    applyActive(runtimeState.activePanel || "comments");

    // 有効フラグ & CSS
    document.documentElement.dataset.yclh = "1";

    ensureCssInserted();

    // sizing開始
    sizing.start();

    // playlist は遅れて出ることがあるので一回試す
    dockPlaylistIfExists();

    // chat は遅れて出ることがあるので一回試す
    dockChatIfExists();

    return true;
  };

  const apply = () => {
    if (applied) return;
    applied = true;

    startPlaylistWatch();
    startChatWatch();

    if (tryApplyOnce()) return;

    stopBootWatch();

    // 早期DOMでは #secondary や中身が無いことがあるので短命監視
    bootObserver = new MutationObserver(() => {
      if (!applied) return;
      if (tryApplyOnce()) stopBootWatch();
    });

    bootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 永久監視にしない
    bootTimer = setTimeout(() => stopBootWatch(), 4000);
  };

  const restore = () => {
    if (!applied) return;
    applied = false;

    stopBootWatch();

    // sizing停止（先に止めてOK）
    sizing.stop();

    // 元位置へ
    restoreCommentsOriginal(original);
    restoreRelatedOriginal(original);
    restorePlaylistOriginal(original);
    restoreChatOriginal(original);

    // UI掃除
    cleanupSideUi();
    cleanupLayoutRoot();

    // CSS/フラグ掃除
    ensureCssRemoved();
    delete document.documentElement.dataset.yclh;
    delete document.documentElement.dataset.yclhLeft;

    // state掃除
    resetOriginal();

    stopPlaylistWatch();
    stopChatWatch();
  };

  return { apply, restore, syncMoveLeft };
};
