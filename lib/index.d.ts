// Type declarations for @lidaxi/prompt-enhance (Host half).
// 与 lib/index.js 的导出保持一致；纯声明文件，无运行时影响。
//
// 假设：DSH 的服务类型（ctx / fs / llm / sessions 等）未在本包内提供类型包，
// 此处以 unknown / 最小结构占位；接入 DSH 官方类型后可收紧。

export const name: string
export const inject: string[]

export interface PromptEnhanceCandidate {
  provider: string
  model: string
}

// 保留字面量补全，同时允许任意字符串（网关能力各不相同）
export type PromptEnhanceEffort = 'off' | 'low' | 'high' | 'max' | 'none' | (string & {})

export interface PromptEnhanceModeOverrides {
  label?: string
  needsContext?: boolean
  depth?: number
  treeLines?: number
  treeChars?: number
  fileChars?: number
  contentChars?: number
  historyTurns?: number
  historyChars?: number
  maxTokens?: number
  temperature?: number
  effort?: PromptEnhanceEffort
  extra?: string
}

export interface PromptEnhanceConfig {
  /** 候选模型链长度上限（1-6，默认 3） */
  maxAttempts?: number
  /** 固定候选链（前置优先于会话默认模型） */
  candidates?: PromptEnhanceCandidate[]
  /** false 时不再自动从已注册 provider 补足候选（默认 true） */
  autoFill?: boolean
  /** 完整替换内置系统提示词（默认使用内置） */
  system?: string
  /** 按模式覆盖参数（label/needsContext/depth/treeLines/treeChars/fileChars/contentChars/maxTokens/temperature/effort/extra） */
  modes?: Partial<Record<'basic' | 'standard' | 'expert', PromptEnhanceModeOverrides>>
}

export interface ResolvedPromptEnhanceMode {
  id: string
  label: string
  needsContext: boolean
  depth: number
  treeLines: number
  treeChars: number
  fileChars: number
  contentChars: number
  historyTurns: number
  historyChars: number
  maxTokens: number
  temperature: number
  effort: string
  extra: string
}

export interface ResolvedPromptEnhanceConfig {
  maxAttempts: number
  candidates: PromptEnhanceCandidate[]
  autoFill: boolean
  system: string
  modes: Record<'basic' | 'standard' | 'expert', ResolvedPromptEnhanceMode>
}

/** 客户端提交的待确认回答（兼容 {question,answer} / {q,a} / {text,value}） */
export interface NormalizedAnswer {
  question: string
  answer: string
}

/** 流结束 reason 的契约形态（兼容字符串） */
export type StreamFinishReason =
  | string
  | { kind?: string; failure?: { code?: string; message?: string } }

export interface StreamAttemptResult {
  text?: string
  failed?: string
  code?: string | null
  canceled?: true
}

export interface CandidateAttemptResult {
  text?: string
  failed?: string
  canceled?: true
}

export interface SplitConfirmationResult {
  text: string
  confirmations: string
}

export function apply(ctx: unknown, config?: PromptEnhanceConfig): void
export function resolveConfig(raw?: PromptEnhanceConfig): ResolvedPromptEnhanceConfig
export function collectContext(fs: unknown, cwd: string, cfg: ResolvedPromptEnhanceMode, draft?: string): Promise<string | null>
export function collectHistory(session: unknown, cfg: ResolvedPromptEnhanceMode): string
export function buildSystem(mode: ResolvedPromptEnhanceMode, cfg: ResolvedPromptEnhanceConfig): string
export function normalizeAnswers(raw: unknown): NormalizedAnswer[]
export function buildReviseSystem(mode: ResolvedPromptEnhanceMode, cfg: ResolvedPromptEnhanceConfig): string
export function buildReviseUser(draft: string, enhanced: string, answers: NormalizedAnswer[], history?: string): string
export function buildUserMessage(
  mode: ResolvedPromptEnhanceMode,
  context: string,
  draft: string,
  answers: NormalizedAnswer[],
  baseEnhanced: string,
  history?: string,
): string
export function collectCandidates(
  llm: unknown,
  defaultModel: unknown,
  cfg: ResolvedPromptEnhanceConfig,
): Promise<PromptEnhanceCandidate[]>
export function reasonKind(reason: StreamFinishReason | null | undefined): string
export function reasonCode(reason: StreamFinishReason | null | undefined): string
export function reasonMessage(reason: StreamFinishReason | null | undefined): string
export function streamAttempt(
  llm: unknown,
  candidate: PromptEnhanceCandidate,
  system: string,
  user: string,
  cfg: ResolvedPromptEnhanceMode,
  effort?: string,
  signal?: AbortSignal,
): Promise<StreamAttemptResult>
export function attemptCandidate(
  llm: unknown,
  candidate: PromptEnhanceCandidate,
  system: string,
  user: string,
  mode: ResolvedPromptEnhanceMode,
  signal?: AbortSignal,
): Promise<CandidateAttemptResult>
export function splitConfirmations(enhanced: string): SplitConfirmationResult
