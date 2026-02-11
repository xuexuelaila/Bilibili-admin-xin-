import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import './AlertsPage.css'

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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [onlyUnread, setOnlyUnread] = useState(false)

  const load = async () => {
    const res = await api.get(`/api/alerts?unread=${onlyUnread}`)
    setAlerts(res.data.items)
  }

  useEffect(() => {
    load()
  }, [onlyUnread])

  const markRead = async (id: number) => {
    await api.post(`/api/alerts/${id}/read`)
    await load()
  }

  const markAllRead = async () => {
    await api.post('/api/alerts/mark_all_read')
    await load()
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>告警中心</h1>
          <p>任务连续失败的告警会在此显示。</p>
        </div>
        <div className='actions'>
          <label className='toggle'>
            <input type='checkbox' checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
            仅看未读
          </label>
          <button className='btn ghost' onClick={markAllRead}>全部标记已读</button>
        </div>
      </header>

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
    </div>
  )
}
