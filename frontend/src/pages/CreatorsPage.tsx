import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import TagInput from '../components/TagInput'
import Pagination from '../components/Pagination'
import Empty from '../components/Empty'
import './CreatorsPage.css'

interface Creator {
  up_id: string
  up_name: string
  avatar?: string | null
  follower_count?: number
  following_count?: number
  like_count?: number
  view_count?: number
  group_tags: string[]
  note?: string | null
  monitor_enabled: boolean
  last_checked_at?: string | null
  last_error_msg?: string | null
}

const formatCount = (value: number) => {
  if (value >= 10000) {
    const num = value / 10000
    return `${num.toFixed(num >= 100 ? 0 : 1)}w`
  }
  return String(value || 0)
}

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [q, setQ] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [enabledFilter, setEnabledFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const [newInput, setNewInput] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newGroups, setNewGroups] = useState<string[]>([])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editGroups, setEditGroups] = useState<string[]>([])
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const proxyImage = (url?: string | null) => {
    if (!url) return null
    return `${baseUrl}/api/proxy?url=${encodeURIComponent(url)}`
  }

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    creators.forEach((c) => (c.group_tags || []).forEach((g) => set.add(g)))
    return Array.from(set)
  }, [creators])

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (groupFilter) params.set('group', groupFilter)
    if (enabledFilter) params.set('enabled', enabledFilter)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    const res = await api.get(`/api/creators?${params.toString()}`)
    setCreators(res.data.items || [])
    setTotal(res.data.total || 0)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [q, groupFilter, enabledFilter, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [q, groupFilter, enabledFilter])

  const create = async () => {
    if (!newInput.trim()) {
      window.alert('请输入UP主ID或主页链接')
      return
    }
    try {
      await api.post('/api/creators', {
        up_id_or_url: newInput.trim(),
        up_id: newInput.trim(),
        note: newNote.trim() || undefined,
        group_tags: newGroups,
      })
      setNewInput('')
      setNewNote('')
      setNewGroups([])
      load()
    } catch (err: any) {
      const message = err?.response?.data?.detail || '添加失败，请检查UP主ID或链接'
      window.alert(message)
    }
  }

  const toggleMonitor = async (creator: Creator) => {
    await api.put(`/api/creators/${creator.up_id}`, { monitor_enabled: !creator.monitor_enabled })
    load()
  }

  const startEdit = (creator: Creator) => {
    setEditingId(creator.up_id)
    setEditNote(creator.note || '')
    setEditGroups(creator.group_tags || [])
  }

  const saveEdit = async (up_id: string) => {
    await api.put(`/api/creators/${up_id}`, { note: editNote, group_tags: editGroups })
    setEditingId(null)
    setEditNote('')
    setEditGroups([])
    load()
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditNote('')
    setEditGroups([])
  }

  const remove = async (creator: Creator) => {
    const confirmName = window.prompt(`请输入UP主ID确认删除：${creator.up_id}`)
    if (confirmName !== creator.up_id) return
    await api.delete(`/api/creators/${creator.up_id}`)
    load()
  }

  return (
    <div className='page creators-page'>
      <header className='creators-header'>
        <div>
          <h1>关注UP主管理</h1>
          <p>维护监控UP主列表，支持分组与备注。</p>
        </div>
      </header>

      <section className='creator-add'>
        <div className='creator-add-row'>
          <div className='field'>
            <label>UP主ID或主页链接</label>
            <input
              className='filter-control'
              placeholder='例如：3546928589572108 或 https://space.bilibili.com/3546928589572108'
              value={newInput}
              onChange={(e) => setNewInput(e.target.value)}
            />
          </div>
          <div className='field'>
            <label>备注</label>
            <input
              className='filter-control'
              placeholder='可选'
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
          </div>
        </div>
        <div className='creator-add-row'>
          <div className='field'>
            <label>分组标签</label>
            <TagInput value={newGroups} suggestions={groupOptions} onChange={setNewGroups} placeholder='输入分组标签' />
          </div>
          <div className='field actions'>
            <button className='btn primary' onClick={create}>添加UP主</button>
          </div>
        </div>
      </section>

      <section className='creator-filters'>
        <input
          className='filter-control'
          placeholder='搜索UP主'
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className='filter-control' value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value=''>全部分组</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select className='filter-control' value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value)}>
          <option value=''>全部状态</option>
          <option value='true'>启用</option>
          <option value='false'>停用</option>
        </select>
        <select className='filter-control' value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {[10, 20, 30].map((size) => (
            <option key={size} value={size}>{size}/页</option>
          ))}
        </select>
      </section>

      {loading ? <div className='muted'>加载中...</div> : null}
      {!loading && creators.length === 0 ? <Empty text='暂无关注UP主' /> : null}

      <div className='creator-table'>
        {creators.map((creator) => (
          <div key={creator.up_id} className={`creator-row ${editingId === creator.up_id ? 'editing' : ''}`}>
            <div className='creator-main'>
              {creator.avatar ? <img src={proxyImage(creator.avatar) || undefined} alt={creator.up_name} /> : <div className='avatar-placeholder'>UP</div>}
              <div>
                <div className='creator-name'>{creator.up_name}</div>
                <div className='creator-id'>{creator.up_id}</div>
              </div>
            </div>
            <div className='creator-info'>
              <div className='creator-tags'>
                {(creator.group_tags || []).length > 0 ? creator.group_tags.map((tag) => (
                  <span key={tag} className='tag-pill'>{tag}</span>
                )) : <span className='muted'>未分组</span>}
              </div>
              <div className='creator-note'>{creator.note || <span className='muted'>无备注</span>}</div>
              <div className='creator-metrics'>
                <div><span>粉丝</span><strong>{formatCount(creator.follower_count || 0)}</strong></div>
                <div><span>关注</span><strong>{formatCount(creator.following_count || 0)}</strong></div>
                <div><span>获赞</span><strong>{formatCount(creator.like_count || 0)}</strong></div>
                <div><span>播放</span><strong>{formatCount(creator.view_count || 0)}</strong></div>
              </div>
            </div>
            <div className='creator-actions'>
              <label className='toggle'>
                <input type='checkbox' checked={creator.monitor_enabled} onChange={() => toggleMonitor(creator)} />
                <span>{creator.monitor_enabled ? '启用' : '停用'}</span>
              </label>
              <button className='btn small' onClick={() => startEdit(creator)}>编辑</button>
              <button className='btn small ghost' onClick={() => remove(creator)}>删除</button>
            </div>

            {editingId === creator.up_id && (
              <div className='creator-edit'>
                <div className='field'>
                  <label>分组标签</label>
                  <TagInput value={editGroups} suggestions={groupOptions} onChange={setEditGroups} placeholder='输入分组标签' />
                </div>
                <div className='field'>
                  <label>备注</label>
                  <input className='filter-control' value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                </div>
                <div className='edit-actions'>
                  <button className='btn primary' onClick={() => saveEdit(creator.up_id)}>保存</button>
                  <button className='btn ghost' onClick={cancelEdit}>取消</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
    </div>
  )
}
