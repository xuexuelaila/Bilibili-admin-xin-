import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import Pagination from '../components/Pagination'
import TagInput from '../components/TagInput'
import Empty from '../components/Empty'
import './ProductsPage.css'

interface ProductItem {
  product_id: number
  platform: string
  item_id: string
  sku_id?: string | null
  category_tags?: string[]
  last_seen_at?: string | null
  videos_count: number
  seller_count: number
  intensity?: number
}

interface TaskOption {
  id: string
  name: string
}

const metricModes = [
  { value: 'global_sellers', label: '全局带货人数' },
  { value: 'video_sellers', label: '单视频带货人数' },
]

const daysOptions = [
  { value: 3, label: '近3天' },
  { value: 7, label: '近7天' },
  { value: 30, label: '近30天' },
]

export default function ProductsPage() {
  const [items, setItems] = useState<ProductItem[]>([])
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [taskFilter, setTaskFilter] = useState<string[]>([])
  const [keyword, setKeyword] = useState('')
  const [days, setDays] = useState(7)
  const [metricMode, setMetricMode] = useState('global_sellers')
  const [minSellers, setMinSellers] = useState('')
  const [minVideos, setMinVideos] = useState('')
  const [sortKey, setSortKey] = useState('sellers')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/tasks?page=1&page_size=200').then((res) => {
      setTasks(res.data.items || [])
    }).catch(() => {})
  }, [])

  const taskSuggestions = useMemo(() => tasks.map((t) => t.name), [tasks])
  const taskIds = useMemo(() => {
    if (taskFilter.length === 0) return []
    const map = new Map(tasks.map((t) => [t.name, t.id]))
    return taskFilter.map((name) => map.get(name)).filter(Boolean) as string[]
  }, [tasks, taskFilter])

  const load = async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (taskIds.length > 0) params.set('task_ids', taskIds.join(','))
    if (keyword.trim()) params.set('keyword', keyword.trim())
    if (days) params.set('days', String(days))
    if (metricMode) params.set('metric_mode', metricMode)
    if (minSellers.trim()) params.set('min_sellers', minSellers.trim())
    if (minVideos.trim()) params.set('min_videos', minVideos.trim())
    if (sortKey) params.set('sort', sortKey)
    if (sortOrder) params.set('order', sortOrder)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    try {
      const res = await api.get(`/api/products?${params.toString()}`)
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (err: any) {
      const message = err?.response?.data?.detail || '加载失败，请稍后重试'
      setError(message)
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [taskIds, keyword, days, metricMode, minSellers, minVideos, sortKey, sortOrder, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [taskIds, keyword, days, metricMode, minSellers, minVideos, sortKey, sortOrder])

  const sellerLabel = metricMode === 'video_sellers' ? '单视频带货人数' : '带货人数'

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>选品库</h1>
          <p>聚合评论中的商品链接，支持多口径统计。</p>
        </div>
      </header>

      <div className='product-filters'>
        <div className='filter-block'>
          <label>任务筛选</label>
          <TagInput
            value={taskFilter}
            suggestions={taskSuggestions}
            onChange={setTaskFilter}
            placeholder='选择任务'
          />
        </div>
        <div className='filter-block'>
          <label>关键词</label>
          <input
            type='search'
            placeholder='关键词过滤'
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className='filter-block'>
          <label>时间范围</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {daysOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className='filter-block'>
          <label>口径切换</label>
          <div className='mode-switch'>
            {metricModes.map((mode) => (
              <button
                key={mode.value}
                className={`btn small ${metricMode === mode.value ? 'active' : ''}`}
                onClick={() => setMetricMode(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <div className='filter-block'>
          <label>最低带货人数</label>
          <input
            type='number'
            min='0'
            placeholder='不限'
            value={minSellers}
            onChange={(e) => setMinSellers(e.target.value)}
          />
        </div>
        <div className='filter-block'>
          <label>最低带货视频数</label>
          <input
            type='number'
            min='0'
            placeholder='不限'
            value={minVideos}
            onChange={(e) => setMinVideos(e.target.value)}
          />
        </div>
        <div className='filter-block'>
          <label>排序</label>
          <select
            value={`${sortKey}:${sortOrder}`}
            onChange={(e) => {
              const [key, order] = e.target.value.split(':')
              setSortKey(key)
              setSortOrder(order as 'asc' | 'desc')
            }}
          >
            <option value='sellers:desc'>{sellerLabel} 高→低</option>
            <option value='sellers:asc'>{sellerLabel} 低→高</option>
            <option value='videos:desc'>带货视频数 高→低</option>
            <option value='videos:asc'>带货视频数 低→高</option>
            <option value='last_seen_at:desc'>最近出现 新→旧</option>
            <option value='last_seen_at:asc'>最近出现 旧→新</option>
          </select>
        </div>
      </div>

      {loading && <Empty label='加载中...' />}
      {error ? <Empty label={error} /> : null}
      {!loading && !error && items.length === 0 && <Empty label='暂无数据' />}
      {!loading && items.length > 0 && (
        <div className='product-table'>
          <div className='product-table-head'>
            <span>商品ID</span>
            <span>平台</span>
            <span>{sellerLabel}</span>
            <span>带货视频数</span>
            <span>最近出现</span>
            <span>强度</span>
          </div>
          {items.map((item) => (
            <div key={item.product_id} className='product-row'>
              <div className='product-meta'>
                <div className='product-id'>{item.item_id}</div>
                {item.sku_id && <div className='product-sku'>SKU {item.sku_id}</div>}
                {item.category_tags && item.category_tags.length > 0 && (
                  <div className='product-tags'>
                    {item.category_tags.slice(0, 3).map((tag) => (
                      <span key={tag} className='pill'>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <span className='product-platform'>{item.platform}</span>
              <span className='metric'>{item.seller_count}</span>
              <span className='metric'>{item.videos_count}</span>
              <span className='muted'>
                {item.last_seen_at ? dayjs(item.last_seen_at).format('YYYY-MM-DD') : '-'}
              </span>
              <span className='muted'>{item.intensity ?? 0}</span>
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  )
}
