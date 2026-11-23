import { useState } from 'react'
import type { ApiConfig } from '../types'
import { chatOnce } from '../api'

interface Props {
  defaultBase: string
  defaultModel: string
  /** 已保存的配置（改设置时预填；Key 留空则沿用旧 Key） */
  existing?: ApiConfig | null
  onSave: (c: ApiConfig) => void
  onCancel?: () => void
  /** 进入离线演示（不连网关，回放预录脚本） */
  onDemo?: () => void
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; model: string }
  | { status: 'fail'; msg: string }

export function SetupCard({ defaultBase, defaultModel, existing, onSave, onCancel, onDemo }: Props) {
  const [base, setBase] = useState(existing?.baseURL ?? defaultBase)
  const [key, setKey] = useState('')
  const [model, setModel] = useState(existing?.model ?? defaultModel)
  const [err, setErr] = useState('')
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  const keepOldKey = !!existing?.apiKey

  const makeCfg = (): ApiConfig | null => {
    const useKey = key.trim() || existing?.apiKey || ''
    if (!base.trim() || !useKey) {
      setErr(keepOldKey ? '地址要填。' : '地址和 Key 都要填。')
      return null
    }
    setErr('')
    return {
      baseURL: base.trim().replace(/\/+$/, ''),
      apiKey: useKey,
      model: model.trim() || defaultModel,
    }
  }

  const submit = () => {
    const c = makeCfg()
    if (c) onSave(c)
  }

  const runTest = async () => {
    const c = makeCfg()
    if (!c) return
    setTest({ status: 'testing' })
    try {
      await chatOnce(c, [{ role: 'user', content: '回应一个字：好' }])
      setTest({ status: 'ok', model: c.model })
    } catch (e) {
      setTest({ status: 'fail', msg: (e as Error).message })
    }
  }

  return (
    <div className="setup-card">
      <h2>{existing ? '修改连接设置' : '连接你的模型网关'}</h2>
      <p className="hint">
        Key 只存在你自己的浏览器 localStorage，不会上传到任何服务器。
        {keepOldKey && ' Key 留空即沿用已保存的那个。'}
      </p>
      <label>
        网关地址
        <input value={base} onChange={e => setBase(e.target.value)} placeholder="https://di.whu.edu.cn/api/v3" />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder={keepOldKey ? '留空 = 沿用已保存的 Key' : 'sk-...'}
          autoComplete="off"
        />
      </label>
      <label>
        模型
        <input value={model} onChange={e => setModel(e.target.value)} placeholder="deepseek-v4-flash" />
      </label>
      {err && <p className="error">{err}</p>}
      {test.status === 'ok' && <p className="ok-text">连接正常，模型 {test.model} 可用。</p>}
      {test.status === 'fail' && <p className="error">连接失败：{test.msg}</p>}
      <div className="setup-actions">
        <button className="primary" onClick={submit}>
          {existing ? '保存' : '开始使用'}
        </button>
        <button className="ghost" onClick={runTest} disabled={test.status === 'testing'}>
          {test.status === 'testing' ? '测试中…' : '测试连接'}
        </button>
        {onCancel && (
          <button className="ghost" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
      {onDemo && !existing && (
        <p className="hint demo-entry">
          没有 Key 也能先看看？
          <button className="link-btn" onClick={onDemo}>
            进入离线演示
          </button>
          （回复是预录的，不连网关）
        </p>
      )}
    </div>
  )
}
