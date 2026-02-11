import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import './AppLayout.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    api.get('/api/alerts/unread_count').then((res) => setUnread(res.data.count || 0)).catch(() => {})
  }, [])

  return (
    <div className='app-shell'>
      <aside className='app-sidebar'>
        <div className='app-logo'>B站爆款后台</div>
        <nav className='app-nav'>
          <NavLink to='/dashboard'>数据看板</NavLink>
          <NavLink to='/tasks'>任务管理</NavLink>
          <NavLink to='/templates'>模板管理</NavLink>
          <NavLink to='/videos'>视频库</NavLink>
          <NavLink to='/alerts'>告警中心 {unread > 0 ? <span className='badge'>{unread}</span> : null}</NavLink>
          <NavLink to='/settings'>系统设置</NavLink>
        </nav>
        <div className='app-footer'>v0.1</div>
      </aside>
      <main className='app-main'>{children}</main>
    </div>
  )
}
