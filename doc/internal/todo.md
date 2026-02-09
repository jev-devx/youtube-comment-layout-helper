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

# TODO

## 機能追加

<details><summary class="h3">Live / Replay のチャットを動画にオーバーレイ表示して流す</summary>
  <div class="sub">

#### 仕様：

- 画面：Live、Replay
- 仕様：
  - コメントの表示タイミングは 動画の再生位置と同期
  - 表示方式
    - 動画上を横スクロール（右 → 左）
    - フォント・サイズは固定（後続 Issue で調整可能）
- メモ
  - equestAnimationFrame ベースで描画

</div>
</details>

<details><summary class="h3">タイムスタンプ付きコメントのオーバーレイ表示</summary>
  <div class="sub">

#### 仕様：

- 画面：normal、Live、Replay
- 仕様：
  - 設定
    - トグル：タイムスタンプ付きコメントをオーバーレイ表示
    - デフォルト：OFF
  - 画面の9割を「Live / Replay のチャットを動画にオーバーレイ表示して流す」の表示領域として、残り1割をこの表示領域として混ざらないようにする
  - 対象フォーマット
    - m:ss
    - mm:ss
    - h:mm:ss
  - 複数タイムスタンプがある場合
    - トグル：タイムスタンプ付きコメントをオーバーレイ表示
    - デフォルト：OFF
  - 数字のみ・曖昧な表記（例：123ここすき）は無視
  - 複数行のコメントは1行にする
    - 改行コードは全てスペースに変換
    - 連続スペースは1つにまとめる
    - 最長文字数は50文字ほど
      - 超えた場合は...にする

</div>
</details>

<details><summary class="h3">UI 言語切り替え（日本語 / 英語）</summary>
  <div class="sub">

#### 仕様：

- 画面：popup含むYCLH全体
- 仕様：
  - 設定
    - ラジオ
      - 日本語
      - English
- メモ
  - i18n 辞書方式
  - 文言キー管理

</div>
</details>

<details><summary class="h3">ミュートコメントのオーバーレイ除外</summary>
  <div class="sub">

#### 仕様：

- 画面：normal、live、replay
- 仕様：
  - 判定順序
    1. コメント取得
    1. ミュートフィルタ適用
    1. OKなもののみオーバーレイ登録
  - 表示済みのオーバーレイには後追いで影響しない

</div>
</details>

## UI/UX改善

</div>
</details>
