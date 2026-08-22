export function Launcher(): React.JSX.Element {
  return (
    <div className="launcher">
      <h1>Glyph</h1>
      <p>タスクとターミナルを、コマンドパレットから。</p>
      <button className="primary-btn" onClick={() => void window.glyph.window.enterWorkspace()}>
        ワークスペースを開く
      </button>
    </div>
  )
}
