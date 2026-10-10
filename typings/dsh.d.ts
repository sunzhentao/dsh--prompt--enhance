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
  /** live Session 的模型视角消息派生（会话历史上下文用；老版本可能不存在） */
  deriveMessages?(): unknown[]
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

/** 浏览器半注入上下文（lib/client.js）：slots 槽位注册 + timer 定时器（可能取不到） */
export interface DshClientCtx {
  effect(fn: () => void | (() => void), label?: string): void
  get<T = any>(key: string): T
  slots: {
    inject(name: string, register: unknown): void
    register(desc: Record<string, unknown>, render: unknown): unknown
  }
}

/** 会话输入态快照（DSH `useInput` 选择器钩子的取值） */
export interface DshInputState {
  phase?: string
  draft?: string
}

/** 会话输入写入面（`conversation.input.*` 槽位的 `inputActions` prop） */
export interface DshInputActions {
  setDraft(text: string): void
}

/**
 * `conversation.input.right` 等输入槽位的组件 props。
 * 0.1.2-rc.1 起 owner props 为空，输入态经 `useInput` 标准钩子提供；
 * 0.1.1 及更早宿主把 `{ session, input }` 作为 owner prop 传入（保留兼容）。
 */
export interface DshInputSlotProps {
  sessionId?: string
  inputActions?: DshInputActions
  /** 0.1.2-rc.1 起：session 标准选择器钩子（仅可在渲染期调用） */
  useInput?: <T = DshInputState>(select?: (state: DshInputState) => T) => T
  /** ≤0.1.1 旧契约的 owner prop */
  input?: DshInputState
}
