import { create } from 'zustand'
import type { TaskView } from '@shared/types'

interface WorkspaceState {
  tasks: TaskView[]
  setTasks: (tasks: TaskView[]) => void
}

function createWorkspaceStore() {
  return create<WorkspaceState>((set) => ({
    tasks: [],
    setTasks: (tasks) => set({ tasks })
  }))
}

const glyphWindow = window as Window & {
  __glyphWorkspaceStore?: ReturnType<typeof createWorkspaceStore>
}
export const useWorkspace = glyphWindow.__glyphWorkspaceStore ?? createWorkspaceStore()
glyphWindow.__glyphWorkspaceStore = useWorkspace

export async function refreshTasks(mode: 'now' | 'all'): Promise<TaskView[]> {
  const tasks = (await window.glyph.tasks.list(mode)) as TaskView[]
  useWorkspace.getState().setTasks(tasks)
  return tasks
}
