import { GLYPH_SELF_TASK_ID } from '@shared/ids'
import { relayoutTermHosts } from '@renderer/lib/termHosts'
import { useUi } from '@renderer/stores/ui'
import { refreshTasks } from '@renderer/stores/workspace'

export const RECOVER_EVENT = 'glyph-recover'

/** Re-fill rail + sessions without quitting Electron or killing PTYs. */
export function recoverWorkspace(): void {
  window.dispatchEvent(new Event(RECOVER_EVENT))
  if (!window.glyph?.tasks || !window.glyph.terminals) return
  const ui = useUi.getState()
  void refreshTasks(ui.viewMode).then((tasks) => {
    const current = useUi.getState().selectedTaskId
    if (current && tasks.some((t) => t.id === current)) return
    const self = tasks.find((t) => t.id === GLYPH_SELF_TASK_ID)
    useUi.getState().selectTask(self?.id ?? tasks[0]?.id ?? null)
  })
  void window.glyph.terminals.list().then((list) => {
    for (const info of list) useUi.getState().upsertSession(info)
  })
  relayoutTermHosts()
}
