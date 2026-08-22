import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic } from 'sql.js'
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js'
import * as schema from './schema'

let sqlite: SqlDatabase | null = null
let drizzleDb: SQLJsDatabase<typeof schema> | null = null
let persistTimer: NodeJS.Timeout | null = null

function dbPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'glyph.sqlite')
}

function wasmPath(): string {
  const candidates = [
    app.isPackaged ? join(process.resourcesPath, 'sql-wasm.wasm') : '',
    join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
  ].filter(Boolean)
  const found = candidates.find((file) => existsSync(file))
  return found ?? candidates[candidates.length - 1]
}

function persistSoon(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistNow()
  }, 80)
}

export function persistNow(): void {
  if (!sqlite) return
  const target = dbPath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, Buffer.from(sqlite.export()))
}

export async function openDatabase(): Promise<SQLJsDatabase<typeof schema>> {
  if (drizzleDb) return drizzleDb

  const SQL: SqlJsStatic = await initSqlJs({
    locateFile: () => wasmPath()
  })

  const file = dbPath()
  if (existsSync(file)) {
    sqlite = new SQL.Database(readFileSync(file))
  } else {
    sqlite = new SQL.Database()
  }

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      archived_at INTEGER,
      last_cwd TEXT
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      deadline INTEGER NOT NULL,
      work_start_at INTEGER,
      status TEXT NOT NULL DEFAULT 'pending'
    );
  `)

  drizzleDb = drizzle(sqlite, { schema })
  persistNow()
  return drizzleDb
}

export function db(): SQLJsDatabase<typeof schema> {
  if (!drizzleDb) throw new Error('Database not opened')
  return drizzleDb
}

export function rawSql(): SqlDatabase {
  if (!sqlite) throw new Error('Database not opened')
  return sqlite
}

export function afterWrite(): void {
  persistSoon()
}
