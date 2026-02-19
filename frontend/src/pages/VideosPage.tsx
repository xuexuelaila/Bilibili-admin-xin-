import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { DayPicker, DateRange } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { api } from '../api/client'
import ExportPanel from '../components/ExportPanel'
import '../components/ExportPanel.css'
import Pagination from '../components/Pagination'
import '../components/Pagination.css'
import Empty from '../components/Empty'
import TagInput from '../components/TagInput'
import './VideosPage.css'

interface Video {
  bvid: string
  title: string
  up_name: string
  follower_count: number
  publish_time: string | null
  fetch_time: string
  cover_url: string | null
  video_url?: string | null
  views_delta_1d?: number | null
  stats: { views: number; fav: number; coin: number; reply: number; fav_rate: number; coin_rate: number; reply_rate: number; fav_fan_ratio: number }
  tags: { basic_hot: { is_hit: boolean }; low_fan_hot: { is_hit: boolean } }
  labels: string[]
  process_status: string
}

interface SubtitleState {
  status: 'none' | 'extracting' | 'done' | 'failed'
  text?: string
  error?: string
  errorDetail?: string
  updatedAt?: string
}

const formatCount = (value: number) => {
  if (value >= 10000) {
    const num = value / 10000
    return `${num.toFixed(num >= 100 ? 0 : 1)}w`
  }
  return String(value)
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [publishFrom, setPublishFrom] = useState('')
  const [publishTo, setPublishTo] = useState('')
  const [quickDays, setQuickDays] = useState<number | null>(null)
  const [customDate, setCustomDate] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [minViews, setMinViews] = useState('')
  const [sortKey, setSortKey] = useState('publish_time')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [coverError, setCoverError] = useState<Record<string, boolean>>({})
  const [subtitleModal, setSubtitleModal] = useState<string | null>(null)
  const [subtitleSearch, setSubtitleSearch] = useState('')
  const [subtitleMap, setSubtitleMap] = useState<Record<string, SubtitleState>>({})
  const [toast, setToast] = useState<string | null>(null)
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (labels.length > 0) params.set('tags', labels.join(','))
    if (publishFrom) params.set('publish_from', publishFrom)
    if (publishTo) params.set('publish_to', publishTo)
    if (minViews) params.set('min_views', minViews)
    if (sortKey) params.set('sort', sortKey)
    if (sortOrder) params.set('order', sortOrder)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    const res = await api.get(`/api/videos?${params.toString()}`)
    setVideos(res.data.items)
    setTotal(res.data.total || 0)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [labels, publishFrom, publishTo, minViews, sortKey, sortOrder, page, pageSize])

  useEffect(() => {
    api.get('/api/tags').then((res) => setTagOptions(res.data.items || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setPage(1)
  }, [labels, publishFrom, publishTo, minViews, sortKey, sortOrder])

  useEffect(() => {
    setSelected([])
  }, [labels, publishFrom, publishTo, minViews, sortKey, sortOrder, page, pageSize])

  useEffect(() => {
    setCoverError({})
  }, [videos])

  const allSelected = videos.length > 0 && selected.length === videos.length

  const toggleSelect = (bvid: string) => {
    setSelected((prev) => (prev.includes(bvid) ? prev.filter((id) => id !== bvid) : [...prev, bvid]))
  }

  const toggleSelectAll = () => {
    setSelected(allSelected ? [] : videos.map((v) => v.bvid))
  }

  const batchUpdateStatus = async (status: 'todo' | 'done') => {
    if (selected.length === 0) return
    await api.post('/api/videos/process_status/batch', { bvids: selected, process_status: status })
    await load()
    setSelected([])
  }

  const batchExtractSubtitles = async () => {
    if (selected.length === 0) return
    const res = await api.post('/api/videos/subtitle/extract/batch', { bvids: selected })
    const data = res.data || {}
    const queued = data.queued || 0
    const skipped = data.skipped || 0
    const missing = data.missing || []
    let message = `字幕提取已提交：${queued} 条`
    if (skipped > 0) message += `，已存在字幕 ${skipped} 条`
    if (missing.length > 0) message += `\n未找到视频：${missing.slice(0, 5).join(', ')}`
    window.alert(message)
    setSelected([])
  }

  const batchDownloadCovers = () => {
    if (selected.length === 0) return
    const url = `${baseUrl}/api/videos/cover/download/batch?bvids=${selected.join(',')}`
    window.open(url, '_blank')
  }

  const updateSubtitleState = (bvid: string, patch: Partial<SubtitleState>) => {
    setSubtitleMap((prev) => ({
      ...prev,
      [bvid]: { status: 'none', ...(prev[bvid] || {}), ...patch },
    }))
  }

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2000)
  }

  const fetchSubtitle = async (bvid: string) => {
    try {
      const res = await api.get(`/api/videos/${bvid}/subtitle`)
      const status = (res.data?.status || 'none') as SubtitleState['status']
      updateSubtitleState(bvid, {
        status,
        text: res.data?.text || '',
        error: res.data?.error_summary || res.data?.error || '',
        errorDetail: res.data?.error_detail || '',
        updatedAt: res.data?.updated_at || '',
      })
      return res.data
    } catch {
      updateSubtitleState(bvid, { status: 'none', text: '', error: '', errorDetail: '' })
      return null
    }
  }

  const pollSubtitle = async (bvid: string, attempts = 10, interval = 1500) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await api.get(`/api/videos/${bvid}/subtitle`)
        const status = (res.data?.status || 'none') as SubtitleState['status']
        updateSubtitleState(bvid, {
          status,
          text: res.data?.text || '',
          error: res.data?.error_summary || res.data?.error || '',
          errorDetail: res.data?.error_detail || '',
          updatedAt: res.data?.updated_at || '',
        })
        if (status === 'done') return res.data?.text || ''
        if (status === 'failed') throw new Error(res.data?.error || '字幕提取失败')
      } catch {
        // keep polling
      }
      await wait(interval)
    }
    throw new Error('字幕提取超时')
  }

  const startExtractSubtitle = async (bvid: string) => {
    const current = subtitleMap[bvid]
    if (current?.status === 'extracting') {
      return await pollSubtitle(bvid)
    }
    updateSubtitleState(bvid, { status: 'extracting', error: '', errorDetail: '' })
    await api.post(`/api/videos/${bvid}/subtitle/extract`)
    try {
      const text = await pollSubtitle(bvid)
      return text || ''
    } catch {
      updateSubtitleState(bvid, { status: 'failed' })
    }
    return ''
  }

  const ensureSubtitleText = async (bvid: string) => {
    const existing = await fetchSubtitle(bvid)
    if (existing?.status === 'done' && existing?.text) return existing.text as string
    if (existing?.status === 'extracting') return await pollSubtitle(bvid)
    return await startExtractSubtitle(bvid)
  }

  const copySubtitle = async (bvid: string) => {
    try {
      const text = await ensureSubtitleText(bvid)
      if (!text) {
        showToast('未获取到字幕')
        return
      }
      await navigator.clipboard.writeText(text)
      showToast('已复制到剪贴板')
    } catch {
      showToast('字幕提取失败或不可用')
    }
  }

  const downloadSubtitle = async (bvid: string) => {
    try {
      const text = await ensureSubtitleText(bvid)
      if (!text) {
        showToast('未获取到字幕')
        return
      }
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${bvid}.txt`
      a.click()
      URL.revokeObjectURL(url)
      showToast('字幕已下载')
    } catch {
      showToast('字幕提取失败或不可用')
    }
  }

  const downloadCover = (bvid: string) => {
    const url = `${baseUrl}/api/videos/${bvid}/cover/download`
    window.open(url, '_blank')
  }

  const applyQuickDays = (days: number) => {
    const from = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD')
    const to = dayjs().format('YYYY-MM-DD')
    setQuickDays(days)
    setCustomDate(false)
    setPublishFrom(from)
    setPublishTo(to)
    setDateRange({
      from: dayjs(from).toDate(),
      to: dayjs(to).toDate(),
    })
  }

  const canClear = labels.length > 0 || !!publishFrom || !!publishTo || quickDays !== null || customDate || !!minViews || sortKey !== 'publish_time' || sortOrder !== 'desc'

  const getVideoUrl = (video: Video) => {
    if (video.video_url) return video.video_url
    return `https://www.bilibili.com/video/${video.bvid}`
  }

  const formatDelta = (value?: number | null) => {
    if (value === null || value === undefined) return '-'
    const prefix = value > 0 ? '+' : ''
    return `${prefix}${formatCount(value)}`
  }

  const clearAll = () => {
    setLabels([])
    setPublishFrom('')
    setPublishTo('')
    setQuickDays(null)
    setCustomDate(false)
    setDateRange(undefined)
    setMinViews('')
    setSortKey('publish_time')
    setSortOrder('desc')
  }

  const applyRange = (range?: DateRange) => {
    setDateRange(range)
    if (!range?.from && !range?.to) {
      setPublishFrom('')
      setPublishTo('')
      return
    }
    const from = range?.from ? dayjs(range.from).format('YYYY-MM-DD') : ''
    const to = range?.to ? dayjs(range.to).format('YYYY-MM-DD') : ''
    setPublishFrom(from)
    setPublishTo(to)
  }

  const presets = useMemo(
    () => [
      {
        label: '今天',
        range: () => {
          const today = dayjs()
          return { from: today.startOf('day').toDate(), to: today.startOf('day').toDate() }
        },
      },
      {
        label: '昨天',
        range: () => {
          const day = dayjs().subtract(1, 'day')
          return { from: day.startOf('day').toDate(), to: day.startOf('day').toDate() }
        },
      },
      {
        label: '最近7天',
        range: () => {
          const to = dayjs().startOf('day')
          const from = to.subtract(6, 'day')
          return { from: from.toDate(), to: to.toDate() }
        },
      },
      {
        label: '这个月',
        range: () => {
          const now = dayjs()
          return { from: now.startOf('month').toDate(), to: now.startOf('day').toDate() }
        },
      },
      {
        label: '上个月',
        range: () => {
          const last = dayjs().subtract(1, 'month')
          return { from: last.startOf('month').toDate(), to: last.endOf('month').toDate() }
        },
      },
      {
        label: '上个季度',
        range: () => {
          const now = dayjs()
          const currentQuarter = Math.floor(now.month() / 3) + 1
          let year = now.year()
          let startMonth = (currentQuarter - 2) * 3
          if (startMonth < 0) {
            startMonth = 9
            year -= 1
          }
          const start = dayjs().year(year).month(startMonth).startOf('month')
          const end = start.add(2, 'month').endOf('month')
          return { from: start.toDate(), to: end.toDate() }
        },
      },
    ],
    []
  )

  const openSubtitleModal = async (bvid: string) => {
    const next = subtitleModal === bvid ? null : bvid
    setSubtitleModal(next)
    setSubtitleSearch('')
    if (!next) return
    let status = subtitleMap[bvid]?.status || 'none'
    if (!subtitleMap[bvid]) {
      const data = await fetchSubtitle(bvid)
      status = (data?.status as SubtitleState['status']) || status
    }
    if (status === 'none' || status === 'failed') {
      await startExtractSubtitle(bvid)
    }
  }

  const closeSubtitleModal = () => {
    setSubtitleModal(null)
    setSubtitleSearch('')
  }

  const escapeHtml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const highlightText = (text: string, query: string) => {
    if (!query) return escapeHtml(text)
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'gi')
    return escapeHtml(text).replace(regex, (match) => `<mark>${match}</mark>`)
  }

  const getDisplayStatus = (state?: SubtitleState) => {
    if (!state) return 'none'
    if (state.status === 'extracting') return 'extracting'
    if (state.status === 'done') return 'done'
    const err = (state.error || '').toLowerCase()
    if (state.status === 'failed' && (err.includes('subtitle not found') || err.includes('no subtitle'))) {
      return 'none'
    }
    return state.status
  }

  const getWordCount = (text?: string) => {
    if (!text) return 0
    return text.replace(/\s+/g, '').length
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>视频库</h1>
          <p>按标签与发布时间快速筛选。</p>
        </div>
        <ExportPanel
          baseUrl={baseUrl}
          label='导出筛选'
          filters={{
            tags: labels.join(','),
            publish_from: publishFrom,
            publish_to: publishTo,
          }}
        />
      </header>

      <div className='filters'>
        <div className='filters-top'>
          <div className='filter-block tags-block'>
            <label>标签/关键词</label>
            <TagInput
              value={labels}
              suggestions={tagOptions}
              onChange={setLabels}
              placeholder='选择或输入标签'
            />
          </div>
          <div className='filter-block publish-block'>
            <label>发布时间</label>
            <div className='date-quick'>
              <button className={`btn ghost small ${quickDays === 3 ? 'active' : ''}`} onClick={() => applyQuickDays(3)}>3天内</button>
              <button className={`btn ghost small ${quickDays === 7 ? 'active' : ''}`} onClick={() => applyQuickDays(7)}>7天内</button>
              <button className={`btn ghost small ${quickDays === 15 ? 'active' : ''}`} onClick={() => applyQuickDays(15)}>15天内</button>
              <button
                className={`btn ghost small ${customDate ? 'active' : ''}`}
                onClick={() => {
                  setQuickDays(null)
                  setCustomDate(true)
                  if (publishFrom || publishTo) {
                    setDateRange({
                      from: publishFrom ? dayjs(publishFrom).toDate() : undefined,
                      to: publishTo ? dayjs(publishTo).toDate() : undefined,
                    })
                  }
                }}
              >
                自定义
              </button>
            </div>
          </div>
          <div className='filter-block'>
            <label>最小播放量</label>
            <input
              className='filter-control'
              type='number'
              min='0'
              step='1'
              placeholder='输入播放量'
              value={minViews}
              onChange={(e) => setMinViews(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
          <div className='filter-block'>
            <label>排序</label>
            <select
              className='filter-control'
              value={`${sortKey}:${sortOrder}`}
              onChange={(e) => {
                const [key, order] = e.target.value.split(':')
                setSortKey(key)
                setSortOrder(order as 'asc' | 'desc')
              }}
            >
              <option value='publish_time:desc'>发布时间 新→旧</option>
              <option value='publish_time:asc'>发布时间 旧→新</option>
              <option value='views:desc'>播放量 高→低</option>
              <option value='views:asc'>播放量 低→高</option>
              <option value='views_delta_1d:desc'>单日播放新增 高→低</option>
              <option value='views_delta_1d:asc'>单日播放新增 低→高</option>
            </select>
          </div>
          <div className='filter-actions'>
            <button className='btn ghost small' onClick={clearAll} disabled={!canClear}>清空全部</button>
          </div>
        </div>
        {customDate && (
          <div className='filters-bottom'>
            <div className='date-picker-panel'>
              <div className='date-picker-header'>
                <span>选择日期区间</span>
                <div className='date-range-summary'>
                  {publishFrom || '--'} <span>至</span> {publishTo || '--'}
                </div>
              </div>
              <DayPicker
                mode='range'
                numberOfMonths={2}
                selected={dateRange}
                onSelect={(range) => {
                  setQuickDays(null)
                  setCustomDate(true)
                  applyRange(range)
                }}
              />
              <div className='date-picker-footer'>
                <div className='preset-row'>
                  {presets.map((preset) => (
                    <button
                      key={preset.label}
                      className='btn ghost small'
                      onClick={() => {
                        setQuickDays(null)
                        setCustomDate(true)
                        const next = preset.range()
                        applyRange(next)
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button className='btn primary small' onClick={() => setCustomDate(false)}>确定</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className='bulk-bar'>
          <div className='select-all'>
            <input type='checkbox' checked={allSelected} onChange={toggleSelectAll} />
            <span>已选 {selected.length} 条</span>
          </div>
          <div className='bulk-actions'>
            <button className='btn ghost' onClick={() => batchUpdateStatus('done')}>批量标记已处理</button>
            <button className='btn ghost' onClick={() => batchUpdateStatus('todo')}>批量标记待处理</button>
            <button className='btn ghost' onClick={batchExtractSubtitles}>批量提取字幕</button>
            <button className='btn ghost' onClick={batchDownloadCovers}>批量下载封面</button>
            <ExportPanel
              baseUrl={baseUrl}
              label={`导出选中(${selected.length})`}
              filters={{ bvids: selected.join(',') }}
            />
          </div>
        </div>
      )}

      {loading && <Empty label='加载中...' />}
      {!loading && videos.length === 0 && <Empty label='暂无数据' />}
      {!loading && videos.length > 0 && (
        <section className='video-grid'>
          {videos.map((v) => (
            <div key={v.bvid} className='video-card'>
              <div className='card-check'>
                <input type='checkbox' checked={selected.includes(v.bvid)} onChange={() => toggleSelect(v.bvid)} />
              </div>
              <div className='cover'>
                <a
                  className='cover-link'
                  href={getVideoUrl(v)}
                  target='_blank'
                  rel='noreferrer'
                  onClick={(e) => e.stopPropagation()}
                >
                  {!coverError[v.bvid] ? (
                    <img
                      src={`${baseUrl}/api/videos/${v.bvid}/cover`}
                      alt={v.title}
                      loading='lazy'
                      onError={() => setCoverError((prev) => ({ ...prev, [v.bvid]: true }))}
                    />
                  ) : (
                    <div className='cover-placeholder'>No Cover</div>
                  )}
                </a>
              </div>
              <div className='video-body'>
                <h3>
                  <a
                    className='video-title'
                    href={getVideoUrl(v)}
                    target='_blank'
                    rel='noreferrer'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {v.title}
                  </a>
                </h3>
                <div className='video-sub'>
                  发布时间：{v.publish_time ? dayjs(v.publish_time).format('YYYY-MM-DD') : '-'} · 单日新增：{formatDelta(v.views_delta_1d)}
                </div>
                <div className='video-author'>
                  {v.up_name} · 粉丝 {formatCount(v.follower_count)}
                </div>
                <div className='stat-grid'>
                  <div className='stat-item'>
                    <span>播放量</span>
                    <strong>{formatCount(v.stats.views)}</strong>
                  </div>
                  <div className='stat-item'>
                    <span>评论</span>
                    <strong>{formatCount(v.stats.reply)}</strong>
                  </div>
                  <div className='stat-item'>
                    <span>收藏</span>
                    <strong>{formatCount(v.stats.fav)}</strong>
                  </div>
                  <div className='stat-item'>
                    <span>投币</span>
                    <strong>{formatCount(v.stats.coin)}</strong>
                  </div>
                </div>
                <div className='tags-row'>
                  {v.tags.basic_hot.is_hit && <span className='pill hot'>爆款</span>}
                  {v.tags.low_fan_hot.is_hit && <span className='pill low'>低粉爆款</span>}
                  <span className='pill status'>{v.process_status === 'done' ? '已处理' : '待处理'}</span>
                  {v.labels && v.labels.length > 0 && (
                    <span className='tag-text'>标签：{v.labels.join(' / ')}</span>
                  )}
                </div>
                <div className='video-actions'>
                  <div className='subtitle-actions'>
                    <button
                      className='btn ghost'
                      onClick={() => openSubtitleModal(v.bvid)}
                      disabled={subtitleMap[v.bvid]?.status === 'extracting'}
                      title='打开字幕弹窗'
                    >
                      字幕
                    </button>
                  </div>
                  <button className='btn ghost' onClick={() => downloadCover(v.bvid)}>封面海报</button>
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
      {subtitleModal && (
        <div className='subtitle-modal-mask' onClick={closeSubtitleModal}>
          <div className='subtitle-modal' onClick={(e) => e.stopPropagation()}>
            {(() => {
              const state = subtitleMap[subtitleModal]
              const displayStatus = getDisplayStatus(state)
              const text = state?.text || ''
              const wordCount = getWordCount(text)
              const updatedAt = state?.updatedAt ? dayjs(state.updatedAt).format('YYYY-MM-DD HH:mm') : ''
              const errorSummary = state?.error || ''
              const errorDetail = state?.errorDetail || ''
              return (
                <>
                  <header className='subtitle-modal-header'>
                    <div className='subtitle-status'>
                      <span className={`status-pill ${displayStatus}`}>{
                        displayStatus === 'extracting'
                          ? '提取中'
                          : displayStatus === 'done'
                            ? '已提取'
                            : displayStatus === 'failed'
                              ? '失败'
                              : '无字幕'
                      }</span>
                      {displayStatus === 'done' && (
                        <span className='status-meta'>字数 {wordCount} · 更新 {updatedAt || '-'}</span>
                      )}
                    </div>
                    <div className='subtitle-search'>
                      <input
                        type='search'
                        value={subtitleSearch}
                        onChange={(e) => setSubtitleSearch(e.target.value)}
                        placeholder='搜索字幕关键词'
                      />
                    </div>
                  </header>
                  <div className='subtitle-modal-body'>
                    <div className='subtitle-text'>
                      {text ? (
                        <div
                          className='subtitle-text-content'
                          dangerouslySetInnerHTML={{ __html: highlightText(text, subtitleSearch.trim()) }}
                        />
                      ) : (
                        <div className='subtitle-empty'>
                          {displayStatus === 'extracting'
                            ? '字幕正在提取，请稍候…'
                            : displayStatus === 'failed'
                              ? '提取失败'
                              : '未获取到字幕'}
                        </div>
                      )}
                    </div>
                    {displayStatus === 'done' && (
                      <p className='subtitle-guide'>字幕已提取，你可以复制全部字幕或下载为TXT文件。</p>
                    )}
                    {displayStatus === 'none' && (
                      <div className='subtitle-error'>
                        <p>未获取到公开视频字幕</p>
                        <button className='btn ghost' onClick={() => startExtractSubtitle(subtitleModal)}>重试</button>
                      </div>
                    )}
                    {displayStatus === 'failed' && (
                      <div className='subtitle-error'>
                        <p>提取失败</p>
                        {errorSummary && <div className='error-summary'>{errorSummary}</div>}
                        {errorDetail && (
                          <details className='error-detail'>
                            <summary>错误详情</summary>
                            <pre>{errorDetail}</pre>
                          </details>
                        )}
                        <button className='btn ghost' onClick={() => startExtractSubtitle(subtitleModal)}>重试</button>
                      </div>
                    )}
                  </div>
                  <footer className='subtitle-modal-footer'>
                    {displayStatus === 'extracting' && <button className='btn primary' disabled>提取中...</button>}
                    {displayStatus === 'done' && (
                      <>
                        <button className='btn primary' onClick={() => copySubtitle(subtitleModal)}>复制全部</button>
                        <button className='btn ghost' onClick={() => downloadSubtitle(subtitleModal)}>下载TXT</button>
                      </>
                    )}
                    <button className='btn ghost' onClick={closeSubtitleModal}>关闭</button>
                  </footer>
                </>
              )
            })()}
          </div>
        </div>
      )}
      {toast && <div className='toast'>{toast}</div>}
    </div>
  )
}
