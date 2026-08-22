export function Launcher(): React.JSX.Element {
  return (
    <div className="launcher">
      <h1>Glyph</h1>
      <p>タスクとターミナルを、コマンドパレットから。</p>
      <p className="launcher-note">閉じてもトレイに残ります。完全終了はトレイ右クリックから。</p>
      <button className="primary-btn" onClick={() => void window.glyph.window.enterWorkspace()}>
        ワークスペースを開く
      </button>
    </div>
  )
}
