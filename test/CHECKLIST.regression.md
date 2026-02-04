<style>
  .section {
    margin-left: 0;
  }

  /* H2 相当（章レベル） */
  summary.h2 {
    font-size: 1.5em;
    font-weight: 700;
    margin: 1.2em 0 0.6em;
    cursor: pointer;
  }

  /* H3 相当（節レベル） */
  summary.h3 {
    font-size: 1.25em;
    font-weight: 600;
    margin: 0.9em 0 0.5em;
    cursor: pointer;
  }

  /* H4 相当（小項目） */
  summary.h4 {
    font-size: 1.05em;
    font-weight: 600;
    margin: 0.6em 0 0.4em;
    cursor: pointer;
  }

  .sub {
    margin-left: 1.2rem;
    border-left: 3px solid #e0e0e0;
    padding-left: 0.8rem;
  }

  .subsub {
    margin-left: 2.4rem;
    border-left: 3px dotted #e0e0e0;
    padding-left: 0.8rem;
  }

  .note {
    margin-left: 1.2rem;
    font-size: 0.9em;
    color: #555;
  }
</style>

# YCLH Pre-release Regression Test Checklist

YouTube の SPA / 広告 / DOM 差し替えによる不安定要素が多岐にわたるため、
リリース前に「既知の壊れ方」を一通り踏むためのリグレッションテスト。

## 前提（YCLH の設計思想）

- YCLH は YouTube DOM を恒久的に書き換えない
- 一時的な不整合は許容するが、以下を満たすことを必須とする
  - popup の表示と実際の状態が矛盾しない
  - OFF / reload で必ず復帰できる
  - ユーザー操作が次に何をすべきか分かる

---

## 環境（基本は両方）

- macOS / Chrome（広告ブロックなし）
- Windows / Chrome（AdBlock 有効）

### 推奨

- Chrome の新しめの安定版
- 可能なら別プロファイル（キャッシュ/拡張干渉を減らす）

---

## テスト対象動画

- normal（通常動画・コメント有効）
- normal（コメント無効）
- live（ライブ・チャット有効）
- live（チャット無効／配信者が閉じている）
- replay（アーカイブ + 再生リストあり）
- replay（アーカイブ + 再生リストなし）
- （任意）premiere
- （任意）shorts / embed（非対応なら「壊さない」だけ確認）

---

<details><summary class="h2">0. 共通：拡張の状態遷移</summary>
  <div class="sub">

- [ ] 拡張 OFF の状態で YouTube 視聴ページが通常通り動く
- [ ] OFF → ON（同一ページ）でレイアウトが適用される
- [ ] ON → OFF（同一ページ）で元に戻る／残骸が残らない
- [ ] ON → OFF → ON（連続）で壊れない
- [ ] 設定リセットが動作し、破綻しない
- [ ] 設定が空（初回インストール相当）でも正常に初期化される
- [ ] コンソールに致命的エラーが増え続けない（YCLH由来のログスパムがない）
- [ ] 一時的に壊れても「OFF → ON」または「リロード」で復帰可能

</div>
</details>

---

<details><summary class="h2">1. Popup UI / 状態表示</summary>

popup は SPA / runtime 遅延 / 状態補完の影響を最も受けやすいため、  
挙動・文言・実際の状態が一致しているかを重点確認する。

  <div class="sub">
<summary class="h3">基本動作</summary>

- [ ] popup を開いた瞬間に「何も表示されない」状態が存在しない
- [ ] 直前に見ていたページの状態を引きずらない（残像が出ない）
- [ ] popup を閉じてすぐ再オープンしても表示が正しく再描画される

---

<summary class="h3">ページ種別ごとの表示</summary>
  <div class="subsub">
<summary class="h4">YouTube 以外のページ</summary>

- [ ] 「YCLH は YouTube 専用の拡張機能です」と表示される
- [ ] toggle を操作してもエラーにならない

<summary class="h4">YouTube Top / 検索 / チャンネル（non-watch）</summary>

- [ ] 「YouTubeの動画ページで有効になります」と表示される
- [ ] overlay（YCLH は一時停止中）が表示されない

<summary class="h4">watch ページ（拡張 OFF）</summary>

- [ ] 「このページで有効にするには、下の『YCLHを有効化する』を ON にしてください」が表示される
- [ ] Top → watch の SPA 遷移直後でも同じ文言が表示される
- [ ] popup を開き直しても文言が変わらない

<summary class="h4">watch ページ（拡張 ON）</summary>

- [ ] 初回 ON 操作でレイアウトが即反映される
- [ ] SPA 遷移後に反映が遅れた場合  
       「うまく反映されない場合は、ページをリロードしてください」が表示される
- [ ] 正常動作中に overlay（環境停止表示）が誤って出ない
</div>

---

<summary class="h3">環境要因による自動停止（overlay）</summary>

