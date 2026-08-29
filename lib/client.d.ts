// Type declarations for @lidaxi/prompt-enhance client half (browser).
// 与 lib/client.js 的 exports 保持一致；纯声明文件，无运行时影响。

export interface ConfirmItem {
  question: string
}

export interface EnhanceHistoryEntry {
  ts: number
  mode: string
  original: string
  enhanced: string
  confirmations: string
}

/** 应用入口（浏览器端 Cordis 插件） */
export function apply(ctx: unknown): void
export const inject: string[]

/** 解析模型输出的待确认清单为逐条问题 */
export function parseConfirmations(raw: string): ConfirmItem[]

/** 把 Host 错误码映射为用户可操作提示 */
export function friendlyError(code: string | null | undefined, fallback?: string | null): string

/** 全部错误码 → 友好提示映射 */
export const ERR_HINTS: Record<string, string>

/** 三种增强模式定义 */
export const MODES: { id: string; label: string; hint: string }[]

/** 追加一条增强历史（每次成功增强/修订后调用），返回当前条数 */
export function pushHistory(entry: EnhanceHistoryEntry): number

/** 返回历史快照（新 → 旧，#1 为最新） */
export function listHistory(): EnhanceHistoryEntry[]

/** 清空会话内历史 */
export function clearHistory(): void
