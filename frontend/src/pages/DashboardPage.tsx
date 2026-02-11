import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import './DashboardPage.css'

interface TrendPoint {
  date: string
  new_videos: number
  basic_hot: number
  low_fan_hot: number
  runs: number
  success_runs: number
}

interface TaskRankItem {
  task_id: string
  task_name: string
  videos: number
  basic_hot: number
  low_fan_hot: number
}

export default function DashboardPage() {
  const [days, setDays] = useState(7)
  const [series, setSeries] = useState<TrendPoint[]>([])
  const [rank, setRank] = useState<TaskRankItem[]>([])

  const load = async () => {
    const [trendRes, rankRes] = await Promise.all([
      api.get(`/api/metrics/trends?days=${days}`),
      api.get(`/api/metrics/task_rank?days=${days}`),
    ])
    setSeries(trendRes.data.series || [])
    setRank(rankRes.data.items || [])
  }

  useEffect(() => {
    load()
  }, [days])

  const maxNew = useMemo(() => Math.max(1, ...series.map((i) => i.new_videos)), [series])
  const maxHot = useMemo(() => Math.max(1, ...series.map((i) => i.basic_hot)), [series])
  const maxLow = useMemo(() => Math.max(1, ...series.map((i) => i.low_fan_hot)), [series])

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>数据看板</h1>
          <p>近 {days} 天抓取与爆款趋势、任务产出排名。</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>近7天</option>
          <option value={14}>近14天</option>
          <option value={30}>近30天</option>
        </select>
      </header>

      <section className='trend-grid'>
        <div className='trend-card'>
          <h3>新增视频</h3>
          <div className='bars'>
            {series.map((item) => (
              <div key={item.date} className='bar-item'>
                <div className='bar' style={{ height: `${(item.new_videos / maxNew) * 100}%` }} />
                <span>{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className='trend-card'>
          <h3>基础爆款</h3>
          <div className='bars'>
            {series.map((item) => (
              <div key={item.date} className='bar-item'>
                <div className='bar hot' style={{ height: `${(item.basic_hot / maxHot) * 100}%` }} />
                <span>{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className='trend-card'>
          <h3>低粉爆款</h3>
          <div className='bars'>
            {series.map((item) => (
              <div key={item.date} className='bar-item'>
                <div className='bar low' style={{ height: `${(item.low_fan_hot / maxLow) * 100}%` }} />
                <span>{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className='rank-card'>
        <h3>任务产出排行</h3>
        <div className='rank-table'>
          <div className='rank-header'>
            <span>任务</span>
            <span>视频数</span>
            <span>爆款</span>
            <span>低粉爆款</span>
          </div>
          {rank.map((item) => (
            <div key={item.task_id} className='rank-row'>
              <span>{item.task_name}</span>
              <span>{item.videos}</span>
              <span>{item.basic_hot}</span>
              <span>{item.low_fan_hot}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
