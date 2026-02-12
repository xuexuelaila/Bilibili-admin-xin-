import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import Pagination from '../components/Pagination'
import '../components/Pagination.css'
import Empty from '../components/Empty'
import TagInput from '../components/TagInput'
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

function InfoTip({ text }: { text: string }) {
  return (
    <span className='info-tip' tabIndex={0} aria-label={text}>
      i
      <span className='info-bubble'>{text}</span>
    </span>
  )
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
  const [runningMap, setRunningMap] = useState<Record<string, number>>({})
  const timersRef = useRef<Record<string, number>>({})
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const basicHotTip = '爆款=命中基础爆款规则。默认：播放>=100000 或 收藏>=1500 或 投币>=500 或 评论>=200。以任务规则为准。'
  const lowFanTip = '低粉爆款=命中低粉规则。默认：粉丝<=50000、播放>=30000、收藏率>=0.012、投币率>=0.0025、评论率>=0.002、收藏/粉丝>=0.02（需全部满足）。以任务规则为准。'

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

  useEffect(() => {
    api.get('/api/tags').then((res) => setTagOptions(res.data.items || [])).catch(() => {})
  }, [])

  const search = () => {
    setPage(1)
    load()
  }

  const runNow = async (id: string) => {
    startProgress(id)
    try {
      await api.post(`/api/tasks/${id}/run`)
      await load()
      finishProgress(id, true)
    } catch {
      finishProgress(id, false)
      window.alert('运行失败，请稍后重试。')
    }
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

  const startProgress = (id: string) => {
    if (timersRef.current[id]) return
    setRunningMap((prev) => ({ ...prev, [id]: 5 }))
    timersRef.current[id] = window.setInterval(() => {
      setRunningMap((prev) => {
        const current = prev[id] ?? 0
        if (current >= 90) return prev
        const next = Math.min(90, current + Math.max(2, Math.round(Math.random() * 6)))
        return { ...prev, [id]: next }
      })
    }, 800)
  }

  const finishProgress = (id: string, ok: boolean) => {
    if (timersRef.current[id]) {
      window.clearInterval(timersRef.current[id])
      delete timersRef.current[id]
    }
    if (!ok) {
      setRunningMap((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      return
    }
    setRunningMap((prev) => ({ ...prev, [id]: 100 }))
    window.setTimeout(() => {
      setRunningMap((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, 800)
  }

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timerId) => window.clearInterval(timerId))
      timersRef.current = {}
    }
  }, [])

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
            <span className='metric-label'>
              今日爆款
              <InfoTip text={basicHotTip} />
            </span>
            <strong>{metrics.today_basic_hot}</strong>
          </div>
          <div className='metric-card'>
            <span className='metric-label'>
              低粉爆款
              <InfoTip text={lowFanTip} />
            </span>
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
              <span className='metric-inline'>
                今日爆款 {summaryMap[task.id]?.today_basic ?? 0}
                <InfoTip text={basicHotTip} />
              </span>
              <span className='metric-inline'>
                低粉爆款 {summaryMap[task.id]?.today_low ?? 0}
                <InfoTip text={lowFanTip} />
              </span>
              <span>近7天成功率 {summaryMap[task.id]?.success_rate_7d ?? 0}%</span>
            </div>
            <div className='task-meta'>
              <span>连续失败：{task.consecutive_failures}</span>
              <span>更新：{dayjs(task.updated_at).format('MM-DD HH:mm')}</span>
              <span>最近运行：{summaryMap[task.id]?.last_run_time ? dayjs(summaryMap[task.id]?.last_run_time).format('MM-DD HH:mm') : '-'}</span>
              <span>状态：{summaryMap[task.id]?.last_run_status || '-'}</span>
            </div>
            <div className='task-actions'>
              <button className='btn ghost' onClick={() => runNow(task.id)} disabled={runningMap[task.id] !== undefined}>立即运行</button>
              <button className='btn ghost' onClick={() => dryRun(task)}>试跑</button>
              <button className='btn ghost' onClick={() => setEditingTaskId(task.id)}>编辑</button>
              <Link className='btn ghost' to={`/tasks/${task.id}/runs`}>运行记录</Link>
              <button className='btn ghost' onClick={() => toggle(task)}>{task.status === 'enabled' ? '停用' : '启用'}</button>
              <button className='btn ghost' onClick={() => cloneTask(task)}>复制</button>
              <button className='btn ghost danger' onClick={() => deleteTask(task)}>删除</button>
            </div>
            {runningMap[task.id] !== undefined && (
              <div className='run-progress'>
                <div className='run-progress-bar' style={{ width: `${runningMap[task.id]}%` }} />
                <span>{runningMap[task.id] >= 100 ? '完成' : '运行中...'}</span>
              </div>
            )}
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

      {editingTaskId && (
        <TaskEditModal
          taskId={editingTaskId}
          tagOptions={tagOptions}
          onClose={() => setEditingTaskId(null)}
          onSaved={async () => {
            setEditingTaskId(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function TaskEditModal({
  taskId,
  tagOptions,
  onClose,
  onSaved,
}: {
  taskId: string
  tagOptions: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    keywords: '',
    exclude_words: '',
    tags: [] as string[],
    days_limit: 30,
    fetch_limit: 200,
    search_sort: 'relevance',
    schedule_time: '09:00',
  })

  useEffect(() => {
    api.get(`/api/tasks/${taskId}`).then((res) => {
      const task = res.data
      setForm({
        name: task.name || '',
        keywords: (task.keywords || []).join('\n'),
        exclude_words: (task.exclude_words || []).join('\n'),
        tags: task.tags || [],
        days_limit: task.scope?.days_limit ?? 30,
        fetch_limit: task.scope?.fetch_limit ?? 200,
        search_sort: task.scope?.search_sort ?? 'relevance',
        schedule_time: task.schedule?.time ?? '09:00',
      })
    })
  }, [taskId])

  const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    setSaving(true)
    const payload = {
      name: form.name,
      keywords: form.keywords.split(/\n|,|，/).map((k) => k.trim()).filter(Boolean),
      exclude_words: form.exclude_words.split(/\n|,|，/).map((k) => k.trim()).filter(Boolean),
      tags: form.tags,
      scope: {
        days_limit: Number(form.days_limit),
        fetch_limit: Number(form.fetch_limit),
        search_sort: form.search_sort,
      },
      schedule: {
        type: 'daily',
        time: form.schedule_time,
      },
    }
    await api.put(`/api/tasks/${taskId}`, payload)
    setSaving(false)
    await onSaved()
  }

  return (
    <div className='modal-mask' onClick={onClose}>
      <div className='modal-card' onClick={(e) => e.stopPropagation()}>
        <div className='modal-header'>
          <h3>编辑任务</h3>
          <button className='btn ghost' onClick={onClose}>关闭</button>
        </div>
        <div className='modal-body'>
          <div className='modal-grid'>
            <label>
              任务名
              <input value={form.name} onChange={(e) => update('name', e.target.value)} />
            </label>
            <label>
              每日运行时间
              <input type='time' value={form.schedule_time} onChange={(e) => update('schedule_time', e.target.value)} />
            </label>
          </div>
          <label>
            商品关键词（换行或逗号分隔）
            <textarea value={form.keywords} onChange={(e) => update('keywords', e.target.value)} />
          </label>
          <label>
            排除词（可选）
            <textarea value={form.exclude_words} onChange={(e) => update('exclude_words', e.target.value)} />
          </label>
          <label>
            视频标签（抓取后自动打标，换行或逗号分隔）
            <TagInput
              value={form.tags}
              suggestions={tagOptions}
              onChange={(tags) => update('tags', tags)}
              placeholder='输入标签，回车添加'
            />
          </label>
          <div className='modal-grid'>
            <label>
              近几天
              <input type='number' value={form.days_limit} onChange={(e) => update('days_limit', e.target.value)} />
            </label>
            <label>
              每次抓取上限
              <input type='number' value={form.fetch_limit} onChange={(e) => update('fetch_limit', e.target.value)} />
            </label>
            <label>
              搜索排序
              <select value={form.search_sort} onChange={(e) => update('search_sort', e.target.value)}>
                <option value='relevance'>综合</option>
                <option value='new'>最新</option>
                <option value='views'>最多播放</option>
              </select>
            </label>
          </div>
        </div>
        <div className='modal-footer'>
          <button className='btn ghost' onClick={onClose}>取消</button>
          <button className='btn primary' onClick={submit} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
