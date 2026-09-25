# GitHub Pages公開・実機テスト

## 公開する構成

- 公開対象: `main` ブランチの `/ (root)`。
- 入口: `index.html`。`styles.css` と `js/` を同じ階層に配置します。
- `.nojekyll` を含めてコミットします。静的ファイルをそのまま配信し、ビルドは不要です。
- サーバー側プログラム、環境変数、APIキー、npm installは不要です。
- CSS、JavaScript Modules、Workerはすべて相対URLです。Workerは `import.meta.url` を基準に読み込みます。
- `scripts/preview-pages.py` はローカル検証用で、公開環境では実行しません。
- この準備作業ではコミット・push・GitHubの公開設定変更は行っていません。

## コミットと公開

GitHub Desktopでは、このリポジトリを開き、アプリ・ドキュメント・テストの追加ファイルを確認してコミットし、Push originしてください。

コミットメッセージ例: `Prepare Shape Atelier for GitHub Pages and device testing`

CLIを使う場合の対象ファイル:

```sh
git add .gitignore .nojekyll README.md index.html styles.css package.json js tests scripts docs
git commit -m "Prepare Shape Atelier for GitHub Pages and device testing"
git push origin main
```

次にGitHubのリポジトリで以下を設定します。

1. **Settings → Pages** を開く。
2. **Build and deployment → Source** を **Deploy from a branch** にする。
3. **Branch: main、Folder: / (root)** を選んで **Save**。
4. 公開処理の成功を確認し、Pages画面に表示されたURLを開く。
5. **Enforce HTTPS** が選択可能な場合は有効にし、実機でもHTTPSのURLを使用する。

現在のoriginに基づく公開予定URL:

**https://handson-matsu.github.io/shape-drawing/**

これは設定後の予定URLで、公開済みという意味ではありません。リポジトリの公開範囲やプランによってPagesの利用可否が異なる場合は、Settings → Pagesの表示に従ってください。

設定の根拠: [GitHub公式: 公開元の設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[GitHub公式: .nojekyll](https://github.blog/news-insights/bypassing-jekyll-on-github-pages/)。

## 公開前の再現テスト

通常のルート配信に加え、Pagesと同じサブディレクトリで確認できます。

```sh
python3 scripts/preview-pages.py
# または npm run preview:pages
```

- アプリ: http://127.0.0.1:4187/shape-drawing/
- Canvasテスト: http://127.0.0.1:4187/shape-drawing/tests/browser.html
- このサーバーではサイト直下の `/js/...` などを404にするため、プロジェクト名を無視したパスの不具合を検出できます。
- 実機のブラウザーからPCの `127.0.0.1` は開けません。iPadなどでは公開後のHTTPS URLを開いてください。

```sh
node --test tests/*.test.mjs
# または npm test
```

## 今回の確認結果

| 確認対象 | 結果 |
| --- | --- |
| 公開入口・相対パス・Workerと全モジュールの参照 | Nodeの検査3項目が成功 |
| 輪郭の画素保持・しきい値・穴・凹部 | Nodeの検査6項目が成功 |
| Canvas描画・全図形・Undo / Redo・クリップ・PNG・画像デコード | `/shape-drawing/` 配下で23項目が成功 |
| 実際のサブディレクトリでの画面遷移 | JPEG選択 → Worker認識 → 図形・ペン → PNGプレビューが成功 |
| EXIF回転付きJPEG | 読み込み成功。デコーダーの向きも自動テストで確認 |
| iPad縦相当768×1024・横相当1024×768 | 表示を確認。保存画面に横スクロールなし |
| スマートフォン幅320／390px | 既存のレスポンシブ画面・ツール配置を確認済み |
| タッチ実装 | Pointer Events、pointer capture、`touch-action: none`、キャンセル処理を確認。ペンと図形で共通 |
| カメラ・画像選択の実装 | 画像用file inputを分離。撮影側だけ `capture="environment"` を指定し、クリックから直接起動 |
| 完成画像 | `image/png` Blob、プレビュー、download属性、白背景と描画内容の再デコード検査が成功 |
| 実機カメラ・実機タッチ・OSの保存完了 | 未検証。下記の実機テストで確認する |

自動テストは合計32項目です。PCの画面サイズ変更は実機Safariや指入力の再現ではありません。内蔵ブラウザーではダウンロード完了イベントを取得できていないため、PNG生成の成功と実機の保存完了を区別しています。

公開準備に伴うアプリ修正は、履歴操作の `findLastIndex` を後方走査に置き換えた互換性修正のみです。HTML・CSS、機能、デザイン、描画・図形の仕様は変更していません。

## 実機テスト手順

iPad / iPhoneのSafari、AndroidのChrome、PCのSafari / Chrome / Edge / Firefoxなど、更新済みブラウザーで確認してください。アプリ内ブラウザーではファイル選択や保存の制約が異なるため、まず標準ブラウザーで試します。

1. 公開URLを開き、ボタン・文字・キャンバスが収まることを縦横両方で確認する。
2. 「写真を撮る」で暗い背景に置いた白い紙を撮影する。カメラの許可が求められたら許可する。端末により直接カメラが開く場合と、カメラなどの選択肢が出る場合がある。
3. 「画像を選ぶ」で写真ライブラリまたはファイルから別の画像を選ぶ。同じ写真の再選択も試す。
4. 写真の向き、輪郭、白さスライダーを確認し、「この輪郭でOK」を押す。背景が白になり、元写真が残らないことを確認する。
5. 指でペン描画する。紙の外まで指を動かしても色が漏れず、描画中にページがスクロールしないことを確認する。
6. 円／楕円、四角形、三角形、星型、ハート型をそれぞれ指でドラッグする。プレビュー・指を離した際の確定、逆方向のドラッグを試す。
7. 色・太さ、消しゴム、Undo / Redo、全消去とそのUndo、輪郭の表示・太さを確認する。
8. 「できた！ 保存へ」→「PNG画像を保存」。保存されたファイルを開き、白背景・輪郭・描画の一致を確認する。
9. iPad / iPhoneではダウンロードが「ファイル」アプリに入る場合がある。「写真」に入れたい場合は、保存プレビューを長押しして画像保存、または保存ファイルを開いて共有メニューから画像保存する。選択肢の文言はOSによって異なる。
10. 必要な作品を保存してから「新しい形で遊ぶ」。写真の再取り込みができることを確認する。

カメラ選択の仕組み: [MDN: capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)。Pointer Eventsの仕組み: [MDN: Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)。`download` はブラウザーや設定で動作が異なるため、保存した実ファイルまで確認します: [MDN: a要素](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a)。

HEICの読み込みは端末の画像デコーダーに依存します。読み込めない画像ではJPEG / PNGで再テストしてください。ページの再読み込みで未保存作品は消えます。

## 不具合を記録するとき

機種、OSバージョン、ブラウザー、縦／横、使用した画像形式、操作した順番、起きた結果を記録してください。特に「保存ボタンを押した」だけでなく、「ファイル／写真のどちらに保存されたか」も記録すると切り分けに役立ちます。
