import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiConfig, ChatMessage, ChatMsgParam, Level, Phase, Stats } from './types'
import { streamChat, fetchModels, DEFAULT_BASE, DEFAULT_MODEL } from './api'
import {
  buildSubmitMessages,
  buildUpgradeMessage,
  buildVariantMessage,
  buildCheckVariantMessages,
  extractCategory,
} from './prompts'
import { configStore, demoStore, historyStore, statsStore } from './storage'
import { demoStream, DEMO_CODE, DEMO_ERROR } from './demo'
import { SetupCard } from './components/SetupCard'
import { InputPanel } from './components/InputPanel'
import { ChatPanel } from './components/ChatPanel'
import { StatsPanel } from './components/StatsPanel'

let uid = 0
const nextId = () => `m-${Date.now()}-${++uid}`

/** 无响应看门狗：这么久没收到新字符就判定卡住 */
const STALL_MS = 35000
/** 统计里分类缺失时的兜底桶 */
const UNCLASSIFIED = '未归类'

interface Session {
  category?: string
  recordedLevel: number
  historyId?: string
}

export default function App() {
  const [cfg, setCfg] = useState<ApiConfig | null>(() => configStore.get())
  const [phase, setPhase] = useState<Phase>(() => (configStore.get() ? 'idle' : 'setup'))
  const [editingKey, setEditingKey] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [stats, setStats] = useState<Stats>(() => statsStore.get())
  const [models, setModels] = useState<string[]>([])
  const [demo, setDemo] = useState<boolean>(() => demoStore.get())
  const [lastCategory, setLastCategory] = useState<string | undefined>()
  const abortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<Session>({ recordedLevel: 0 })

  const lastAssistant = useMemo(
    () => [...messages].reverse().find(m => m.role === 'assistant'),
    [messages],
  )
  const variantQuestion = useMemo(() => {
    const v = [...messages].reverse().find(m => m.kind === 'variant')
    return v?.content
  }, [messages])

  useEffect(() => {
    if (!cfg || demo) return
    let alive = true
    fetchModels(cfg).then(list => {
      if (!alive) return
      setModels(list)
      // 只在没选模型时才补默认值，绝不悄悄改掉用户的选择
      if (list.length > 0 && !cfg.model) {
        const fixed = { ...cfg, model: list[0] }
        configStore.set(fixed)
        setCfg(fixed)
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.baseURL, cfg?.apiKey])

  const pushMessage = useCallback((m: Omit<ChatMessage, 'id' | 'ts'>) => {
    setMessages(prev => [...prev, { ...m, id: nextId(), ts: Date.now() }])
  }, [])

  const runStream = useCallback(
    async (msgs: ChatMsgParam[], kind: ChatMessage['kind'], level?: Level): Promise<string> => {
      if (!cfg && !demo) return ''
      setPhase('working')
      const controller = new AbortController()
      abortRef.current = controller
      pushMessage({ role: 'assistant', content: '', kind, level })
      let acc = ''
      // 用对象包一层：闭包里的赋值不会被 TS 的类型收窄吃掉
      const st: { v: 'abort' | 'stall' | 'error' | null } = { v: null }

      // 看门狗：每次收到内容就重置计时
      let lastBeat = Date.now()
      const watchdog = window.setInterval(() => {
        if (Date.now() - lastBeat > STALL_MS) {
          st.v = 'stall'
          controller.abort()
        }
      }, 5000)

      try {
        const source = demo ? demoStream(msgs, controller.signal) : streamChat(cfg!, msgs, controller.signal)
        for await (const chunk of source) {
          lastBeat = Date.now()
          acc += chunk.content
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant' || last.kind !== kind) return prev
            return [...prev.slice(0, -1), { ...last, content: acc }]
          })
          if (chunk.done) break
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          if (!st.v) st.v = 'abort'
        } else {
          st.v = 'error'
          pushMessage({
            role: 'assistant',
            content: `⚠ 调用失败：${(e as Error).message}`,
            kind: 'error',
          })
        }
      } finally {
        window.clearInterval(watchdog)
      }
      const stopped = st.v

      // 超时/中止时留一句可读的收尾，避免气泡永远空着
      if (stopped === 'stall') {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant' || last.kind !== kind) return prev
          const note = acc
            ? `${acc}\n\n〔超时了，先停在这。重新点一次可以接着问。〕`
            : '〔等太久没收到响应。检查一下 Key、模型名或者网络，再试一次。〕'
          return [...prev.slice(0, -1), { ...last, content: note }]
        })
      }
      if (stopped === 'abort' && !acc) {
        // 用户手动停、且一个字都没生成：把这枚空气泡撤掉
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant' || last.kind !== kind || last.content) return prev
          return prev.slice(0, -1)
        })
      }

      if (abortRef.current === controller) {
        abortRef.current = null
        setPhase(prev => {
          if (stopped) return 'idle'
          // 变式题生成完仍留在变式态，方便接着作答
          if (kind === 'variant') return 'variant'
          return prev === 'working' ? 'hint' : prev
        })
      }
      return acc
    },
    [cfg, pushMessage],
  )

  /** 提交：分类 + L1 */
  const handleSubmit = useCallback(
    async (code: string, error: string) => {
      if (!code.trim() && !error.trim()) return
      pushMessage({
        role: 'user',
        content: `代码：\n\`\`\`\n${code || '（只贴了报错）'}\n\`\`\`\n报错：${error || '（没贴报错）'}`,
        kind: 'submit',
      })
      sessionRef.current = { recordedLevel: 0 }
      const historyId = `h-${Date.now()}-${++uid}`
      historyStore.add({ id: historyId, code, error, levelsUsed: 1, solved: false, ts: Date.now() })
      sessionRef.current.historyId = historyId

      const acc = await runStream(buildSubmitMessages({ code, error }), 'hint', 1)
      const cat = extractCategory(acc)
      if (cat) {
        setLastCategory(cat)
        sessionRef.current.category = cat
        statsStore.record(cat, 1)
        sessionRef.current.recordedLevel = 1
        historyStore.patch(historyId, { category: cat })
      } else if (acc) {
        // 模型漏了分类标签：归入兜底桶，避免统计静默丢记录
        statsStore.record(UNCLASSIFIED, 1)
        sessionRef.current.recordedLevel = 1
      }
      setStats(statsStore.get())
    },
    [pushMessage, runStream],
  )

  /** 升一级 */
  const handleUpgrade = useCallback(
    async (target: 2 | 3) => {
      if (!lastAssistant) return
      const hist: ChatMsgParam[] = messages
        .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
          (m.role === 'user' || m.role === 'assistant') && m.kind !== 'error',
        )
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-12)
      const acc = await runStream([...hist, buildUpgradeMessage(target)], 'hint', target)

      let cat = sessionRef.current.category ?? lastCategory
      if (!cat) {
        cat = extractCategory(acc) ?? UNCLASSIFIED
        setLastCategory(cat === UNCLASSIFIED ? undefined : cat)
        sessionRef.current.category = cat === UNCLASSIFIED ? undefined : cat
      }
      if (sessionRef.current.recordedLevel === 0) {
        statsStore.record(cat, target)
        sessionRef.current.recordedLevel = target
      } else if (target > sessionRef.current.recordedLevel) {
        statsStore.bump(cat, target - sessionRef.current.recordedLevel)
        sessionRef.current.recordedLevel = target
      }
      setStats(statsStore.get())
      if (sessionRef.current.historyId) {
        historyStore.patch(sessionRef.current.historyId, {
          category: cat === UNCLASSIFIED ? undefined : cat,
          levelsUsed: Math.max(target, 1),
        })
      }
    },
    [lastAssistant, messages, runStream, lastCategory],
  )

  /** 变体题 */
  const handleVariant = useCallback(async () => {
    if (!lastAssistant) return
    setPhase('variant')
    const summary = lastAssistant.content.slice(0, 400)
    await runStream([buildVariantMessage(summary)], 'variant')
  }, [lastAssistant, runStream])

  /** 提交变体题答案 → 批改 */
  const handleCheckAnswer = useCallback(
    async (answer: string) => {
      if (!variantQuestion || !answer.trim()) return
      pushMessage({ role: 'user', content: `我的答案：\n\`\`\`\n${answer}\n\`\`\``, kind: 'submit' })
      await runStream(buildCheckVariantMessages(variantQuestion, answer), 'system')
    },
    [variantQuestion, pushMessage, runStream],
  )

  /** 用户手动停止生成 */
  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleReset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setLastCategory(undefined)
    setPhase('idle')
    sessionRef.current = { recordedLevel: 0 }
  }, [])

  const handleSaveConfig = useCallback((c: ApiConfig) => {
    configStore.set(c)
    setCfg(c)
    setEditingKey(false)
    setPhase(prev => (prev === 'setup' && messages.length > 0 ? 'idle' : prev === 'setup' ? 'idle' : prev))
  }, [messages.length])

  const handleClearStats = useCallback(() => {
    statsStore.reset()
    historyStore.reset()
    setStats({})
  }, [])

  const handleSetModel = useCallback((m: string) => {
    setCfg(prev => {
      if (!prev) return prev
      const next = { ...prev, model: m }
      configStore.set(next)
      return next
    })
  }, [])

  /** 进入/退出离线演示 */
  const enterDemo = useCallback(() => {
    demoStore.set(true)
    setDemo(true)
    setEditingKey(false)
    setMessages([])
    setPhase('idle')
    sessionRef.current = { recordedLevel: 0 }
  }, [])

  const exitDemo = useCallback(() => {
    demoStore.set(false)
    setDemo(false)
    setMessages([])
    setPhase(configStore.get() ? 'idle' : 'setup')
    sessionRef.current = { recordedLevel: 0 }
  }, [])

  const showSetup = (!cfg || editingKey) && !demo

  return (
    <div className="app">
      <header className="app-header">
        <h1>台阶</h1>
        <span className="tagline">不给你答案的编程陪练</span>
        <div className="header-right">
          {demo ? (
            <button className="ghost" onClick={exitDemo}>
              退出演示
            </button>
          ) : (
            cfg &&
            !editingKey && (
              <>
                <span className="model-badge">{cfg.model || DEFAULT_MODEL}</span>
                <button className="ghost" onClick={() => setEditingKey(true)}>
                  改设置
                </button>
              </>
            )
          )}
        </div>
      </header>

      {demo && (
        <div className="demo-bar">
          离线演示模式：回复是预录的，不连网关、不消耗额度。下面这套流程和真实使用完全一样，直接点「开始求助」。
        </div>
      )}

      {showSetup ? (
        <SetupCard
          defaultBase={DEFAULT_BASE}
          defaultModel={DEFAULT_MODEL}
          existing={cfg}
          onSave={handleSaveConfig}
          onCancel={cfg ? () => setEditingKey(false) : undefined}
          onDemo={enterDemo}
        />
      ) : (
        <>
          <InputPanel
            disabled={phase === 'working'}
            variantMode={!!variantQuestion}
            initialCode={demo ? DEMO_CODE : ''}
            initialError={demo ? DEMO_ERROR : ''}
            onSubmit={handleSubmit}
            onCheckAnswer={handleCheckAnswer}
            onReset={handleReset}
          />
          <div className="main-grid">
            <ChatPanel
              messages={messages}
              phase={phase}
              models={demo ? [cfg?.model ?? DEFAULT_MODEL] : models}
              cfg={cfg ?? { baseURL: DEFAULT_BASE, apiKey: '', model: DEFAULT_MODEL }}
              onSetModel={handleSetModel}
              onUpgrade={handleUpgrade}
              onVariant={handleVariant}
              onStop={handleStop}
              readOnlyModel={demo}
            />
            <StatsPanel stats={stats} onClear={handleClearStats} />
          </div>
        </>
      )}
    </div>
  )
}
