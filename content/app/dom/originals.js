import { safeRestoreInsert } from "./insert.js";

/**
 * comment
 */
// --- ytd-comments の元位置を覚える（初回だけ） ---
export const rememberCommentsOriginal = (original) => {
  const comments = document.querySelector("ytd-comments");
  if (!comments) return null;

  if (!original.commentsEl) {
    original.commentsEl = comments;
    original.commentsParent = comments.parentElement;
    original.commentsNext = comments.nextSibling;
  }

  return comments;
};
// --- 退避した comments を元位置に戻す ---
export const restoreCommentsOriginal = (original) => {
  const el = original.commentsEl;
  const parent = original.commentsParent;

  if (!el || !parent) return false;

  // parent がもう存在しない等は、今回は深追いしない（次ステップで扱う）
  return safeRestoreInsert(el, parent, original.commentsNext);
};

/**
 * related
 */
export const rememberRelatedOriginal = (original) => {
  const related = document.querySelector(
    "ytd-watch-next-secondary-results-renderer",
  );
  if (!related) return null;

  if (!original.relatedEl) {
    original.relatedEl = related;
    original.relatedParent = related.parentElement;
    original.relatedNext = related.nextSibling;
  }
  return related;
};
export const restoreRelatedOriginal = (original) => {
  const el = original.relatedEl;
  const parent = original.relatedParent;
  if (!el || !parent) return false;
  return safeRestoreInsert(el, parent, original.relatedNext);
};
