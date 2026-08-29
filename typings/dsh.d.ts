// Minimal structural types for the DSH services used by lib/index.js.
// 假设：DSH 官方类型包尚未提供，这里以插件实际用到的形状为准；
// 接入官方类型后可整体替换本文件。

export interface DshTarget {
  targetKey: string
  displayPath: string
}

export interface DshDirEntry {
  name: string
  type: string
  size?: number
  target: DshTarget
}

export interface DshFs {
  resolve(path: string): Promise<DshTarget>
  stat(target: DshTarget): Promise<{ type: string }>
  listDir(target: DshTarget): Promise<DshDirEntry[]>
  readText(target: DshTarget): Promise<string>
}

export interface DshLlmModel {
  id: string
}

export interface DshProvider {
  id: string
}

export interface DshModelSelection {
  provider: string
  model: string
}

export interface DshStreamChunk {
  type?: string
  text?: string
  reason?: any
}

export interface DshLlm {
  listProviders(): DshProvider[]
  listModels(providerId: string): Promise<DshLlmModel[]>
  stream(options: Record<string, unknown>): AsyncIterable<DshStreamChunk>
}

export interface DshDefaultModel {
  currentSelection(): DshModelSelection | null
}

export interface DshSessionHeader {
  cwd?: string
}

export interface DshSession {
  header?: DshSessionHeader
}

export interface DshSessions {
  get(id: string): DshSession | null | undefined
}

export interface DshWebServerRegisterDesc {
  kind: string
  path: string
  handler(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void | Promise<void>
}

export interface DshCtx {
  effect(fn: () => void | (() => void), label?: string): void
  get<T = any>(key: string): T
  webServer: {
    register(desc: DshWebServerRegisterDesc): () => void
  }
}

/** 浏览器半注入上下文（lib/client.js）：slots 槽位注册 + timer 定时器 */
export interface DshClientCtx {
  effect(fn: () => void | (() => void), label?: string): void
  get<T = any>(key: string): T
  slots: {
    inject(name: string, register: unknown): void
    register(desc: Record<string, unknown>, render: unknown): unknown
  }
}
