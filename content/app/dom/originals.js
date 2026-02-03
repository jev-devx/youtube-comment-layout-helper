import { safeRestoreInsert } from "./insert.js";

/**
 * comments
 * - ytd-comments の元位置を覚える / 戻す
 */
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

export const restoreCommentsOriginal = (original) => {
  const el = original.commentsEl;
  const parent = original.commentsParent;
  if (!el || !parent) return false;

  return safeRestoreInsert(el, parent, original.commentsNext);
};

/**
 * related
 * - #related を覚える / 戻す
 */
export const rememberRelatedOriginal = (original) => {
  const related = document.querySelector("#related");
  if (!related) return null;

  if (!original.relatedEl) {
    original.relatedEl = related;
    original.relatedParent = related.parentElement; // #secondary
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

/**
 * playlist
 * - ytd-playlist-panel-renderer#playlist を覚える / 戻す
 */
export const rememberPlaylistOriginal = (original) => {
  const root = document.querySelector("ytd-playlist-panel-renderer#playlist");
  if (!root) return null;

  // まず container を狙う（無ければ items）
  const container =
    root.querySelector("#container") || root.querySelector("#items") || null;

  if (!container) return null;

  if (!original.playlistEl) {
    original.playlistEl = container;
    original.playlistParent = container.parentElement;
    original.playlistNext = container.nextSibling;
  }

  return container;
};

export const restorePlaylistOriginal = (original) => {
  const el = original.playlistEl;
  const parent = original.playlistParent;
  if (!el || !parent) return false;

  return safeRestoreInsert(el, parent, original.playlistNext);
};

/**
 * chat
 * - #chat-container を覚える / 戻す
 */
export const rememberChatOriginal = (original) => {
  // chat の “箱” を丸ごと動かすのが一番安定（frame単体より安全）
  const chat =
    document.querySelector("ytd-watch-flexy #chat-container") ||
    document.querySelector("#chat-container");

  if (chat && !original.chatEl) {
    original.chatEl = chat;
    original.chatParent = chat.parentElement;
    original.chatNext = chat.nextSibling;
  }
  return original.chatEl || null;
};

export const restoreChatOriginal = (original) => {
  const el = original.chatEl;
  if (!el || !original.chatParent) return;

  // 元の位置に戻す
  if (
    original.chatNext &&
    original.chatNext.parentNode === original.chatParent
  ) {
    original.chatParent.insertBefore(el, original.chatNext);
  } else {
    original.chatParent.appendChild(el);
  }

  original.chatEl = null;
  original.chatParent = null;
  original.chatNext = null;
};
