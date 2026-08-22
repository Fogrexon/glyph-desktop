import { create } from 'zustand'
import type { TaskView } from '@shared/types'

interface WorkspaceState {
  tasks: TaskView[]
  setTasks: (tasks: TaskView[]) => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  tasks: [],
  setTasks: (tasks) => set({ tasks })
}))

export async function refreshTasks(mode: 'now' | 'all'): Promise<TaskView[]> {
  const tasks = (await window.glyph.tasks.list(mode)) as TaskView[]
  useWorkspace.getState().setTasks(tasks)
  return tasks
}
