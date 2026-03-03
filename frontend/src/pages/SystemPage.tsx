import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import Empty from '../components/Empty'
import './SystemPage.css'
import './SettingsPage.css'
import './AlertsPage.css'

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

export default function SystemPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [onlyUnread, setOnlyUnread] = useState(false)

  const loadSettings = async () => {
    const res = await api.get('/api/settings')
    setSettings(res.data)
  }

  const loadAlerts = async () => {
    const res = await api.get(`/api/alerts?unread=${onlyUnread}`)
    setAlerts(res.data.items || [])
  }

  useEffect(() => {
    loadSettings().catch(() => {})
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

    </div>
  )
}
