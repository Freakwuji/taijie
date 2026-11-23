// localStorage 封装：Key 配置、本地统计、会话历史。
import type { ApiConfig, ErrorStat, Stats } from './types'

const K_CONFIG = 'taijie.config.v1'
const K_STATS = 'taijie.stats.v1'
const K_HISTORY = 'taijie.history.v1'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储满/隐私模式下静默失败
  }
}

export const configStore = {
  get(): ApiConfig | null {
    return load<ApiConfig | null>(K_CONFIG, null)
  },
  set(cfg: ApiConfig) {
    save(K_CONFIG, cfg)
  },
  clear() {
    localStorage.removeItem(K_CONFIG)
  },
}

/** 离线演示模式开关（不连网关，回放预录脚本） */
const K_DEMO = 'taijie.demo.v1'
export const demoStore = {
  get(): boolean {
    try {
      if (new URLSearchParams(location.search).get('demo') === '1') return true
      return localStorage.getItem(K_DEMO) === '1'
    } catch {
      return false
    }
  },
  set(on: boolean) {
    try {
      if (on) localStorage.setItem(K_DEMO, '1')
      else localStorage.removeItem(K_DEMO)
    } catch {
      // 隐私模式下忽略
    }
  },
}

/** 由 levelSum/count 重算展示用的 avgLevel（兼容只存了 avgLevel 的旧数据） */
function normalize(e: ErrorStat): ErrorStat {
  const sum = e.levelSum ?? e.avgLevel * e.count
  return { ...e, levelSum: sum, avgLevel: e.count > 0 ? sum / e.count : 0 }
}

export const statsStore = {
  get(): Stats {
    const raw = load<Stats>(K_STATS, {})
    const out: Stats = {}
    for (const k of Object.keys(raw)) out[k] = normalize(raw[k])
    return out
  },
  save(s: Stats) {
    save(K_STATS, s)
  },
  /** 记一次「新求助」：同类错误 count +1，级别计入总量 */
  record(category: string, level: number) {
    const s = this.get()
    const prev = s[category]
    if (!prev) {
      s[category] = { category, count: 1, avgLevel: level, levelSum: level, lastTs: Date.now() }
    } else {
      prev.count += 1
      prev.levelSum = (prev.levelSum ?? 0) + level
      prev.avgLevel = prev.levelSum / prev.count
      prev.lastTs = Date.now()
    }
    this.save(s)
  },
  /**
   * 同一次求助内把「用到的最深级别」抬高（不增加 count）。
   * 用户在 L2 之后又要 L3，仍算一次求助，只是这次用得更深。
   * delta 由调用方算好（新最高级 - 本次已记级别）。
   */
  bump(category: string, delta: number) {
    if (delta <= 0) return
    const s = this.get()
    const prev = s[category]
    if (!prev) {
      s[category] = { category, count: 1, avgLevel: delta, levelSum: delta, lastTs: Date.now() }
      this.save(s)
      return
    }
    prev.levelSum = (prev.levelSum ?? 0) + delta
    prev.avgLevel = prev.levelSum / prev.count
    prev.lastTs = Date.now()
    this.save(s)
  },
  reset() {
    localStorage.removeItem(K_STATS)
  },
}

export interface HistoryEntry {
  id: string
  code: string
  error: string
  category?: string
  levelsUsed: number
  solved: boolean
  ts: number
}

export const historyStore = {
  get(): HistoryEntry[] {
    return load<HistoryEntry[]>(K_HISTORY, [])
  },
  add(e: HistoryEntry) {
    const list = this.get()
    list.unshift(e)
    save(K_HISTORY, list.slice(0, 50)) // 只留最近 50 条
  },
  /** 更新某条记录（例如结算「用到第几级 / 是否修好」） */
  patch(id: string, patch: Partial<HistoryEntry>) {
    const list = this.get()
    const i = list.findIndex(e => e.id === id)
    if (i < 0) return
    list[i] = { ...list[i], ...patch }
    save(K_HISTORY, list)
  },
  reset() {
    localStorage.removeItem(K_HISTORY)
  },
}
