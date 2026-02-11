import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import './TasksPage.css'

interface Task {
  id: string
  name: string
  keywords: string[]
  status: string
  consecutive_failures: number
  updated_at: string
}

interface Metrics {
  today_new_videos: number
  today_basic_hot: number
  today_low_fan_hot: number
  failed_tasks: number
  success_rate: number
  last_run_time: string | null
}

interface PreviewSample {
  bvid: string
  title: string
  up_name: string
  publish_time: string | null
  stats: { views: number; fav: number; coin: number; reply: number }
  tags: { basic_hot: { is_hit: boolean }; low_fan_hot: { is_hit: boolean } }
}

interface PreviewResult {
  task_name: string
  counts: {
    fetched: number
    deduped: number
    basic_hot: number
    low_fan_hot: number
    failed_items: number
  }
  samples: PreviewSample[]
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)

  const load = async () => {
    const [taskRes, metricsRes] = await Promise.all([
      api.get('/api/tasks?page=1&page_size=50'),
      api.get('/api/metrics/overview'),
    ])
    setTasks(taskRes.data.items)
    setMetrics(metricsRes.data)
  }

  useEffect(() => {
    load()
  }, [])

  const runNow = async (id: string) => {
    await api.post(`/api/tasks/${id}/run`)
    await load()
  }

  const toggle = async (task: Task) => {
    const endpoint = task.status === 'enabled' ? 'disable' : 'enable'
    await api.post(`/api/tasks/${task.id}/${endpoint}`)
    await load()
  }

  const dryRun = async (task: Task) => {
    const res = await api.post(`/api/tasks/${task.id}/dry-run?limit=10`)
    setPreview({
      task_name: task.name,
      counts: res.data.counts,
      samples: res.data.samples || [],
    })
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>任务管理</h1>
          <p>每天定时抓取并筛选爆款/低粉带货爆款。</p>
        </div>
        <Link to='/tasks/new' className='btn primary'>新建任务</Link>
      </header>

      {metrics && (
        <section className='metrics'>
          <div className='metric-card'>
            <span>今日新增</span>
            <strong>{metrics.today_new_videos}</strong>
          </div>
          <div className='metric-card'>
            <span>今日爆款</span>
            <strong>{metrics.today_basic_hot}</strong>
          </div>
          <div className='metric-card'>
            <span>低粉爆款</span>
            <strong>{metrics.today_low_fan_hot}</strong>
          </div>
          <div className='metric-card'>
            <span>失败任务</span>
            <strong>{metrics.failed_tasks}</strong>
          </div>
          <div className='metric-card'>
            <span>近7天成功率</span>
            <strong>{metrics.success_rate}%</strong>
          </div>
          <div className='metric-card'>
            <span>最近运行</span>
            <strong>{metrics.last_run_time ? dayjs(metrics.last_run_time).format('MM-DD HH:mm') : '-'}</strong>
          </div>
        </section>
      )}

      <section className='task-list'>
        {tasks.map((task) => (
          <div key={task.id} className='task-card'>
            <div className='task-top'>
              <div>
                <h3>{task.name}</h3>
                <p>关键词：{task.keywords.join(' / ')}</p>
              </div>
              <span className={`pill ${task.status}`}>{task.status === 'enabled' ? '启用' : '停用'}</span>
            </div>
            <div className='task-meta'>
              <span>连续失败：{task.consecutive_failures}</span>
              <span>更新：{dayjs(task.updated_at).format('MM-DD HH:mm')}</span>
            </div>
            <div className='task-actions'>
              <button className='btn ghost' onClick={() => runNow(task.id)}>立即运行</button>
              <button className='btn ghost' onClick={() => dryRun(task)}>试跑</button>
              <Link className='btn ghost' to={`/tasks/${task.id}/edit`}>编辑</Link>
              <Link className='btn ghost' to={`/tasks/${task.id}/runs`}>运行记录</Link>
              <button className='btn ghost' onClick={() => toggle(task)}>{task.status === 'enabled' ? '停用' : '启用'}</button>
            </div>
          </div>
        ))}
      </section>

      {preview && (
        <section className='preview-panel'>
          <div className='preview-header'>
            <h3>试跑结果：{preview.task_name}</h3>
            <button className='btn ghost' onClick={() => setPreview(null)}>关闭</button>
          </div>
          <div className='preview-metrics'>
            <span>抓取 {preview.counts.fetched}</span>
            <span>去重 {preview.counts.deduped}</span>
            <span>爆款 {preview.counts.basic_hot}</span>
            <span>低粉爆款 {preview.counts.low_fan_hot}</span>
            <span>失败 {preview.counts.failed_items}</span>
          </div>
          <div className='preview-list'>
            {preview.samples.map((item) => (
              <div key={item.bvid} className='preview-item'>
                <div>
                  <h4>{item.title}</h4>
                  <p>{item.up_name} · 播放 {item.stats.views}</p>
                </div>
                <div className='preview-tags'>
                  {item.tags.basic_hot.is_hit && <span className='pill hot'>爆款</span>}
                  {item.tags.low_fan_hot.is_hit && <span className='pill low'>低粉爆款</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
