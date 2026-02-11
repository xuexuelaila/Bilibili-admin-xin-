import { useEffect, useState } from 'react'
import { api } from '../api/client'
import './SettingsPage.css'

interface Settings {
  rate_limit_per_sec: number
  retry_times: number
  timeout_seconds: number
  alert_consecutive_failures: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)

  const load = async () => {
    const res = await api.get('/api/settings')
    setSettings(res.data)
  }

  useEffect(() => {
    load()
  }, [])

  const update = (key: keyof Settings, value: number) => {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
  }

  const save = async () => {
    if (!settings) return
    await api.put('/api/settings', settings)
    await load()
  }

  if (!settings) return null

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>系统设置</h1>
          <p>全局频控、重试与告警阈值。</p>
        </div>
        <button className='btn primary' onClick={save}>保存设置</button>
      </header>

      <section className='settings-grid'>
        <label>
          抓取频控（次/秒）
          <input type='number' value={settings.rate_limit_per_sec} onChange={(e) => update('rate_limit_per_sec', Number(e.target.value))} />
        </label>
        <label>
          重试次数
          <input type='number' value={settings.retry_times} onChange={(e) => update('retry_times', Number(e.target.value))} />
        </label>
        <label>
          超时阈值（秒）
          <input type='number' value={settings.timeout_seconds} onChange={(e) => update('timeout_seconds', Number(e.target.value))} />
        </label>
        <label>
          连续失败告警阈值
          <input type='number' value={settings.alert_consecutive_failures} onChange={(e) => update('alert_consecutive_failures', Number(e.target.value))} />
        </label>
      </section>
    </div>
  )
}
