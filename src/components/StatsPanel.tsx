import { useState } from 'react'
import type { Stats } from '../types'

interface Props {
  stats: Stats
  onClear: () => void
}

export function StatsPanel({ stats, onClear }: Props) {
  const [confirming, setConfirming] = useState(false)
  const rows = Object.values(stats).sort((a, b) => b.count - a.count)
  const total = rows.reduce((s, r) => s + r.count, 0)
  const maxCount = rows.reduce((s, r) => Math.max(s, r.count), 1)
  const avgAll = total === 0 ? 0 : rows.reduce((s, r) => s + r.avgLevel * r.count, 0) / total

  return (
    <section className="stats-panel">
      <div className="stats-head">
        <h3>求助统计</h3>
        {confirming ? (
          <span className="confirm-row">
            <button className="ghost tiny danger" onClick={() => { onClear(); setConfirming(false) }}>
              确认清空
            </button>
            <button className="ghost tiny" onClick={() => setConfirming(false)}>算了</button>
          </span>
        ) : (
          <button className="ghost tiny" onClick={() => setConfirming(true)}>清空</button>
        )}
      </div>
      {total === 0 ? (
        <p className="dim">还没有求助记录。每问一次，这里就多一条。</p>
      ) : (
        <>
          <div className="stat-line">
            <span>总求助次数</span>
            <strong>{total}</strong>
          </div>
          <div className="stat-line">
            <span>平均用到第几级</span>
            <strong>L{avgAll.toFixed(1)} / 3</strong>
          </div>
          <p className="stat-note">
            这个数越低越好：L1 就是只给方向自己想出来，L3 是直接看最小修复。
            它衡量的是「你有多需要被扶」。
          </p>
          <div className="bar-list">
            {rows.map(r => (
              <div key={r.category} className="bar-row">
                <span className="bar-label" title={r.category}>{r.category}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                </div>
                <span className="bar-count">{r.count}</span>
                <span className="bar-lv">L{r.avgLevel.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
