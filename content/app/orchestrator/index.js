import { original, resetOriginal } from "../../shared/state.js";
import {
  rememberCommentsOriginal,
  restoreCommentsOriginal,
  rememberRelatedOriginal,
  restoreRelatedOriginal,
} from "../dom/originals.js";

const STASH_ID = "yclh-stash";

const ensureStash = () => {
  let el = document.getElementById(STASH_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = STASH_ID;
    el.style.display = "none";
    document.documentElement.appendChild(el);
  }
  return el;
};

const cleanupStash = () => {
  const el = document.getElementById(STASH_ID);
  if (!el) return;
  if (!el.firstChild) el.remove();
};

export const createOrchestrator = () => {
  let applied = false;
  let bootObserver = null;
  let bootTimer = 0;

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

  const tryApplyOnce = () => {
    const stash = ensureStash();

    const comments = rememberCommentsOriginal(original);
    if (comments && comments.parentElement !== stash)
      stash.appendChild(comments);

    const related = rememberRelatedOriginal(original);
    if (related && related.parentElement !== stash) stash.appendChild(related);

    // どっちも無ければまだ早い
    if (!comments && !related) return false;

    document.documentElement.dataset.yclh = "1";
    return true;
  };

  const apply = () => {
    if (applied) return;
    applied = true;

    // comments がまだ無いことが多いので、短命の監視で拾う
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

    // 永久監視にしない（沼防止）
    bootTimer = setTimeout(() => stopBootWatch(), 4000);
  };

  const restore = () => {
    if (!applied) return;
    applied = false;

    stopBootWatch();

    // まず元位置に戻す（戻せたらOK）
    restoreCommentsOriginal(original);
    restoreRelatedOriginal(original);

    // 退避先掃除
    cleanupStash();

    // 状態初期化
    delete document.documentElement.dataset.yclh;
    resetOriginal();
  };

  return { apply, restore };
};
