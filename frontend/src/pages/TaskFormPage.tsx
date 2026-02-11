import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import './TaskFormPage.css'

export default function TaskFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [form, setForm] = useState({
    name: '',
    keywords: '',
    exclude_words: '',
    days_limit: 30,
    fetch_limit: 200,
    search_sort: 'relevance',
    schedule_time: '09:00',
    basic_views: 100000,
    basic_fav: 1500,
    basic_coin: 500,
    basic_reply: 200,
    low_fan_enabled: true,
    fan_max: 50000,
    views_min: 30000,
    fav_rate: 0.012,
    coin_rate: 0.0025,
    reply_rate: 0.002,
    fav_fan_ratio: 0.02,
  })

  useEffect(() => {
    api.get('/api/templates/tasks').then((res) => setTemplates(res.data.items || [])).catch(() => {})
    if (mode === 'edit' && id) {
      api.get(`/api/tasks/${id}`).then((res) => {
        const task = res.data
        setForm((prev) => ({
          ...prev,
          name: task.name,
          keywords: (task.keywords || []).join('\n'),
          exclude_words: (task.exclude_words || []).join('\n'),
          days_limit: task.scope?.days_limit ?? 30,
          fetch_limit: task.scope?.fetch_limit ?? 200,
          search_sort: task.scope?.search_sort ?? 'relevance',
          schedule_time: task.schedule?.time ?? '09:00',
          basic_views: task.rules?.basic_hot?.thresholds?.views ?? 100000,
          basic_fav: task.rules?.basic_hot?.thresholds?.fav ?? 1500,
          basic_coin: task.rules?.basic_hot?.thresholds?.coin ?? 500,
          basic_reply: task.rules?.basic_hot?.thresholds?.reply ?? 200,
          low_fan_enabled: task.rules?.low_fan_hot?.enabled ?? true,
          fan_max: task.rules?.low_fan_hot?.fan_max ?? 50000,
          views_min: task.rules?.low_fan_hot?.views_min ?? 30000,
          fav_rate: task.rules?.low_fan_hot?.fav_rate ?? 0.012,
          coin_rate: task.rules?.low_fan_hot?.coin_rate ?? 0.0025,
          reply_rate: task.rules?.low_fan_hot?.reply_rate ?? 0.002,
          fav_fan_ratio: task.rules?.low_fan_hot?.fav_fan_ratio ?? 0.02,
        }))
      })
    }
  }, [mode, id])

  const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))

  const applyTemplate = () => {
    const tpl = templates.find((t) => t.id === selectedTemplate)
    if (!tpl) return
    const rules = tpl.rules || {}
    setForm((prev) => ({
      ...prev,
      basic_views: rules.basic_hot?.thresholds?.views ?? prev.basic_views,
      basic_fav: rules.basic_hot?.thresholds?.fav ?? prev.basic_fav,
      basic_coin: rules.basic_hot?.thresholds?.coin ?? prev.basic_coin,
      basic_reply: rules.basic_hot?.thresholds?.reply ?? prev.basic_reply,
      low_fan_enabled: rules.low_fan_hot?.enabled ?? prev.low_fan_enabled,
      fan_max: rules.low_fan_hot?.fan_max ?? prev.fan_max,
      views_min: rules.low_fan_hot?.views_min ?? prev.views_min,
      fav_rate: rules.low_fan_hot?.fav_rate ?? prev.fav_rate,
      coin_rate: rules.low_fan_hot?.coin_rate ?? prev.coin_rate,
      reply_rate: rules.low_fan_hot?.reply_rate ?? prev.reply_rate,
      fav_fan_ratio: rules.low_fan_hot?.fav_fan_ratio ?? prev.fav_fan_ratio,
    }))
  }

  const submit = async () => {
    const payload = {
      name: form.name,
      keywords: form.keywords.split(/\n|,|，/).map((k) => k.trim()).filter(Boolean),
      exclude_words: form.exclude_words.split(/\n|,|，/).map((k) => k.trim()).filter(Boolean),
      scope: {
        days_limit: Number(form.days_limit),
        fetch_limit: Number(form.fetch_limit),
        search_sort: form.search_sort,
      },
      schedule: {
        type: 'daily',
        time: form.schedule_time,
      },
      rules: {
        basic_hot: {
          enabled: true,
          mode: 'any',
          thresholds: {
            views: Number(form.basic_views),
            fav: Number(form.basic_fav),
            coin: Number(form.basic_coin),
            reply: Number(form.basic_reply),
          },
        },
        low_fan_hot: {
          enabled: form.low_fan_enabled,
          strength: 'balanced',
          fan_max: Number(form.fan_max),
          views_min: Number(form.views_min),
          fav_rate: Number(form.fav_rate),
          coin_rate: Number(form.coin_rate),
          reply_rate: Number(form.reply_rate),
          fav_fan_ratio: Number(form.fav_fan_ratio),
          window_days: 7,
        },
      },
    }

    if (mode === 'create') {
      await api.post('/api/tasks', payload)
    } else if (id) {
      await api.put(`/api/tasks/${id}`, payload)
    }
    navigate('/tasks')
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>{mode === 'create' ? '新建任务' : '编辑任务'}</h1>
          <p>设置关键词、抓取范围与爆款规则。</p>
        </div>
        <button className='btn primary' onClick={submit}>保存</button>
      </header>

      <section className='form-section'>
        <h3>基础信息</h3>
        <label>
          行业模板
          <div className='template-row'>
            <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
              <option value=''>不使用模板</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
            <button className='btn ghost' type='button' onClick={applyTemplate}>应用模板</button>
          </div>
        </label>
        <label>
          任务名
          <input value={form.name} onChange={(e) => update('name', e.target.value)} />
        </label>
        <label>
          商品关键词（换行或逗号分隔）
          <textarea value={form.keywords} onChange={(e) => update('keywords', e.target.value)} />
        </label>
        <label>
          排除词（可选）
          <textarea value={form.exclude_words} onChange={(e) => update('exclude_words', e.target.value)} />
        </label>
      </section>

      <section className='form-section'>
        <h3>抓取范围</h3>
        <div className='grid'>
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
          <label>
            每日运行时间
            <input type='time' value={form.schedule_time} onChange={(e) => update('schedule_time', e.target.value)} />
          </label>
        </div>
      </section>

      <section className='form-section'>
        <h3>基础爆款</h3>
        <div className='grid'>
          <label>播放阈值<input type='number' value={form.basic_views} onChange={(e) => update('basic_views', e.target.value)} /></label>
          <label>收藏阈值<input type='number' value={form.basic_fav} onChange={(e) => update('basic_fav', e.target.value)} /></label>
          <label>投币阈值<input type='number' value={form.basic_coin} onChange={(e) => update('basic_coin', e.target.value)} /></label>
          <label>评论阈值<input type='number' value={form.basic_reply} onChange={(e) => update('basic_reply', e.target.value)} /></label>
        </div>
      </section>

      <section className='form-section'>
        <h3>低粉带货爆款</h3>
        <label className='toggle'>
          <input type='checkbox' checked={form.low_fan_enabled} onChange={(e) => update('low_fan_enabled', e.target.checked)} />
          启用低粉规则
        </label>
        <div className='grid'>
          <label>粉丝上限<input type='number' value={form.fan_max} onChange={(e) => update('fan_max', e.target.value)} /></label>
          <label>播放下限<input type='number' value={form.views_min} onChange={(e) => update('views_min', e.target.value)} /></label>
          <label>收藏率<input type='number' step='0.001' value={form.fav_rate} onChange={(e) => update('fav_rate', e.target.value)} /></label>
          <label>投币率<input type='number' step='0.001' value={form.coin_rate} onChange={(e) => update('coin_rate', e.target.value)} /></label>
          <label>评论率<input type='number' step='0.001' value={form.reply_rate} onChange={(e) => update('reply_rate', e.target.value)} /></label>
          <label>收藏/粉丝比<input type='number' step='0.001' value={form.fav_fan_ratio} onChange={(e) => update('fav_fan_ratio', e.target.value)} /></label>
        </div>
      </section>
    </div>
  )
}
