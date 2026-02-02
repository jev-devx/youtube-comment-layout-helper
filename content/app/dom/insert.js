/**
 * parent に node を "ref の前" に安全に挿入する。
 * ref が無い/親が違う場合は append。
 */
export const safeInsertBefore = (parent, node, ref) => {
  if (!parent || !node) return false;

  try {
    if (ref && ref.parentNode === parent) {
      parent.insertBefore(node, ref);
    } else {
      parent.appendChild(node);
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * original の (parent,next) に node を戻す。
 */
export const safeRestoreInsert = (node, parent, next) => {
  if (!node || !parent) return false;
  return safeInsertBefore(parent, node, next);
};
