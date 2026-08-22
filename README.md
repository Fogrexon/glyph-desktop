# Glyph

コマンドパレット中心のデスクトップワークスペースです。タスク（ゴール・マイルストーン）と、タスクごとの本物のターミナルを同居させます。

## 必要環境

- Node.js 22+
- Windows: Visual Studio 2022 Build Tools（C++ デスクトップ開発）
- macOS: Xcode Command Line Tools

Windows で `node-pty` のビルドが Spectre ライブラリ不足で落ちる場合、`scripts/rebuild-native.js` が緩和を無効化してから rebuild します。

## 開発

```sh
npm install
npm run dev
```

起動したら「ワークスペースを開く」を押すと、いまのディスプレイを覆うフルスクリーンになります。

- `Ctrl+K` / `Ctrl+Shift+P`（macOS は `⌘K`）でコマンドパレット
- `Ctrl+M`（macOS は `⌘M`）で最小化。終了せずタスクバーへ退避し、ターミナルはそのまま
- `>` のあとであいまい検索してコマンド直実行（例: `> min`, `> set`, `> タス`）
- プレフィックスなしはタスク横断検索。自然言語は「自然言語として実行」
- マイルストーンの作業開始日時より前の仕事は「今やる仕事」から消えます（`> view.all` で全部見られる）
- コーディングエージェント（Claude Code / Codex など）が Tasks / Todo を出していると、タスク行に短い作業チップが並びます

## 設定

パレットから `設定を開く`。

- OpenRouter / Gemini API / Vertex AI（ADC）
- パレット用の高速モデル ID
- MCP サーバ JSON は接続の骨組みのみ（実際の Slack/Notion 接続は次フェーズ）

## 配布

```sh
npm run dist:win   # Windows: NSIS インストーラ + portable
npm run dist:mac   # macOS: arm64 dmg + zip
```

成果物は `dist/` に出ます。コード署名・公証はまだ行いません。GitHub Actions の `Release` ワークフローでも同じ成果物を作れます。

## ターミナル

各タスクのシェルはホームディレクトリから起動します。`cd` は手動です。cwd は shell integration（OSC 7 / 633）で追い、タスク行とターミナル枠に出します。git 配下ならリポジトリ名も出します。

コーディングエージェント（Claude Code / Codex など）がターミナルに Tasks / Todo を出している場合、その項目を短い一語チップとしてタスク一覧に並べます。無いときは実行中コマンド名（`claude` / `npm` など）にフォールバックします。`~/.claude/todos` があればそこも参照します。差分ビューワーはまだありませんが、`cwd` / `gitRoot` の更新イベントを後から購読できます。
