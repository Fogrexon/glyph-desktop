export const Ipc = {
  windowEnter: 'window:enter-workspace',
  windowExit: 'window:exit-workspace',
  windowMinimize: 'window:minimize',
  windowQuit: 'window:quit',
  windowMode: 'window:mode',

  tasksList: 'tasks:list',
  tasksGet: 'tasks:get',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  tasksArchive: 'tasks:archive',
  milestoneAdd: 'milestones:add',
  milestoneComplete: 'milestones:complete',
  milestoneUpdate: 'milestones:update',

  termEnsure: 'term:ensure',
  termWrite: 'term:write',
  termResize: 'term:resize',
  termRestart: 'term:restart',
  termKill: 'term:kill',
  termGet: 'term:get',
  termList: 'term:list',
  termData: 'term:data',
  termExit: 'term:exit',
  termStatus: 'term:status',
  termCwd: 'term:cwd',

  agentRun: 'agent:run',
  agentReset: 'agent:reset',
  agentEvent: 'agent:event',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  mcpTest: 'settings:mcp-test'
} as const
