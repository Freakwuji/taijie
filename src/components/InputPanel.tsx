import { useState } from 'react'

interface Props {
  disabled: boolean
  /** 已有变体题待作答：输入区切成「写答案」模式 */
  variantMode: boolean
  /** 初始内容（演示模式预填） */
  initialCode?: string
  initialError?: string
  onSubmit: (code: string, error: string) => void
  onCheckAnswer: (answer: string) => void
  onReset: () => void
}

export function InputPanel({
  disabled,
  variantMode,
  initialCode = '',
  initialError = '',
  onSubmit,
  onCheckAnswer,
  onReset,
}: Props) {
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState(initialError)
  const [answer, setAnswer] = useState('')

  const missing: string[] = []
  if (!variantMode) {
    if (!code.trim()) missing.push('代码')
    if (!error.trim()) missing.push('报错信息')
  } else if (!answer.trim()) {
    missing.push('你的答案')
  }
  const canSubmit = missing.length === 0 && !disabled

  const primaryLabel = disabled ? '思考中…' : variantMode ? '提交我的答案' : '开始求助'

  return (
    <section className="input-panel">
      {variantMode ? (
        <div className="field">
          <label>
            变式题作答 <span className="optional">（写出你会怎么改，不用完整可运行）</span>
          </label>
          <textarea
            className="code"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={'比如：先判断 users 里有没有这个人，没有就直接返回；\n有的话再取 name。'}
            rows={5}
            spellCheck={false}
          />
        </div>
      ) : (
        <>
          <div className="field">
            <label>
              你的代码 <span className="optional">（粘贴出问题的部分；只有报错也能交）</span>
            </label>
            <textarea
              className="code"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder={'function getUser(id) {\n  return users.find(u => u.id === id).name\n}\n'}
              rows={6}
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label>报错信息</label>
            <textarea
              value={error}
              onChange={e => setError(e.target.value)}
              placeholder={"TypeError: Cannot read properties of undefined (reading 'name')\n    at getUser (app.js:12)"}
              rows={3}
              spellCheck={false}
            />
          </div>
        </>
      )}
      <div className="actions">
        <button
          className="primary"
          disabled={!canSubmit}
          onClick={() => (variantMode ? onCheckAnswer(answer) : onSubmit(code, error))}
        >
          {primaryLabel}
        </button>
        {!canSubmit && !disabled && <span className="need-tip">还差：{missing.join('、')}</span>}
        <button className="ghost" onClick={onReset}>
          清空对话
        </button>
      </div>
    </section>
  )
}
