import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'

export type UpdateFilters = {
  upIds: string[]
  days?: number | null
  publishFrom: string
  publishTo: string
  publishToExclusive?: boolean
  processStatus?: string
  bvid?: string
  title?: string
  minFans?: string
  sortKey: string
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: number
}

export function useDebouncedValue<T>(value: T, delay = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function useUpdates<T = any>(filters: UpdateFilters, refreshToken = 0) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const lastKey = useRef('')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('source', 'creator_watch')
    if (filters.upIds.length) params.set('up_ids', filters.upIds.join(','))
    if (filters.publishFrom) params.set('publish_from', filters.publishFrom)
    if (filters.publishTo) params.set('publish_to', filters.publishTo)
    if (filters.publishToExclusive) params.set('publish_to_exclusive', 'true')
    if (!filters.publishFrom && !filters.publishTo && filters.days) params.set('days', String(filters.days))
    if (filters.processStatus && filters.processStatus !== 'all') params.set('process_status', filters.processStatus)
    if (filters.bvid) params.set('bvid', filters.bvid)
    if (filters.title) params.set('title', filters.title)
    if (filters.minFans) params.set('min_fans', filters.minFans)
    params.set('sort', filters.sortKey)
    params.set('order', filters.sortOrder)
    params.set('page', String(filters.page))
    params.set('page_size', String(filters.pageSize))
    return params.toString()
  }, [filters])

  const debouncedQuery = useDebouncedValue(query, 200)

  useEffect(() => {
    const key = `${debouncedQuery}|${refreshToken}`
    if (key === lastKey.current) return
    lastKey.current = key

    const ac = new AbortController()
    setLoading(true)
    api.get(`/api/videos?${debouncedQuery}`, { signal: ac.signal })
      .then((res) => {
        setItems(res.data.items || [])
        setTotal(res.data.total || 0)
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [debouncedQuery, refreshToken])

  return { items, total, loading }
}
