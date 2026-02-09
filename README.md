# YCLH – YouTube Comment Layout Helper

YouTube のコメント欄・チャット欄のレイアウトを柔軟に制御し、  
視聴領域を最大化しながらコメントを快適に読むための Chrome 拡張機能。

- 動画とコメントを並べて見たい
- チャットが邪魔・見づらい
- 配信・アーカイブで毎回操作するのが面倒

といった不満を解消することを目的としています。

## ● 配布先

Chrome ウェブストア  
https://chromewebstore.google.com/detail/yclh-youtube-comment-layo/ndckhbgnedigjlcncnjbnnapimhcmajd

## ● ディレクトリ構成

```text
.
├── background
│   └── serviceWorker.js
├── content
│   ├── app
│   │   ├── dom
│   │   │   ├── insert.js
│   │   │   ├── layoutRoot.js
│   │   │   ├── originals.js
│   │   │   ├── sideRoot.js
│   │   │   └── sizing.js
│   │   └── orchestrator
│   │       └── index.js
│   ├── entry-content.js
│   ├── scripts
│   │   └── copy-content-css.mjs
│   ├── shared
│   │   ├── settings.js
│   │   ├── state.js
│   │   └── storage.js
│   └── styles
│       └── content.css
├── dist
│   ├── content.css
│   ├── content.js
│   └── popup.js
├── icons
│   ├── base-gray.png
│   ├── base.png
│   ├── icon128-disabled.png
│   ├── icon128.png
│   ├── icon16-disabled.png
│   ├── icon16.png
│   ├── icon32-disabled.png
│   ├── icon32.png
│   ├── icon48-disabled.png
│   └── icon48.png
├── manifest.json
├── package-lock.json
├── package.json
├── popup
│   ├── entry-popup.js
│   ├── popup.css
│   └── popup.html
├── README.md
├── test
│   └── CHECKLIST.regression.md
└── vite.config.mjs
```

※ 本拡張は YouTube の SPA + 遅延DOM生成を前提とした構成になっています。

## ● 画面構成と設定項目

YCLH の設定画面は、用途ごとに **「メイン」タブ** と **「ミュート」タブ** に分かれています。

- ### メインタブ

  レイアウトと表示挙動に関する基本設定を行います。
  - **【トグル】YCLH を有効化**
    - 拡張機能全体の ON / OFF を切り替えます
    - ON 時のデフォルト挙動
      - コメント欄を動画の右側に配置

  - **【トグル】サイドパネルを左に配置**
    - コメント・チャットなどのサイドパネルを動画の左側に配置します

  - **【ラジオ】チャット / チャットのリプレイの表示方法**
    - おすすめ：
      - 生配信（Live）では「チャット」
      - アーカイブ（Replay）では「上位のチャットのリプレイ」を自動選択
    - デフォルト：
      - 自動選択は行わず、YouTube の標準設定を使用します

- ### ミュートタブ

  コメント・チャットの表示を制御するミュート機能の設定を行います。
  - **【トグル】チャットにも適用**
    - コメント欄だけでなく、チャット / チャットのリプレイにもミュート設定を適用します

  - **【ラジオ】置換設定**
    - ミュート対象のテキスト部分一致しで判定し、指定した文字列に置換します
      - 「ミュートワードが含まれています」
      - 「にゃーん」

  - **【リスト】ミュートリスト（アイテム）**
    - ミュート対象とするアイテムを最大15個登録できます

- ### フッター
  - **【ボタン】設定のリセット**
    - YCLH のすべての設定を初期状態に戻します

## ● 既知の仕様

- チャットタブがアクティブな状態でYCLHを無効化すると、ライブチャットが一時的に空のフレームとして表示される場合があります。  
  シアターモードまたは全画面表示などを行うか、リロードするとすぐに復元されます。  
  ※これはYouTubeの内部SPAチャット初期化によるもので、拡張機能では安全に制御できません。

## ● 非対応・制限

- YouTube の内部仕様変更により、一部レイアウトや挙動が予告なく変化する場合があります。
- 本拡張は YouTube Watch ページ専用です。

---

## About this repository

This repository is primarily provided for:

- Bug reports and feature requests
- Portfolio and reference purposes
- Privacy policy and documentation hosting

While the source code is publicly visible, it is not intended as a codebase
to be reused or republished as-is.

If you are interested in implementation details, please treat this repository
as a reference rather than a template.

---

This README is written in Japanese.  
Policies and license are provided in English for review and legal clarity.  
Please translate if necessary.
