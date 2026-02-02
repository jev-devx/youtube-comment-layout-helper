import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/* ------------------------------------------------------------
 * copy-content-css.mjs
 *
 * 目的：
 * - content/styles/content.css をエントリとして読み込み、
 * - 中に書かれた @import をすべて再帰的に展開し、
 * - 1枚の CSS にまとめて dist/content.css として出力する。
 *
 * 背景：
 * - chrome.scripting.insertCSS では @import を含む CSS の扱いが不安定
 * - MV3 環境では「1ファイルCSS」にしておく方が安全
 * - manifest.json に css を書かず、JS 主導で制御したい
 * ---------------------------------------------------------- */

const entry = "content/styles/content.css"; // CSS のエントリポイント
const outFile = "dist/content.css"; // 出力先（insertCSS で使う実体）

/**
 * @import "...";
 * @import url("...");
 * の両方を拾うための簡易正規表現
 */
const IMPORT_RE = /@import\s+(?:url\()?["']([^"']+)["']\)?\s*;/g;

/**
 * inlineImports()
 *
 * 指定した CSS ファイルを読み込み、
 * 含まれている @import を再帰的に展開して文字列として返す。
 *
 * - seen:Set を使って同一ファイルの多重展開を防止
 *   （循環 import / 重複 import 対策）
 * - @keyframes や @media の解析までは行わない
 *   （YCLH の CSS 構成ではこれで十分）
 */
const inlineImports = (absPath, seen = new Set()) => {
  // 同じファイルを2回以上展開しない
  if (seen.has(absPath)) return "";
  seen.add(absPath);

  // import 先が存在しない場合は即エラー
  if (!existsSync(absPath)) throw new Error(`source not found: ${absPath}`);

  const baseDir = dirname(absPath);
  let css = readFileSync(absPath, "utf8");

  // @import を見つけたら、そのファイル内容で置き換える
  return css.replace(IMPORT_RE, (_m, rel) => {
    const nextAbs = resolve(baseDir, rel); // 相対パスを絶対パスへ
    return "\n" + inlineImports(nextAbs, seen) + "\n";
  });
};

try {
  // エントリ CSS を絶対パスに変換
  const absEntry = resolve(process.cwd(), entry);

  // @import をすべて展開した CSS を生成
  // 念のため BOM (UTF-8 BOM) を除去
  let css = inlineImports(absEntry).replace(/^\uFEFF/, "");

  // 出力ディレクトリを確実に作成
  mkdirSync(dirname(outFile), { recursive: true });

  // dist/content.css として書き出し
  writeFileSync(outFile, css, "utf8");

  console.log(`[copy+inline] ${entry} -> ${outFile}`);
} catch (e) {
  // build ステップで失敗したことが分かるように明示的に落とす
  console.error(`[copy] failed: ${e?.message || e}`);
  process.exit(1);
}
