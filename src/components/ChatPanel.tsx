import { useEffect, useRef, useState } from 'react'
import type { ApiConfig, ChatMessage, Phase } from '../types'
import { looksLikeLeak } from '../prompts'

interface Props {
  messages: ChatMessage[]
  phase: Phase
  models: string[]
  cfg: ApiConfig
  onSetModel: (m: string) => void
  onUpgrade: (target: 2 | 3) => void
  onVariant: () => void
  onStop: () => void
  /** 演示模式：模型下拉置灰 */
  readOnlyModel?: boolean
}

export function ChatPanel({
  messages,
  phase,
  models,
  cfg,
  onSetModel,
  onUpgrade,
  onVariant,
  onStop,
  readOnlyModel = false,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const lastHint = [...messages].reverse().find(m => m.kind === 'hint' && m.role === 'assistant')
  const usedLevel = lastHint?.level ?? 1
  const busy = phase === 'working'
  const canUpgrade = !!lastHint && usedLevel < 3 && !busy
  const nextLevel = Math.min(usedLevel + 1, 3) as 2 | 3

  return (
    <section className="chat-panel">
      <div className="chat-toolbar">
        <span className="model-picker">
          模型：
          {readOnlyModel ? (
            <span className="model-static">{cfg.model}（演示）</span>
          ) : models.length > 0 ? (
            <select value={cfg.model} onChange={e => onSetModel(e.target.value)}>
              {!models.includes(cfg.model) && <option value={cfg.model}>{cfg.model}</option>}
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input value={cfg.model} onChange={e => onSetModel(e.target.value)} style={{ width: 180 }} />
          )}
        </span>
        {busy && (
          <span className="working-tip">
            台阶正在想…
            <button className="ghost tiny stop-btn" onClick={onStop}>停止</button>
          </span>
        )}
      </div>

      <div className="chat-scroll">
        {messages.length === 0 && (
          <div className="empty">
            <p>把代码和报错贴上去，点「开始求助」。</p>
            <p>台阶会先给你方向提示（L1），你卡住了再要下一级。</p>
          </div>
        )}
        {messages.map(m => (
          <MessageRow key={m.id} m={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-actions">
        <button className="primary" disabled={!canUpgrade} onClick={() => onUpgrade(nextLevel)}>
          {usedLevel === 1
            ? `卡住了？要 L${nextLevel} 提示`
            : usedLevel === 2
              ? '还是不行，要 L3 最小修复'
              : '已经是最后一级了'}
        </button>
        <button className="ghost" disabled={!lastHint || busy} onClick={onVariant}>
          出一道变式题检验我
        </button>
      </div>
    </section>
  )
}

function MessageRow({ m }: { m: ChatMessage }) {
  // L1/L2 里出现成品代码 → 默认折叠，逼学生先自己想
  const leaky = m.kind === 'hint' && !!m.level && m.level < 3 && looksLikeLeak(m.content)
  const [reveal, setReveal] = useState(false)

  return (
    <div className={`msg msg-${m.role} kind-${m.kind}`}>
      {m.kind === 'hint' && m.level && <span className={`badge lv${m.level}`}>L{m.level}</span>}
      {m.kind === 'variant' && <span className="badge variant">变体题</span>}
      {m.kind === 'error' && <span className="badge error-badge">错误</span>}
      <div className={`content${leaky && !reveal ? ' masked' : ''}`}>
        {renderContent(m.content, leaky && !reveal)}
      </div>
      {leaky && !reveal && (
        <div className="leak-tip">
          这条 L{m.level} 提示里带了成品的代码，已经帮你盖住了——不然这一步就白练了。
          <button className="ghost tiny" onClick={() => setReveal(true)}>我还是想看</button>
        </div>
      )}
    </div>
  )
}

/** 简易渲染：``` 代码块 → <pre>，其余按行文本。mask 时把代码块替换成遮罩。 */
function renderContent(text: string, mask = false): React.ReactNode {
  if (!text) return <span className="typing-cursor" />
  const parts = text.split(/```/)
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      if (mask) {
        return (
          <pre key={i} className="code-block masked-block">
            〔代码已隐藏〕
          </pre>
        )
      }
      return (
        <pre key={i} className="code-block">
          {p.replace(/^\w+\n/, '')}
        </pre>
      )
    }
    return (
      <p key={i} className="text-block">
        {p}
      </p>
    )
  })
}
