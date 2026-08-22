import type { CommandDef } from './types'

export const COMMANDS: CommandDef[] = [
  {
    id: 'task.new',
    title: '新しいタスク',
    subtitle: 'ゴールとマイルストーンを登録する',
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
    subtitle: 'モデル・プロバイダ・MCP',
    aliases: ['set', 'config', 'preferences'],
    keywords: ['設定', 'settings', 'モデル', 'mcp', 'api'],
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
    subtitle: 'ランチャーに戻る',
    aliases: ['exit', 'leave'],
    keywords: ['終了', 'フルスクリーン', '戻る', 'launcher'],
    group: 'app'
  },
  {
    id: 'app.minimize',
    title: '最小化',
    subtitle: '終了せずタスクバーへ退避（セッションは維持）',
    aliases: ['min', 'minimize', 'hide'],
    keywords: ['最小化', '隠す', '退避', 'minimize', 'hide'],
    group: 'app'
  },
  {
    id: 'app.quit',
    title: 'Glyph を終了',
    aliases: ['quit', 'q'],
    keywords: ['終了', 'quit', 'exit'],
    group: 'app'
  }
]
