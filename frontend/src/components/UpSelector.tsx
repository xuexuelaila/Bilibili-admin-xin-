import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import './UpSelector.css'

export type UpItem = {
  uid: string
  name: string
  avatar?: string | null
  groupId?: string | null
  groupName?: string | null
  groupTags?: string[]
}

type UpSelectorProps = {
  items: UpItem[]
  value: string[]
  onChange: (nextIds: string[], nextItems: UpItem[]) => void
  loading?: boolean
  error?: string | null
  placeholder?: string
  recentMax?: number
  onOpenChange?: (open: boolean) => void
}

const RECENT_KEY = 'creator_recent_ups'

export default function UpSelector({
  items,
  value,
  onChange,
  loading,
  error,
  placeholder = '选择UP主',
  recentMax = 5,
  onOpenChange,
}: UpSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [groupId, setGroupId] = useState('')
  const [showAllChips, setShowAllChips] = useState(false)
  const [recentIds, setRecentIds] = useState<string[]>([])
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(RECENT_KEY)
    if (raw) setRecentIds(JSON.parse(raw))
  }, [])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, string>()
    items.forEach((i) => {
      if (i.groupId && i.groupName) map.set(i.groupId, i.groupName)
      if (i.groupTags) i.groupTags.forEach((g) => map.set(g, g))
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [items])

  const filteredItems = useMemo(() => {
    const q = query.trim()
    const uidExact = /^\d+$/.test(q)
    return items.filter((i) => {
      if (groupId) {
        const tagHit = i.groupTags ? i.groupTags.includes(groupId) : i.groupId === groupId
        if (!tagHit) return false
      }
      if (!q) return true
      if (uidExact) return i.uid === q
      return (i.name || '').toLowerCase().includes(q.toLowerCase())
    })
  }, [items, query, groupId])

  const selectedItems = useMemo(
    () => items.filter((i) => value.includes(i.uid)),
    [items, value]
  )

  const recentItems = useMemo(() => {
    const map = new Map(items.map((i) => [i.uid, i]))
    return recentIds
      .map((id) => map.get(id))
      .filter((v): v is UpItem => Boolean(v))
  }, [items, recentIds])

  const commitChange = (nextIds: string[]) => {
    const nextItems = items.filter((i) => nextIds.includes(i.uid))
    onChange(nextIds, nextItems)
  }

  const toggleItem = (uid: string) => {
    const nextIds = value.includes(uid) ? value.filter((id) => id !== uid) : [...value, uid]
    commitChange(nextIds)

    const nextRecent = [uid, ...recentIds.filter((r) => r !== uid)].slice(0, recentMax)
    setRecentIds(nextRecent)
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent))
  }

  const clearSelect = () => commitChange([])
  const selectAllFiltered = () => {
    const nextIds = Array.from(new Set([...value, ...filteredItems.map((i) => i.uid)]))
    commitChange(nextIds)
  }

  const removeLastSelected = () => {
    if (value.length === 0) return
    commitChange(value.slice(0, -1))
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      selectAllFiltered()
    }
    if (e.key === 'Backspace' && query.length === 0) {
      removeLastSelected()
    }
    if (e.key === 'Escape') setOpen(false)
  }

  const renderChips = () => {
    if (selectedItems.length === 0) return null
    const max = 3
    const showing = showAllChips ? selectedItems : selectedItems.slice(0, max)
    const rest = selectedItems.length - showing.length
    return (
      <div className='up-chips'>
        {showing.map((i) => (
          <span key={i.uid} className='chip'>{i.name || i.uid}</span>
        ))}
        {rest > 0 && (
          <button className='chip more' onClick={() => setShowAllChips((v) => !v)}>
            +{rest}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className='up-selector' ref={boxRef}>
      <button className='up-selector-trigger' onClick={() => setOpen((v) => !v)}>
        <span>{placeholder}</span>
        <span className='muted'>已选 {value.length} 个</span>
      </button>
      {renderChips()}

      {open && (
        <div className='up-selector-panel'>
          <div className='up-selector-search'>
            <input
              placeholder='搜索昵称或UID'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              autoFocus
            />
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value=''>全部分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className='up-selector-list'>
            {loading && <div className='muted'>正在加载UP主...</div>}
            {error && <div className='error'>{error}</div>}

            {!loading && !error && recentItems.length > 0 && (
              <div className='up-section'>
                <div className='up-section-title'>最近使用</div>
                {recentItems.map((i) => (
                  <label key={`recent-${i.uid}`} className='up-option'>
                    <input
                      type='checkbox'
                      checked={value.includes(i.uid)}
                      onChange={() => toggleItem(i.uid)}
                    />
                    <span className='up-name'>{i.name || i.uid}</span>
                    <span className='up-id'>{i.uid}</span>
                  </label>
                ))}
              </div>
            )}

            {!loading && !error && (
              <div className='up-section'>
                <div className='up-section-title'>全部UP主</div>
                {items.length === 0 ? (
                  <div className='muted'>暂无关注UP主</div>
                ) : filteredItems.length === 0 ? (
                  <div className='muted'>无匹配UP主</div>
                ) : filteredItems.map((i) => (
                  <label key={i.uid} className='up-option'>
                    <input
                      type='checkbox'
                      checked={value.includes(i.uid)}
                      onChange={() => toggleItem(i.uid)}
                    />
                    <span className='up-name'>{i.name || i.uid}</span>
                    <span className='up-id'>{i.uid}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className='up-selector-footer'>
            <button className='btn small' onClick={selectAllFiltered}>选择全部（当前筛选）</button>
            <button className='btn small ghost' onClick={clearSelect}>清空选择</button>
            <button className='btn small primary' onClick={() => setOpen(false)}>完成</button>
          </div>
        </div>
      )}
    </div>
  )
}
