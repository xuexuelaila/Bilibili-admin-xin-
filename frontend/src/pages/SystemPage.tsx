import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import Empty from '../components/Empty'
import './SystemPage.css'
import './SettingsPage.css'
import './AlertsPage.css'
import './TemplatesPage.css'

interface Settings {
  rate_limit_per_sec: number
  retry_times: number
  timeout_seconds: number
  alert_consecutive_failures: number
}

interface AlertItem {
  id: number
  task_id: string | null
  type: string
  level: string
  title: string
  message: string | null
  meta: any
  created_at: string
  read_at: string | null
}

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

const normalizeIndustry = (value: string) => (value === '其他' ? 'other' : value)
const renderIndustry = (value: string) => (value === 'other' ? '其他' : value)

export default function SystemPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [form, setForm] = useState({ ...DEFAULT_FORM })

  const loadSettings = async () => {
    const res = await api.get('/api/settings')
    setSettings(res.data)
  }

  const loadAlerts = async () => {
    const res = await api.get(`/api/alerts?unread=${onlyUnread}`)
    setAlerts(res.data.items || [])
  }

  const loadTemplates = async () => {
    const res = await api.get('/api/templates/tasks')
    setTemplates(res.data.items || [])
  }

  useEffect(() => {
    loadSettings().catch(() => {})
    loadTemplates().catch(() => {})
  }, [])

  useEffect(() => {
    loadAlerts().catch(() => {})
  }, [onlyUnread])

  const updateSetting = (key: keyof Settings, value: number) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  const saveSettings = async () => {
    if (!settings) return
    await api.put('/api/settings', settings)
    await loadSettings()
  }

  const updateForm = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))

  const selectTemplate = (tpl: TemplateItem) => {
    setForm({
      id: tpl.id,
      name: tpl.name,
      industry: normalizeIndustry(tpl.industry),
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

  const resetForm = () => setForm({ ...DEFAULT_FORM })

  const saveTemplate = async () => {
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
    await loadTemplates()
    resetForm()
  }

  const removeTemplate = async () => {
    if (!form.id) return
    if (!confirm('确认删除该模板？')) return
    await api.delete(`/api/templates/tasks/${form.id}`)
    await loadTemplates()
    resetForm()
  }

  const markRead = async (id: number) => {
    await api.post(`/api/alerts/${id}/read`)
    await loadAlerts()
  }

  const markAllRead = async () => {
    await api.post('/api/alerts/mark_all_read')
    await loadAlerts()
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>系统中心</h1>
          <p>告警、模板与系统设置集中管理。</p>
        </div>
      </header>

      <section className='system-section'>
        <div className='section-header'>
          <div>
            <h2>系统设置</h2>
            <p>全局频控、重试与告警阈值。</p>
          </div>
          <button className='btn primary' onClick={saveSettings}>保存设置</button>
        </div>
        {!settings && <Empty label='加载中...' />}
        {settings && (
          <div className='settings-grid'>
            <label>
              抓取频控（次/秒）
              <input type='number' value={settings.rate_limit_per_sec} onChange={(e) => updateSetting('rate_limit_per_sec', Number(e.target.value))} />
            </label>
            <label>
              重试次数
              <input type='number' value={settings.retry_times} onChange={(e) => updateSetting('retry_times', Number(e.target.value))} />
            </label>
            <label>
              超时阈值（秒）
              <input type='number' value={settings.timeout_seconds} onChange={(e) => updateSetting('timeout_seconds', Number(e.target.value))} />
            </label>
            <label>
              连续失败告警阈值
              <input type='number' value={settings.alert_consecutive_failures} onChange={(e) => updateSetting('alert_consecutive_failures', Number(e.target.value))} />
            </label>
          </div>
        )}
      </section>

      <section className='system-section'>
        <div className='section-header'>
          <div>
            <h2>告警中心</h2>
            <p>任务连续失败的告警会在此显示。</p>
          </div>
          <div className='actions'>
            <label className='toggle'>
              <input type='checkbox' checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
              仅看未读
            </label>
            <button className='btn ghost' onClick={markAllRead}>全部标记已读</button>
          </div>
        </div>
        {alerts.length === 0 && <Empty label='暂无告警' />}
        {alerts.length > 0 && (
          <section className='alert-list'>
            {alerts.map((alert) => (
              <div key={alert.id} className={`alert-card ${alert.read_at ? 'read' : ''}`}>
                <div>
                  <h3>{alert.title}</h3>
                  <p>{alert.message}</p>
                  <div className='meta'>
                    <span>{alert.level}</span>
                    <span>{dayjs(alert.created_at).format('MM-DD HH:mm')}</span>
                  </div>
                </div>
                {!alert.read_at && (
                  <button className='btn ghost' onClick={() => markRead(alert.id)}>标记已读</button>
                )}
              </div>
            ))}
          </section>
        )}
      </section>

      <section className='system-section'>
        <div className='section-header'>
          <div>
            <h2>模板管理</h2>
            <p>配置行业模板，用于任务快速套用。</p>
          </div>
          <div className='actions'>
            <button className='btn ghost' onClick={resetForm}>清空</button>
            <button className='btn primary' onClick={saveTemplate}>保存模板</button>
          </div>
        </div>

        <section className='template-form'>
          <div className='grid'>
            <label>
              模板名称
              <input value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
            </label>
            <label>
              行业
              <select value={form.industry} onChange={(e) => updateForm('industry', e.target.value)}>
                <option value='家电'>家电</option>
                <option value='3C'>3C</option>
                <option value='other'>其他</option>
              </select>
            </label>
            <label>
              强度
              <select value={form.strength} onChange={(e) => updateForm('strength', e.target.value)}>
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
            <label>播放阈值<input type='number' value={form.basic_views} onChange={(e) => updateForm('basic_views', e.target.value)} /></label>
            <label>收藏阈值<input type='number' value={form.basic_fav} onChange={(e) => updateForm('basic_fav', e.target.value)} /></label>
            <label>投币阈值<input type='number' value={form.basic_coin} onChange={(e) => updateForm('basic_coin', e.target.value)} /></label>
            <label>评论阈值<input type='number' value={form.basic_reply} onChange={(e) => updateForm('basic_reply', e.target.value)} /></label>
          </div>
        </section>

        <section className='template-form'>
          <h3>低粉带货爆款</h3>
          <label className='toggle'>
            <input type='checkbox' checked={form.low_fan_enabled} onChange={(e) => updateForm('low_fan_enabled', e.target.checked)} />
            启用低粉规则
          </label>
          <div className='grid'>
            <label>粉丝上限<input type='number' value={form.fan_max} onChange={(e) => updateForm('fan_max', e.target.value)} /></label>
            <label>播放下限<input type='number' value={form.views_min} onChange={(e) => updateForm('views_min', e.target.value)} /></label>
            <label>收藏率<input type='number' step='0.001' value={form.fav_rate} onChange={(e) => updateForm('fav_rate', e.target.value)} /></label>
            <label>投币率<input type='number' step='0.001' value={form.coin_rate} onChange={(e) => updateForm('coin_rate', e.target.value)} /></label>
            <label>评论率<input type='number' step='0.001' value={form.reply_rate} onChange={(e) => updateForm('reply_rate', e.target.value)} /></label>
            <label>收藏/粉丝比<input type='number' step='0.001' value={form.fav_fan_ratio} onChange={(e) => updateForm('fav_fan_ratio', e.target.value)} /></label>
          </div>
          {form.id ? (
            <button className='btn ghost danger' onClick={removeTemplate}>删除模板</button>
          ) : null}
        </section>

        <section className='template-list'>
          {templates.map((tpl) => (
            <div key={tpl.id} className='template-card'>
              <div>
                <h4>{tpl.name}</h4>
                <p>{renderIndustry(tpl.industry)} · {tpl.strength}</p>
              </div>
              <button className='btn ghost' onClick={() => selectTemplate(tpl)}>编辑</button>
            </div>
          ))}
        </section>
      </section>
    </div>
  )
}
