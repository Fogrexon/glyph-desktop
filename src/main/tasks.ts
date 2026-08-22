import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db, afterWrite } from './db/client'
import { milestones, tasks } from './db/schema'
import { sortTasks, toTaskView } from '@shared/priority'
import { GLYPH_SELF_TASK_ID } from '@shared/ids'
import type {
  CreateMilestoneInput,
  CreateTaskInput,
  Milestone,
  Task,
  TaskView,
  TaskViewMode,
  UpdateTaskInput
} from '@shared/types'
import { repoRoot } from './shell-hooks'

function mapTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt ?? null,
    lastCwd: row.lastCwd ?? null
  }
}

function mapMilestone(row: typeof milestones.$inferSelect): Milestone {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    deadline: row.deadline,
    workStartAt: row.workStartAt ?? null,
    status: row.status === 'done' ? 'done' : 'pending'
  }
}

export async function listTaskViews(
  mode: TaskViewMode,
  includeArchived = false
): Promise<TaskView[]> {
  const now = Date.now()
  const taskRows = db().select().from(tasks).all()
  const milestoneRows = db().select().from(milestones).all()
  const byTask = new Map<string, Milestone[]>()
  for (const row of milestoneRows) {
    const m = mapMilestone(row)
    const list = byTask.get(m.taskId) ?? []
    list.push(m)
    byTask.set(m.taskId, list)
  }

  const views = taskRows
    .map(mapTask)
    .filter((t) => includeArchived || t.archivedAt == null)
    .map((t) => toTaskView(t, byTask.get(t.id) ?? [], now))

  const filtered =
    mode === 'now' ? views.filter((t) => t.visibleNow && t.archivedAt == null) : views
  return sortTasks(filtered)
}

export async function getTaskView(id: string): Promise<TaskView | null> {
  const row = db().select().from(tasks).where(eq(tasks.id, id)).get()
  if (!row) return null
  const ms = db().select().from(milestones).where(eq(milestones.taskId, id)).all().map(mapMilestone)
  return toTaskView(mapTask(row), ms, Date.now())
}

export async function createTask(input: CreateTaskInput): Promise<TaskView> {
  const id = randomUUID()
  const createdAt = Date.now()
  db()
    .insert(tasks)
    .values({
      id,
      title: input.title.trim(),
      goal: (input.goal ?? '').trim(),
      createdAt,
      archivedAt: null,
      lastCwd: null
    })
    .run()

  for (const ms of input.milestones ?? []) {
    await addMilestone(id, ms)
  }
  afterWrite()
  const view = await getTaskView(id)
  if (!view) throw new Error('Failed to create task')
  return view
}

export async function updateTask(id: string, patch: UpdateTaskInput): Promise<TaskView> {
  const current = db().select().from(tasks).where(eq(tasks.id, id)).get()
  if (!current) throw new Error('Task not found')
  db()
    .update(tasks)
    .set({
      title: patch.title?.trim() ?? current.title,
      goal: patch.goal !== undefined ? patch.goal.trim() : current.goal,
      archivedAt:
        patch.archived === true ? Date.now() : patch.archived === false ? null : current.archivedAt
    })
    .where(eq(tasks.id, id))
    .run()
  afterWrite()
  const view = await getTaskView(id)
  if (!view) throw new Error('Task not found')
  return view
}

export async function archiveTask(id: string): Promise<void> {
  if (id === GLYPH_SELF_TASK_ID) {
    throw new Error('Glyph 自身のタスクはアーカイブできません')
  }
  await updateTask(id, { archived: true })
}

export async function ensureGlyphSelfTask(): Promise<void> {
  const existing = db().select().from(tasks).where(eq(tasks.id, GLYPH_SELF_TASK_ID)).get()
  const root = repoRoot()
  if (existing) {
    if (existing.archivedAt != null) {
      db().update(tasks).set({ archivedAt: null }).where(eq(tasks.id, GLYPH_SELF_TASK_ID)).run()
    }
    if (root && existing.lastCwd !== root) {
      db().update(tasks).set({ lastCwd: root }).where(eq(tasks.id, GLYPH_SELF_TASK_ID)).run()
    }
    afterWrite()
    return
  }
  db()
    .insert(tasks)
    .values({
      id: GLYPH_SELF_TASK_ID,
      title: 'Glyph',
      goal: 'このデスクトップツール自身を、中のターミナルから改善する',
      createdAt: Date.now(),
      archivedAt: null,
      lastCwd: root
    })
    .run()
  afterWrite()
}

export async function addMilestone(
  taskId: string,
  input: CreateMilestoneInput
): Promise<Milestone> {
  const id = randomUUID()
  db()
    .insert(milestones)
    .values({
      id,
      taskId,
      title: input.title.trim(),
      deadline: input.deadline,
      workStartAt: input.workStartAt ?? null,
      status: 'pending'
    })
    .run()
  afterWrite()
  return {
    id,
    taskId,
    title: input.title.trim(),
    deadline: input.deadline,
    workStartAt: input.workStartAt ?? null,
    status: 'pending'
  }
}

export async function completeMilestone(id: string): Promise<void> {
  db().update(milestones).set({ status: 'done' }).where(eq(milestones.id, id)).run()
  afterWrite()
}

export async function updateMilestone(
  id: string,
  patch: {
    title?: string
    deadline?: number
    workStartAt?: number | null
    status?: 'pending' | 'done'
  }
): Promise<void> {
  const current = db().select().from(milestones).where(eq(milestones.id, id)).get()
  if (!current) throw new Error('Milestone not found')
  db()
    .update(milestones)
    .set({
      title: patch.title?.trim() ?? current.title,
      deadline: patch.deadline ?? current.deadline,
      workStartAt: patch.workStartAt !== undefined ? patch.workStartAt : current.workStartAt,
      status: patch.status ?? current.status
    })
    .where(eq(milestones.id, id))
    .run()
  afterWrite()
}

export async function completeNearestMilestone(taskId: string): Promise<Milestone | null> {
  const view = await getTaskView(taskId)
  if (!view) return null
  const pending = view.milestones
    .filter((m) => m.status === 'pending')
    .sort((a, b) => a.deadline - b.deadline)
  const target = pending[0]
  if (!target) return null
  await completeMilestone(target.id)
  return target
}

export async function rememberCwd(taskId: string, cwd: string): Promise<void> {
  db().update(tasks).set({ lastCwd: cwd }).where(eq(tasks.id, taskId)).run()
  afterWrite()
}
