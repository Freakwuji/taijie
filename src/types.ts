// ============ 领域模型 ============

/** 提示阶梯：1=方向提示(不给代码) 2=伪代码思路 3=最小修复 */
export type Level = 1 | 2 | 3

/** 界面主阶段 */
export type Phase = 'setup' | 'idle' | 'working' | 'hint' | 'variant'

/** 一条对话消息。kind 标记消息在生产流程中的角色。 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind: 'submit' | 'hint' | 'variant' | 'error' | 'system'
  level?: Level
  /** 分类标签，例如 "空值访问错误"。assistant 分类消息才会带。 */
  category?: string
  ts: number
}

/** 单个错误的统计记录 */
export interface ErrorStat {
  category: string
  /** 该类型共求助次数 */
  count: number
  /** 平均用到第几级提示（1~3）；由 levelSum / count 计算，仅作展示快照 */
  avgLevel: number
  /** 各次求助用到级别之和（精确累计，避免逐次取整的偏差） */
  levelSum?: number
  lastTs: number
}

/** 全量本地统计 */
export type Stats = Record<string, ErrorStat>

/** API Key 与模型配置（localStorage 持久化） */
export interface ApiConfig {
  baseURL: string
  apiKey: string
  model: string
}

// ============ 网关协议 ============

/** 发给网关的消息参数 */
export interface ChatMsgParam {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** OpenAI 兼容的 chat.completion 请求体（精简版，只发网关收的字段） */
export interface ChatRequest {
  model: string
  messages: ChatMsgParam[]
  max_tokens: number
  stream: boolean
  temperature?: number
}

/** 流式返回的 SSE 数据块 */
export interface StreamChunk {
  content: string
  done: boolean
  error?: string
}
