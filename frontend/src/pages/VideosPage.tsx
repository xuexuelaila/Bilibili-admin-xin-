import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
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
  stats: { views: number; fav: number; coin: number; reply: number; fav_rate: number; coin_rate: number; reply_rate: number; fav_fan_ratio: number }
  tags: { basic_hot: { is_hit: boolean }; low_fan_hot: { is_hit: boolean } }
  labels: string[]
  process_status: string
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [coverError, setCoverError] = useState<Record<string, boolean>>({})
  const [subtitleMenu, setSubtitleMenu] = useState<string | null>(null)
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (labels.length > 0) params.set('labels', labels.join(','))
    if (publishFrom) params.set('publish_from', publishFrom)
    if (publishTo) params.set('publish_to', publishTo)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    const res = await api.get(`/api/videos?${params.toString()}`)
    setVideos(res.data.items)
    setTotal(res.data.total || 0)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [labels, publishFrom, publishTo, page, pageSize])

  useEffect(() => {
    api.get('/api/tags').then((res) => setTagOptions(res.data.items || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setPage(1)
  }, [labels, publishFrom, publishTo])

  useEffect(() => {
    setSelected([])
  }, [labels, publishFrom, publishTo, page, pageSize])

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
    const failed = data.failed || []
    const ok = data.updated || 0
    const totalCount = data.total || selected.length
    const failCount = failed.length
    let message = `字幕提取完成：成功 ${ok} / 失败 ${failCount} / 总计 ${totalCount}`
    if (failCount > 0) {
      message += `\n失败示例：${failed.slice(0, 5).map((f: any) => f.bvid).join(', ')}`
    }
    window.alert(message)
  }

  const batchDownloadCovers = () => {
    if (selected.length === 0) return
    const url = `${baseUrl}/api/videos/cover/download/batch?bvids=${selected.join(',')}`
    window.open(url, '_blank')
  }

  const ensureSubtitleText = async (bvid: string) => {
    try {
      const res = await api.get(`/api/videos/${bvid}/subtitle`)
      return res.data?.text || ''
    } catch {
      const res = await api.post(`/api/videos/${bvid}/subtitle/extract`)
      if (res.data?.status === 'failed') {
        throw new Error('字幕提取失败')
      }
      const sub = await api.get(`/api/videos/${bvid}/subtitle`)
      return sub.data?.text || ''
    }
  }

  const copySubtitle = async (bvid: string) => {
    try {
      const text = await ensureSubtitleText(bvid)
      if (!text) {
        window.alert('未获取到字幕')
        return
      }
      await navigator.clipboard.writeText(text)
      window.alert('字幕已复制')
    } catch {
      window.alert('字幕提取失败或不可用')
    }
  }

  const downloadSubtitle = async (bvid: string) => {
    try {
      const text = await ensureSubtitleText(bvid)
      if (!text) {
        window.alert('未获取到字幕')
        return
      }
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${bvid}.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      window.alert('字幕提取失败或不可用')
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
    setPublishFrom(from)
    setPublishTo(to)
  }

  const handlePublishFrom = (value: string) => {
    setQuickDays(null)
    setPublishFrom(value)
  }

  const handlePublishTo = (value: string) => {
    setQuickDays(null)
    setPublishTo(value)
  }

  const canClear = labels.length > 0 || !!publishFrom || !!publishTo || quickDays !== null

  const clearAll = () => {
    setLabels([])
    setPublishFrom('')
    setPublishTo('')
    setQuickDays(null)
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
            labels: labels.join(','),
            publish_from: publishFrom,
            publish_to: publishTo,
          }}
        />
      </header>

      <div className='filters'>
        <div className='filter-block'>
          <div className='filter-header'>
            <label>标签筛选</label>
            <button className='btn ghost small' onClick={clearAll} disabled={!canClear}>清空全部</button>
          </div>
          <TagInput
            value={labels}
            suggestions={tagOptions}
            onChange={setLabels}
            placeholder='选择或输入标签'
          />
        </div>
        <div className='filter-block'>
          <label>发布时间</label>
          <div className='date-quick'>
            <button className={`btn ghost small ${quickDays === 3 ? 'active' : ''}`} onClick={() => applyQuickDays(3)}>3天内</button>
            <button className={`btn ghost small ${quickDays === 7 ? 'active' : ''}`} onClick={() => applyQuickDays(7)}>7天内</button>
            <button className={`btn ghost small ${quickDays === 15 ? 'active' : ''}`} onClick={() => applyQuickDays(15)}>15天内</button>
            <button className={`btn ghost small ${quickDays === null ? 'active' : ''}`} onClick={() => setQuickDays(null)}>自定义</button>
          </div>
          <div className='date-range'>
            <input type='date' value={publishFrom} onChange={(e) => handlePublishFrom(e.target.value)} />
            <span>至</span>
            <input type='date' value={publishTo} onChange={(e) => handlePublishTo(e.target.value)} />
          </div>
        </div>
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
              </div>
              <div className='video-body'>
                <h3><Link className='video-title' to={`/videos/${v.bvid}`}>{v.title}</Link></h3>
                <div className='video-sub'>
                  发布时间：{v.publish_time ? dayjs(v.publish_time).format('YYYY-MM-DD') : '-'}
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
                    <button className='btn ghost' onClick={() => setSubtitleMenu(subtitleMenu === v.bvid ? null : v.bvid)}>字幕</button>
                    {subtitleMenu === v.bvid && (
                      <div className='subtitle-menu'>
                        <button className='subtitle-item' onMouseDown={(e) => { e.preventDefault(); copySubtitle(v.bvid) }}>复制字幕</button>
                        <button className='subtitle-item' onMouseDown={(e) => { e.preventDefault(); downloadSubtitle(v.bvid) }}>下载字幕</button>
                      </div>
                    )}
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
    </div>
  )
}
