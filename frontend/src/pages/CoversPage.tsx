import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import Pagination from '../components/Pagination'
import '../components/Pagination.css'
import TagInput from '../components/TagInput'
import './CoversPage.css'

interface CoverFavorite {
  id: string
  bvid: string
  cover_url: string
  category: string[]
  layout_type?: string | null
  note?: string | null
  created_at: string
  updated_at: string
  video_title?: string | null
  up_name?: string | null
  views?: number | null
  views_delta_1d?: number | null
}

const categories = [
  '冰箱',
  '洗地机',
  '空调',
  '洗衣机',
  '热水器',
  '电视',
  '手机',
  '耳机',
  '路由器',
  '键鼠',
  '显示器',
  '平板',
  '充电器',
]

const layoutTypes = [
  '榜单型',
  '对比型',
  '避坑型',
  '教程型',
  '测评型',
  '价格利益型',
  '场景痛点型',
  '新品热点型',
  '反常识冲突型',
]

const formatCount = (value?: number | null) => {
  if (value === null || value === undefined) return '-'
  if (value >= 10000) {
    const num = value / 10000
    return `${num.toFixed(num >= 100 ? 0 : 1)}w`
  }
  return String(value)
}

export function CoversPanel({ showHeader = true }: { showHeader?: boolean }) {
  const [items, setItems] = useState<CoverFavorite[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [layoutFilter, setLayoutFilter] = useState<string>('')
  const [keyword, setKeyword] = useState('')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftCategory, setDraftCategory] = useState<string[]>([])
  const [draftLayout, setDraftLayout] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [coverLoad, setCoverLoad] = useState<Record<string, 'proxy' | 'direct' | 'failed'>>({})
  const [coverRatio, setCoverRatio] = useState<Record<string, number>>({})
  const [preview, setPreview] = useState<CoverFavorite | null>(null)
  const [editTarget, setEditTarget] = useState<CoverFavorite | null>(null)
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2000)
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (categoryFilter.length > 0) params.set('category', categoryFilter.join(','))
    if (layoutFilter) params.set('layout_type', layoutFilter)
    if (keyword) params.set('q', keyword)
    if (sortKey) params.set('sort', sortKey)
    if (sortOrder) params.set('order', sortOrder)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    try {
      const res = await api.get(`/api/covers/favorites?${params.toString()}`)
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
  }, [categoryFilter, layoutFilter, keyword, sortKey, sortOrder, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [categoryFilter, layoutFilter, keyword, sortKey, sortOrder])

  const startEdit = (item: CoverFavorite) => {
    setEditingId(item.id)
    setDraftCategory(item.category || [])
    setDraftLayout(item.layout_type || '')
  }

  const startEditMode = (item: CoverFavorite) => {
    startEdit(item)
    setEditTarget(item)
  }

  const saveEdit = async (id: string) => {
    await api.put(`/api/covers/favorites/${id}`, {
      category: draftCategory,
      layout_type: draftLayout || null,
    })
    setEditingId(null)
    setEditTarget(null)
    showToast('已保存')
    await load()
  }

  const cancelFavorite = async (id: string) => {
    await api.post('/api/covers/unfavorite', { id })
    showToast('已取消封面收藏')
    await load()
  }

  const getVideoUrl = (item: CoverFavorite) => `https://www.bilibili.com/video/${item.bvid}`

  const getCoverSrc = (item: CoverFavorite) => {
    const state = coverLoad[item.id] || 'proxy'
    if (state === 'failed') return ''
    if (state === 'direct') return item.cover_url || ''
    return `${baseUrl}/api/videos/${item.bvid}/cover`
  }

  const isAbnormalRatio = (ratio?: number) => {
    if (!ratio) return false
    return ratio > 2.2 || ratio < 1.2
  }

  const handleCoverLoad = (item: CoverFavorite, event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget
    if (!img.naturalWidth || !img.naturalHeight) return
    const ratio = img.naturalWidth / img.naturalHeight
    setCoverRatio((prev) => ({ ...prev, [item.id]: ratio }))
  }

  const handleCoverError = (item: CoverFavorite) => {
    const state = coverLoad[item.id] || 'proxy'
    if (state === 'proxy' && item.cover_url) {
      setCoverLoad((prev) => ({ ...prev, [item.id]: 'direct' }))
      return
    }
    setCoverLoad((prev) => ({ ...prev, [item.id]: 'failed' }))
  }

  const buildChips = (item: CoverFavorite) => {
    const chips: string[] = []
    if (item.layout_type) chips.push(item.layout_type)
    if (item.category && item.category.length > 0) {
      chips.push(...item.category.slice(0, 2))
    }
    chips.push(item.note ? '有备注' : '无备注')
    return chips
  }

  const renderChips = (item: CoverFavorite) => {
    const chips = buildChips(item)
    const max = 4
    const visible = chips.slice(0, max)
    const rest = chips.length - visible.length
    return (
      <>
        {visible.map((chip) => (
          <span key={chip} className='pill'>{chip}</span>
        ))}
        {rest > 0 && <span className='pill'>+{rest}</span>}
      </>
    )
  }

  return (
    <div className={showHeader ? 'page' : 'covers-panel'}>
      {showHeader && (
        <header className='page-header'>
          <div>
            <h1>封面库</h1>
            <p>收藏优质封面，快速复用与灵感参考。</p>
          </div>
        </header>
      )}

      <div className='cover-filters'>
        <div className='filter-block'>
          <label>品类标签</label>
          <TagInput
            value={categoryFilter}
            suggestions={categories}
            onChange={setCategoryFilter}
            placeholder='选择或输入品类'
          />
        </div>
        <div className='filter-block'>
          <label>版式类型</label>
          <select value={layoutFilter} onChange={(e) => setLayoutFilter(e.target.value)}>
            <option value=''>全部</option>
            {layoutTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className='filter-block'>
          <label>关键词</label>
          <input
            type='search'
            placeholder='搜索备注或视频号'
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
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
            <option value='created_at:desc'>收藏时间 新→旧</option>
            <option value='created_at:asc'>收藏时间 旧→新</option>
            <option value='views:desc'>来源播放量 高→低</option>
            <option value='views:asc'>来源播放量 低→高</option>
            <option value='views_delta_1d:desc'>单日播放新增 高→低</option>
            <option value='views_delta_1d:asc'>单日播放新增 低→高</option>
          </select>
        </div>
      </div>

      {loading && <div className='empty'>加载中...</div>}
      {error ? <div className='empty'>{error}</div> : null}
      {!loading && !error && items.length === 0 && <div className='empty'>暂无收藏封面</div>}
      {!loading && items.length > 0 && (
        <section className='cover-grid'>
          {items.map((item) => (
            <div key={item.id} className='cover-card'>
              <div className='cover-image'>
                {getCoverSrc(item) ? (
                  <div className={`cover-media ${isAbnormalRatio(coverRatio[item.id]) ? 'abnormal' : 'normal'}`}>
                    {isAbnormalRatio(coverRatio[item.id]) && (
                      <div
                        className='cover-bg'
                        style={{ backgroundImage: `url(${getCoverSrc(item)})` }}
                      />
                    )}
                    <img
                      className='cover-img'
                      src={getCoverSrc(item)}
                      alt={item.video_title || item.bvid}
                      onClick={() => setPreview(item)}
                      onLoad={(e) => handleCoverLoad(item, e)}
                      onError={() => handleCoverError(item)}
                    />
                  </div>
                ) : (
                  <div className='cover-fallback'>封面加载失败</div>
                )}
              </div>
              <div className='cover-body'>
                <div className='cover-actions'>
                  <button
                    className='btn ghost'
                    onClick={(e) => {
                      e.stopPropagation()
                      startEditMode(item)
                    }}
                  >
                    标签
                  </button>
                  <button
                    className='btn ghost'
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`${baseUrl}/api/covers/favorites/${item.id}/download`, '_blank')
                      showToast('已下载封面')
                    }}
                  >
                    下载
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      {toast && <div className='toast'>{toast}</div>}
      {preview && (
        <div className='cover-preview-mask' onClick={() => setPreview(null)}>
          <div className='cover-preview' onClick={(e) => e.stopPropagation()}>
            <img src={getCoverSrc(preview) || preview.cover_url} alt={preview.video_title || preview.bvid} />
            <div className='cover-preview-actions'>
              <button className='btn ghost' onClick={() => window.open(getVideoUrl(preview), '_blank')}>打开原视频</button>
              <button className='btn ghost' onClick={() => window.open(`${baseUrl}/api/covers/favorites/${preview.id}/download`, '_blank')}>下载封面</button>
              <button className='btn ghost' onClick={() => setPreview(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      {editTarget && (
        <div className='cover-edit-mask' onClick={() => { setEditTarget(null); setEditingId(null) }}>
          <div className='cover-edit-modal' onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>编辑标签</strong>
            </header>
            <div className='cover-edit-body'>
              <TagInput
                value={draftCategory}
                suggestions={categories}
                onChange={setDraftCategory}
                placeholder='添加品类'
              />
              <select value={draftLayout} onChange={(e) => setDraftLayout(e.target.value)}>
                <option value=''>选择版式</option>
                {layoutTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <footer>
              <button className='btn primary' onClick={() => saveEdit(editTarget.id)}>保存</button>
              <button className='btn ghost' onClick={() => { setEditTarget(null); setEditingId(null) }}>取消</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CoversPage() {
  return <CoversPanel showHeader />
}
