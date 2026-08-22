import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  goal: text('goal').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
  lastCwd: text('last_cwd')
})

export const milestones = sqliteTable('milestones', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  title: text('title').notNull(),
  deadline: integer('deadline').notNull(),
  workStartAt: integer('work_start_at'),
  status: text('status').notNull().default('pending')
})
