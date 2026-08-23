import type { CommandDef } from './types'

export const COMMANDS: CommandDef[] = [
  {
    id: 'task.new',
    title: '新しいタスク',
    subtitle: 'パレットでゴールとマイルストーンを登録',
    aliases: ['nt', 'new', 'create'],
    keywords: ['タスク', '作成', '追加', 'task', 'new'],
    group: 'task'
  },
  {
    id: 'task.list',
    title: 'タスク一覧',
    subtitle: 'パレットにタスクを並べる',
    aliases: ['ls', 'list'],
    keywords: ['一覧', 'リスト', 'tasks'],
    group: 'task'
  },
  {
    id: 'task.open',
    title: 'タスクを開く',
    subtitle: '名前であいまい検索してターミナルを表示',
    aliases: ['open', 'o'],
    keywords: ['開く', 'フォーカス', 'open'],
    group: 'task'
  },
  {
    id: 'commands.open',
    title: 'コマンドを実行',
    subtitle: '> でコマンド一覧から直呼び',
    aliases: ['cmd', 'command'],
    keywords: ['コマンド', '直呼び', 'palette', 'コマンドパレット'],
    group: 'app'
  },
  {
    id: 'search.open',
    title: 'タスク・ターミナルを検索',
    subtitle: '? であいまい検索してジャンプ',
    aliases: ['find', 'goto', 'jump', 'fzf'],
    keywords: ['検索', 'あいまい', 'fuzzy', 'ターミナル', 'タスク', 'cwd'],
    group: 'app'
  },
  {
    id: 'task.next',
    title: '次のタスク',
    subtitle: 'レールの次のタスクへ。ペイン切替とは別',
    aliases: ['tn', 'next-task'],
    keywords: ['次', 'タスク', '切替', 'next', 'cycle'],
    group: 'task'
  },
  {
    id: 'task.prev',
    title: '前のタスク',
    subtitle: 'レールの前のタスクへ',
    aliases: ['tp', 'prev-task'],
    keywords: ['前', 'タスク', '切替', 'prev', 'cycle'],
    group: 'task'
  },
  {
    id: 'task.complete',
    title: 'タスクを完了',
    subtitle: '選択中または指定したタスクをアーカイブ',
    aliases: ['done', 'archive'],
    keywords: ['完了', 'アーカイブ', 'done'],
    group: 'task'
  },
  {
    id: 'milestone.add',
    title: 'マイルストーンを追加',
    subtitle: '選択中タスクに締め切りを足す',
    aliases: ['ms', 'milestone'],
    keywords: ['マイルストーン', '締め切り', 'deadline'],
    group: 'task'
  },
  {
    id: 'milestone.done',
    title: '直近マイルストーンを完了',
    subtitle: '選択中タスクの未完了をひとつ閉じる',
    aliases: ['msd'],
    keywords: ['マイルストーン', '完了', '達成'],
    group: 'task'
  },
  {
    id: 'view.now',
    title: '今やる仕事だけ表示',
    subtitle: '開始日前のマイルストーンは隠す',
    aliases: ['now'],
    keywords: ['今', 'フィルタ', '頭から消す', 'focus'],
    group: 'view'
  },
  {
    id: 'view.all',
    title: 'すべてのタスクを表示',
    subtitle: '開始日前も含めて見る',
    aliases: ['all'],
    keywords: ['すべて', '将来', 'all'],
    group: 'view'
  },
  {
    id: 'settings.open',
    title: '設定を開く',
    subtitle: '設定タブを開く',
    aliases: ['set', 'config', 'preferences'],
    keywords: ['設定', 'settings', 'モデル', 'mcp', 'api'],
    group: 'app'
  },
  {
    id: 'shortcuts.open',
    title: 'ショートカット',
    subtitle: '設定タブで一覧と割り当てを変える',
    aliases: ['keymap', 'keys', 'shortcuts', 'hotkey'],
    keywords: ['ショートカット', 'キー', 'keymap', 'bind', 'hotkey'],
    group: 'app'
  },
  {
    id: 'provider.set-model',
    title: 'パレット用モデルを指定',
    subtitle: '高速モデルの ID を変える',
    aliases: ['model'],
    keywords: ['モデル', 'llm', 'flash', 'openrouter', 'gemini'],
    group: 'app'
  },
  {
    id: 'chat.reset',
    title: '会話をリセット',
    subtitle: 'パレットの自然言語会話を最初から',
    aliases: ['reset', 'clear'],
    keywords: ['会話', 'リセット', 'クリア', 'chat'],
    group: 'app'
  },
  {
    id: 'glyph.dev',
    title: 'Glyph 自身を開く',
    subtitle: 'このリポジトリのターミナルでツールを改善する',
    aliases: ['self', 'dogfood', 'glyph'],
    keywords: ['glyph', '改善', '開発', 'dogfood', 'リポジトリ'],
    group: 'app'
  },
  {
    id: 'term.pwd',
    title: '作業ディレクトリを表示',
    subtitle: '選択中ターミナルの cwd',
    aliases: ['pwd', 'cwd'],
    keywords: ['ディレクトリ', 'cwd', 'pwd', 'パス'],
    group: 'term'
  },
  {
    id: 'term.split-right',
    title: '右に分割',
    subtitle: '選択中ペインを左右に割る',
    aliases: ['split', 'vsplit'],
    keywords: ['分割', '右', 'split', 'pane'],
    group: 'term'
  },
  {
    id: 'term.split-down',
    title: '下に分割',
    subtitle: '選択中ペインを上下に割る',
    aliases: ['hsplit'],
    keywords: ['分割', '下', 'split', 'pane'],
    group: 'term'
  },
  {
    id: 'term.new-tab',
    title: 'ターミナルタブ',
    subtitle: '今のペインにターミナルを足す',
    aliases: ['ntab', 'tab'],
    keywords: ['タブ', 'ターミナル', 'tab'],
    group: 'term'
  },
  {
    id: 'browser.split-right',
    title: '右にブラウザ',
    subtitle: '右に割ってページを開く',
    aliases: ['browser', 'br'],
    keywords: ['ブラウザ', 'browser', 'web', '分割'],
    group: 'term'
  },
  {
    id: 'browser.split-down',
    title: '下にブラウザ',
    subtitle: '下に割ってページを開く',
    aliases: ['browser-down'],
    keywords: ['ブラウザ', 'browser', 'web', '分割'],
    group: 'term'
  },
  {
    id: 'browser.new-tab',
    title: 'ブラウザタブ',
    subtitle: '今のペインにページを足す',
    aliases: ['btab', 'url'],
    keywords: ['ブラウザ', 'タブ', 'url', 'web'],
    group: 'term'
  },
  {
    id: 'pane.close-tab',
    title: 'タブを閉じる',
    subtitle: '選択中のタブだけ閉じる。最後ならペインも',
    aliases: ['ctab'],
    keywords: ['閉じる', 'タブ', 'close', 'tab'],
    group: 'term'
  },
  {
    id: 'term.close-pane',
    title: 'ペインを閉じる',
    subtitle: '選択中の分割ペインをタブごと閉じる',
    aliases: ['close-pane'],
    keywords: ['閉じる', 'ペイン', 'close', 'pane'],
    group: 'term'
  },
  {
    id: 'term.restart',
    title: 'ターミナルを再起動',
    subtitle: '選択中タスクの PTY を作り直す',
    aliases: ['restart'],
    keywords: ['再起動', 'reset', 'pty'],
    group: 'term'
  },
  {
    id: 'workspace.exit-fullscreen',
    title: 'ワークスペースを閉じる',
    subtitle: 'ランチャーに戻る（ターミナルは維持）',
    aliases: ['exit', 'leave'],
    keywords: ['終了', 'フルスクリーン', '戻る', 'launcher'],
    group: 'app'
  },
  {
    id: 'app.minimize',
    title: 'トレイに退避',
    subtitle: 'ウィンドウを隠す。ターミナルはバックグラウンドで継続',
    aliases: ['min', 'minimize', 'hide'],
    keywords: ['最小化', '隠す', '退避', 'トレイ', 'minimize', 'hide'],
    group: 'app'
  },
  {
    id: 'app.quit',
    title: 'トレイに退避',
    subtitle: '完全終了ではない。破棄はトレイ右クリック「完全に終了」',
    aliases: ['quit', 'q', 'close'],
    keywords: ['終了', 'quit', 'exit', 'トレイ'],
    group: 'app'
  }
]
