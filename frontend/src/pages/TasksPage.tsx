import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import Pagination from '../components/Pagination'
import '../components/Pagination.css'
import Empty from '../components/Empty'
import './TasksPage.css'

interface Task {
  id: string
  name: string
  keywords: string[]
  status: string
  consecutive_failures: number
  updated_at: string
}

interface TaskSummary {
  task_id: string
  today_new: number
  today_basic: number
  today_low: number
  success_rate_7d: number
  last_run_time: string | null
  last_run_status: string | null
  last_run_duration_ms: number | null
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
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [summaryMap, setSummaryMap] = useState<Record<string, TaskSummary>>({})

  const load = async () => {
    setLoading(true)
    const [taskRes, metricsRes] = await Promise.all([
      api.get(`/api/tasks?page=${page}&page_size=${pageSize}&status=${status}&q=${encodeURIComponent(q)}`),
      api.get('/api/metrics/overview'),
    ])
    setTasks(taskRes.data.items)
    setTotal(taskRes.data.total || 0)
    setMetrics(metricsRes.data)
    const ids = (taskRes.data.items || []).map((t: Task) => t.id).join(',')
    if (ids) {
      const summaryRes = await api.get(`/api/tasks/summary?ids=${ids}`)
      const map: Record<string, TaskSummary> = {}
      ;(summaryRes.data.items || []).forEach((item: TaskSummary) => {
        map[item.task_id] = item
      })
      setSummaryMap(map)
    } else {
      setSummaryMap({})
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [page, pageSize, status])

  const search = () => {
    setPage(1)
    load()
  }

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

  const cloneTask = async (task: Task) => {
    await api.post(`/api/tasks/${task.id}/clone`)
    await load()
  }

  const deleteTask = async (task: Task) => {
    const confirmName = window.prompt(`请输入任务名以确认删除：${task.name}`)
    if (confirmName !== task.name) return
    await api.delete(`/api/tasks/${task.id}`)
    await load()
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
        <div className='task-filters'>
          <input placeholder='搜索任务名/关键词' value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value=''>全部状态</option>
            <option value='enabled'>启用</option>
            <option value='disabled'>停用</option>
          </select>
          <button className='btn ghost' onClick={search}>搜索</button>
        </div>

        {loading && <Empty label='加载中...' />}
        {!loading && tasks.length === 0 && <Empty label='暂无任务' />}
        {!loading && tasks.map((task) => (
          <div key={task.id} className='task-card'>
            <div className='task-top'>
              <div>
                <h3>{task.name}</h3>
                <p>关键词：{task.keywords.join(' / ')}</p>
              </div>
              <span className={`pill ${task.status}`}>{task.status === 'enabled' ? '启用' : '停用'}</span>
            </div>
            <div className='task-metrics'>
              <span>今日新增 {summaryMap[task.id]?.today_new ?? 0}</span>
              <span>今日爆款 {summaryMap[task.id]?.today_basic ?? 0}</span>
              <span>低粉爆款 {summaryMap[task.id]?.today_low ?? 0}</span>
              <span>近7天成功率 {summaryMap[task.id]?.success_rate_7d ?? 0}%</span>
            </div>
            <div className='task-meta'>
              <span>连续失败：{task.consecutive_failures}</span>
              <span>更新：{dayjs(task.updated_at).format('MM-DD HH:mm')}</span>
              <span>最近运行：{summaryMap[task.id]?.last_run_time ? dayjs(summaryMap[task.id]?.last_run_time).format('MM-DD HH:mm') : '-'}</span>
              <span>状态：{summaryMap[task.id]?.last_run_status || '-'}</span>
            </div>
            <div className='task-actions'>
              <button className='btn ghost' onClick={() => runNow(task.id)}>立即运行</button>
              <button className='btn ghost' onClick={() => dryRun(task)}>试跑</button>
              <Link className='btn ghost' to={`/tasks/${task.id}/edit`}>编辑</Link>
              <Link className='btn ghost' to={`/tasks/${task.id}/runs`}>运行记录</Link>
              <button className='btn ghost' onClick={() => toggle(task)}>{task.status === 'enabled' ? '停用' : '启用'}</button>
              <button className='btn ghost' onClick={() => cloneTask(task)}>复制</button>
              <button className='btn ghost danger' onClick={() => deleteTask(task)}>删除</button>
            </div>
          </div>
        ))}
      </section>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

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
