import { useEffect, useState } from 'react'
import { api } from '../api/client'
import './TemplatesPage.css'

interface TemplateItem {
  id: number
  name: string
  industry: string
  strength: string
  rules: any
}

const DEFAULT_FORM = {
  id: 0,
  name: '',
  industry: '家电',
  strength: 'balanced',
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
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [form, setForm] = useState({ ...DEFAULT_FORM })

  const load = async () => {
    const res = await api.get('/api/templates/tasks')
    setTemplates(res.data.items || [])
  }

  useEffect(() => {
    load()
  }, [])

  const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))

  const selectTemplate = (tpl: TemplateItem) => {
    setForm({
      id: tpl.id,
      name: tpl.name,
      industry: tpl.industry,
      strength: tpl.strength,
      basic_views: tpl.rules?.basic_hot?.thresholds?.views ?? DEFAULT_FORM.basic_views,
      basic_fav: tpl.rules?.basic_hot?.thresholds?.fav ?? DEFAULT_FORM.basic_fav,
      basic_coin: tpl.rules?.basic_hot?.thresholds?.coin ?? DEFAULT_FORM.basic_coin,
      basic_reply: tpl.rules?.basic_hot?.thresholds?.reply ?? DEFAULT_FORM.basic_reply,
      low_fan_enabled: tpl.rules?.low_fan_hot?.enabled ?? DEFAULT_FORM.low_fan_enabled,
      fan_max: tpl.rules?.low_fan_hot?.fan_max ?? DEFAULT_FORM.fan_max,
      views_min: tpl.rules?.low_fan_hot?.views_min ?? DEFAULT_FORM.views_min,
      fav_rate: tpl.rules?.low_fan_hot?.fav_rate ?? DEFAULT_FORM.fav_rate,
      coin_rate: tpl.rules?.low_fan_hot?.coin_rate ?? DEFAULT_FORM.coin_rate,
      reply_rate: tpl.rules?.low_fan_hot?.reply_rate ?? DEFAULT_FORM.reply_rate,
      fav_fan_ratio: tpl.rules?.low_fan_hot?.fav_fan_ratio ?? DEFAULT_FORM.fav_fan_ratio,
    })
  }

  const reset = () => setForm({ ...DEFAULT_FORM })

  const save = async () => {
    const payload = {
      name: form.name,
      industry: form.industry,
      strength: form.strength,
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
          strength: form.strength,
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

    if (form.id) {
      await api.put(`/api/templates/tasks/${form.id}`, payload)
    } else {
      await api.post('/api/templates/tasks', payload)
    }
    await load()
    reset()
  }

  const remove = async () => {
    if (!form.id) return
    if (!confirm('确认删除该模板？')) return
    await api.delete(`/api/templates/tasks/${form.id}`)
    await load()
    reset()
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>模板管理</h1>
          <p>配置行业模板，用于任务快速套用。</p>
        </div>
        <div className='actions'>
          <button className='btn ghost' onClick={reset}>清空</button>
          <button className='btn primary' onClick={save}>保存模板</button>
        </div>
      </header>

      <section className='template-form'>
        <div className='grid'>
          <label>
            模板名称
            <input value={form.name} onChange={(e) => update('name', e.target.value)} />
          </label>
          <label>
            行业
            <select value={form.industry} onChange={(e) => update('industry', e.target.value)}>
              <option value='家电'>家电</option>
              <option value='3C'>3C</option>
              <option value='其他'>其他</option>
            </select>
          </label>
          <label>
            强度
            <select value={form.strength} onChange={(e) => update('strength', e.target.value)}>
              <option value='light'>轻</option>
              <option value='balanced'>中</option>
              <option value='strong'>强</option>
            </select>
          </label>
        </div>
      </section>

      <section className='template-form'>
        <h3>基础爆款阈值</h3>
        <div className='grid'>
          <label>播放阈值<input type='number' value={form.basic_views} onChange={(e) => update('basic_views', e.target.value)} /></label>
          <label>收藏阈值<input type='number' value={form.basic_fav} onChange={(e) => update('basic_fav', e.target.value)} /></label>
          <label>投币阈值<input type='number' value={form.basic_coin} onChange={(e) => update('basic_coin', e.target.value)} /></label>
          <label>评论阈值<input type='number' value={form.basic_reply} onChange={(e) => update('basic_reply', e.target.value)} /></label>
        </div>
      </section>

      <section className='template-form'>
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
        {form.id ? (
          <button className='btn ghost danger' onClick={remove}>删除模板</button>
        ) : null}
      </section>

      <section className='template-list'>
        {templates.map((tpl) => (
          <div key={tpl.id} className='template-card'>
            <div>
              <h4>{tpl.name}</h4>
              <p>{tpl.industry} · {tpl.strength}</p>
            </div>
            <button className='btn ghost' onClick={() => selectTemplate(tpl)}>编辑</button>
          </div>
        ))}
      </section>
    </div>
  )
}
