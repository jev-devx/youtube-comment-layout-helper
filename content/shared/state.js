import { DEFAULT_SETTINGS } from "./settings.js";

/**
 * settings: 永続化されるユーザー設定（純データ）
 * runtimeState: ページ遷移などでリセットされてOKな短命状態（純データ）
 * original: DOM退避（参照を持つ）
 */

// -------------------------
// settings (in-memory)
// -------------------------
export let settings = { ...DEFAULT_SETTINGS };

export const applySettings = (patch = {}) => {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) settings[k] = v;
  }
  return settings;
};

export const resetSettings = () => {
  settings = { ...DEFAULT_SETTINGS };
  return settings;
};

// -------------------------
// original (DOM refs)
// -------------------------
const ORIGINAL_TEMPLATE = {
  videoBlockEl: null,
  videoBlockParent: null,
  videoBlockNext: null,
  videoBlockAnchor: null,

  commentsEl: null,
  commentsParent: null,
  commentsNext: null,

  relatedEl: null,
  relatedParent: null,
  relatedNext: null,

  playlistEl: null,
  playlistParent: null,
  playlistNext: null,
};

export const original = { ...ORIGINAL_TEMPLATE };

export const resetOriginal = () => {
  Object.assign(original, ORIGINAL_TEMPLATE);
};

// -------------------------
// runtimeState (ephemeral)
// -------------------------
const RUNTIME_TEMPLATE = {
  suspended: false,
  suspendReason: null, // "narrow" | "theater" | null

  navSeq: 0,
  lastUrl: "",

  applying: false,

  // ambientOff は「常時ONの環境制御」扱いでここに置く（永続化しない）
  ambientOff: true,

  // 表示中のpanel
  activePanel: "comments", // "comments" | "related" | "playlist"
};

export const runtimeState = { ...RUNTIME_TEMPLATE };

export const resetRuntimeState = () => {
  Object.assign(runtimeState, RUNTIME_TEMPLATE);
};
