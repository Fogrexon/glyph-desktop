import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RECOVER_EVENT } from '@renderer/lib/recoverWorkspace'

interface Props {
  children: ReactNode
  compact?: boolean
  label?: string
  resetKey?: string | number
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  private retries = 0

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
    if (this.retries < 1) {
      this.retries += 1
      queueMicrotask(() => this.setState({ error: null }))
    }
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.props.resetKey !== prevProps.resetKey) {
      this.retries = 0
      if (this.state.error) this.setState({ error: null })
    }
  }

  componentDidMount(): void {
    window.addEventListener(RECOVER_EVENT, this.clear)
  }

  componentWillUnmount(): void {
    window.removeEventListener(RECOVER_EVENT, this.clear)
  }

  private clear = (): void => {
    this.retries = 0
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    if (this.props.compact) {
      return (
        <div className="pane-fallback">
          <span>{this.props.label ?? 'パネル'}の描画に失敗</span>
          <button type="button" className="ghost" onClick={this.clear}>
            再試行
          </button>
        </div>
      )
    }
    return (
      <div className="rescue-screen">
        <p>描画に失敗しました</p>
        <pre>{this.state.error.message}</pre>
        <div className="row-actions">
          <button type="button" className="primary-btn" onClick={() => location.reload()}>
            再読み込み
          </button>
          <button type="button" className="ghost" onClick={this.clear}>
            再試行
          </button>
        </div>
      </div>
    )
  }
}
