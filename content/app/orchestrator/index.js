import { original, resetOriginal, runtimeState } from "../../shared/state.js";

import {
  rememberCommentsOriginal,
  restoreCommentsOriginal,
  rememberRelatedOriginal,
  restoreRelatedOriginal,
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

  const applyActive = (name) => {
    runtimeState.activePanel = name;
    setActivePanel(name);
    setActiveTab(name);
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
    if (!panelComments || !panelRelated) return false;

    // 元位置を覚える
    const comments = rememberCommentsOriginal(original);

    //related は「secondary-inner」丸ごと
    const related = rememberRelatedOriginal(original);

    // どっちも無ければまだ早い
    if (!comments && !related) return false;

    // panelへ移動（存在するものだけ）
    if (comments && comments.parentElement !== panelComments) {
      panelComments.appendChild(comments);
    }
    if (related && related.parentElement !== panelRelated) {
      panelRelated.appendChild(related);
    }

    // active 初期適用（DOMが揃ってから）
    applyActive(runtimeState.activePanel || "comments");

    // 有効フラグ & CSS
    document.documentElement.dataset.yclh = "1";
    ensureCssInserted();

    // sizing開始
    sizing.start();

    return true;
  };

  const apply = () => {
    if (applied) return;
    applied = true;

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

    // UI掃除
    cleanupSideUi();
    cleanupLayoutRoot();

    // CSS/フラグ掃除
    ensureCssRemoved();
    delete document.documentElement.dataset.yclh;

    // state掃除
    resetOriginal();
  };

  return { apply, restore };
};
