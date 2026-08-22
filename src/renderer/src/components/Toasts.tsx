import { useUi } from '@renderer/stores/ui'

export function Toasts(): React.JSX.Element {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)

  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast ${toast.kind === 'warn' ? 'warn' : toast.kind === 'ok' ? 'ok' : ''}`}
          onClick={() => dismiss(toast.id)}
        >
          {toast.text}
        </button>
      ))}
    </div>
  )
}
