import type { Milestone, Task, TaskView } from './types'

export function isMilestoneActive(milestone: Milestone, now: number): boolean {
  if (milestone.status === 'done') return false
  if (milestone.workStartAt == null) return true
  return milestone.workStartAt <= now
}

export function isTaskVisibleNow(milestones: Milestone[], now: number): boolean {
  const pending = milestones.filter((m) => m.status === 'pending')
  if (pending.length === 0) return true
  return pending.some((m) => isMilestoneActive(m, now))
}

export function nearestPendingDeadline(milestones: Milestone[], now: number): Milestone | null {
  const pending = milestones.filter((m) => m.status === 'pending')
  const visible = pending.filter((m) => isMilestoneActive(m, now))
  const pool = visible.length > 0 ? visible : pending
  if (pool.length === 0) return null
  return pool.reduce((a, b) => (a.deadline <= b.deadline ? a : b))
}

/** Lower number = higher priority. Hidden-until-start tasks sort last. */
export function priorityScore(milestones: Milestone[], now: number): number {
  const pending = milestones.filter((m) => m.status === 'pending')
  if (pending.length === 0) return Number.MAX_SAFE_INTEGER - 1
  const visible = pending.filter((m) => isMilestoneActive(m, now))
  if (visible.length === 0) return Number.MAX_SAFE_INTEGER
  const nearest = visible.reduce((a, b) => (a.deadline <= b.deadline ? a : b))
  const overdueBoost = nearest.deadline < now ? -1_000_000_000_000 : 0
  return overdueBoost + nearest.deadline
}

export function toTaskView(task: Task, milestones: Milestone[], now: number): TaskView {
  const nearest = nearestPendingDeadline(milestones, now)
  return {
    ...task,
    milestones,
    visibleNow: isTaskVisibleNow(milestones, now),
    priority: priorityScore(milestones, now),
    nearestDeadline: nearest?.deadline ?? null,
    overdue: nearest != null && nearest.deadline < now && isMilestoneActive(nearest, now)
  }
}

export function sortTasks(tasks: TaskView[]): TaskView[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.createdAt - b.createdAt
  })
}
