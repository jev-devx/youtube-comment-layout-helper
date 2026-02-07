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

## ● 機能

- **【トグル】拡張機能の有効 / 無効（メインスイッチ）**
  - 拡張機能全体の ON / OFF を制御
  - ON 時のデフォルト挙動
    - コメント欄を動画の 右側に配置
- **【トグル】サイドパネルを左側に配置**
- **【常時】アーカイブ（Replay）の「チャットのリプレイ」を自動で再生**
  - 【ラジオ】
    - おすすめ：生配信（Live）であれば「チャット」、アーカイブ（Replay）であれば「上位のチャットのリプレイ」を自動選択
    - デフォルト：いずれも上記の選択はせずにデフォルトの設定の（1番目のものを選択した）まま
- **【常時】アンビエント（光漏れ）無効化**
- **【常時】アーカイブ（Replay）動画読み込み時に「チャットのリプレイ」を自動ON**
- **【常時】コメント欄・関連動画・ミックスリストや再生リスト・チャット欄をタブ化しまとめる**

- 設定リセットボタン

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

