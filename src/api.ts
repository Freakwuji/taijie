// 网关调用层：OpenAI 兼容流式聊天。只发网关实测接受的字段。
import type { ApiConfig, ChatRequest, StreamChunk } from './types'

export const DEFAULT_BASE = 'https://di.whu.edu.cn/api/v3'
export const DEFAULT_MODEL = 'deepseek-v4-flash'
export const MAX_TOKENS = 4096

/**
 * 流式调用 chat/completions。
 * 网关约束（实测）：不要发 reasoning_effort；max_tokens 上限按网关而定；
 * 不用工具时整个省略 tools 字段。空 tools 数组会 400。
 */
export async function* streamChat(
  cfg: ApiConfig,
  messages: ChatRequest['messages'],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const body: ChatRequest = {
    model: cfg.model || DEFAULT_MODEL,
    messages,
    max_tokens: MAX_TOKENS,
    stream: true,
  }

  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error?.message ?? JSON.stringify(j)
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(`网关返回 HTTP ${res.status}：${detail || '未知错误'}`)
  }
  if (!res.body) throw new Error('浏览器不支持流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    // 统一换行，兼容服务端 \r\n\r\n 分隔
    buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n?/g, '\n')
    const blocks = buf.split('\n\n')
    buf = blocks.pop() ?? ''
    for (const block of blocks) {
      // 一个事件可能有多行 data:，按规范拼接
      const payload = block
        .split('\n')
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trim())
        .join('')
      if (!payload) continue
      if (payload === '[DONE]') {
        yield { content: '', done: true }
        return
      }
      try {
        const j = JSON.parse(payload)
        const delta = j.choices?.[0]?.delta?.content ?? ''
        if (delta) yield { content: delta, done: false }
      } catch {
        // 忽略无法解析的中间事件
      }
    }
  }
  yield { content: '', done: true }
}

/** 同步把整段回复取回（用于无界面调试 / 未来非流式模式） */
export async function chatOnce(
  cfg: ApiConfig,
  messages: ChatRequest['messages'],
  signal?: AbortSignal,
): Promise<string> {
  const body: ChatRequest = { ...{ model: cfg.model || DEFAULT_MODEL, messages, max_tokens: MAX_TOKENS, stream: false } }
  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`网关返回 HTTP ${res.status}`)
  const j = await res.json()
  return j.choices?.[0]?.message?.content ?? ''
}

/** 取模型列表（失败时静默返回空，UI 回退默认模型） */
export async function fetchModels(cfg: ApiConfig): Promise<string[]> {
  try {
    const res = await fetch(`${cfg.baseURL}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    })
    if (!res.ok) return []
    const j = await res.json()
    const arr = Array.isArray(j?.data) ? j.data : []
    return arr.map((m: { id?: string }) => m.id).filter(Boolean) as string[]
  } catch {
    return []
  }
}