- [ ] 停止理由が必ず明示される（文言が空にならない）
- [ ] 停止中は toggle / UI が動作しない
- [ ] 停止解除後、popup 表示と実状態が一致する

<div class="subsub">

- [ ] シアターモード
- [ ] ウィンドウ幅狭

</div>

###

<summary class="h3">状態遷移・耐久確認</summary>

- [ ] OFF → ON → OFF を popup から操作しても表示が破綻しない
- [ ] Top → watch → Top → watch を繰り返しても表示が一貫している
- [ ] runtime が未確定でも、操作不能にならず fallback 表示が出る
- [ ] 「現在の環境により無効です（理由不明）」の誤表示が出ない

---

<summary class="h3">表示と実挙動の一致</summary>

- [ ] popup の表示内容と、実際のレイアウト状態が矛盾していない
- [ ] 「ON にしてください」と表示されている状態で勝手に適用されない
- [ ] overlay 表示中に DOM が動かない（UI 停止と一致している）

---

※ popup は Service Worker / content script の状態同期が遅れる前提で設計されているため、  
 **状態未確定時でもユーザーが次に取るべき操作が分かる表示**を最優先とする。

</div>
</details>

---

<details><summary class="h2">2. 通常動画（normal）</summary>
<div class="sub">

<summary class="h3">初回読み込み</summary>

- [ ] 初期タブが「コメント」
- [ ] 関連動画が表示されている
- [ ] リロードしても状態が壊れない

<summary class="h3">画面モード</summary>

- [ ] シアターモード ON/OFF
- [ ] 全画面 ON/OFF
- [ ] ウィンドウ幅変更（狭い⇄広い／レスポンシブ境界を跨ぐ）
- [ ] ダーク/ライト（可能なら）で視認性が破綻しない

<summary class="h3">例外パターン</summary>

- [ ] コメント無効の動画でも UI が崩れず、エラーで止まらない
- [ ] コメント読み込みが遅い（重い/回線悪い）場合でも復帰できる
</div>
</details>

---

<details><summary class="h2">3. ライブ配信（live）</summary>
<div class="sub">

<summary class="h3">初回読み込み</summary>

- [ ] 初期タブが「チャット」
- [ ] コメントタブは表示されない
- [ ] リロードで状態が壊れない

<summary class="h3">画面モード</summary>

- [ ] シアターモード ON/OFF
- [ ] 全画面 ON/OFF
- [ ] ウィンドウ幅変更（狭い⇄広い／レスポンシブ境界を跨ぐ）
- [ ] ダーク/ライト（可能なら）で視認性が破綻しない

<summary class="h3">例外/復旧</summary>

- [ ] chat に Something went wrong が出た場合、リロードで復帰できる
- [ ] ライブでチャット無効でも UI が崩れない（非表示/代替表示でもOK）
- [ ] live → 別動画（normal）へ遷移しても、tab/side が壊れない
</div>
</details>

---

<details><summary class="h2">4. 再生リスト + アーカイブ（replay）</summary>
<div class="sub">

<summary class="h3">初回読み込み</summary>

- [ ] 初期タブが「チャット」
- [ ] 再生リストが表示されている（存在する場合）

<summary class="h3">連続再生 / 次へ（最低3回）</summary>

- [ ] 再生リストタブの中身が消えない
- [ ] コメントタブに勝手に戻らない
- [ ] chat / playlist が同時に壊れない
- [ ] 「次へ」を数回繰り返しても劣化しない（毎回少しずつ壊れない）

<summary class="h3">再生リスト内遷移</summary>

- [ ] 再生リスト内の別動画クリックで遷移しても壊れない
- [ ] 再生リストあり→なし（または逆）へ遷移しても壊れない
</div>
</details>

---

<details><summary class="h2">5. ナビゲーション（SPA）</summary>
<div class="sub">

<summary class="h3">それぞれ 2〜3 回ずつ。可能なら normal / live / replay の混在で実施。</summary>

- [ ] 関連動画クリック
- [ ] 次へ
- [ ] 再生リスト内遷移
- [ ] URL 直接貼り付け
- [ ] ブラウザ戻る/進む
- [ ] ナビゲーション中に popup を開いても、破綻しない

→ 状態が壊れず、tab / side が復元される

</div>
</details>

---

<details><summary class="h2">6. 異常系</summary>
<div class="sub">

<summary class="h3">再現できなくてもOK</summary>

- [ ] preroll 広告あり
- [ ] preroll 広告なし
- [ ] Something went wrong 表示
- [ ] yt-navigate-finish が遅れるケース

→ 最低限、**リロードで復帰可能**であること

</div>
</details>

---

<details><summary class="h2">7. 非対応領域の“無害性”確認</summary>
<div class="sub">

<summary class="h3">任意</summary>

- [ ] Shorts（「何もしない」／壊さない）
- [ ] 制限系（年齢/メン限/地域）※見れなくてもOK：エラーが暴れない

</div>
</details>
