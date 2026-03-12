import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import { CoversPanel } from './CoversPage'
import ExportPanel from '../components/ExportPanel'
import '../components/ExportPanel.css'
import Pagination from '../components/Pagination'
import '../components/Pagination.css'
import Empty from '../components/Empty'
import TagInput from '../components/TagInput'
import './VideosPage.css'

type DateRangeValue = { from?: Date; to?: Date }

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
  is_favorited?: boolean
  favorited_at?: string | null
  status_updated_at?: string | null
  is_cover_favorited?: boolean
  cover_favorite_id?: string | null
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

interface FrameJobState {
  id: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'canceled'
  progress?: number | null
  generated_frames?: number
  frame_count?: number
  error_msg?: string | null
  output_dir?: string | null
}

interface FrameItem {
  id: string
  idx: number
  timestamp_ms: number | null
  frame_url: string
  is_favorited?: boolean
}

const formatCount = (value: number) => {
  if (value >= 10000) {
    const num = value / 10000
    return `${num.toFixed(num >= 100 ? 0 : 1)}w`
  }
  return String(value)
}

export default function VideosPage() {
  const [libraryTab, setLibraryTab] = useState<'videos' | 'covers'>('videos')
  const [videos, setVideos] = useState<Video[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [publishFrom, setPublishFrom] = useState('')
  const [publishTo, setPublishTo] = useState('')
  const [quickDays, setQuickDays] = useState<number | null>(null)
  const [customDate, setCustomDate] = useState(false)
  const [bvidKeyword, setBvidKeyword] = useState('')
  const [titleKeyword, setTitleKeyword] = useState('')
  const [minFans, setMinFans] = useState('')
  const [sortKey, setSortKey] = useState('publish_time')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [favoritedOnly, setFavoritedOnly] = useState(false)
  const [statusTab, setStatusTab] = useState('todo')
  const [bulkStatus, setBulkStatus] = useState('todo')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [coverError, setCoverError] = useState<Record<string, boolean>>({})
  const [subtitleModal, setSubtitleModal] = useState<string | null>(null)
  const [subtitleSearch, setSubtitleSearch] = useState('')
  const [subtitleMap, setSubtitleMap] = useState<Record<string, SubtitleState>>({})
  const [subtitleProgress, setSubtitleProgress] = useState<Record<string, { progress: number; stage: string }>>({})
  const [subtitleToast, setSubtitleToast] = useState<{ bvid: string; message: string } | null>(null)
  const [subtitleCardVisible, setSubtitleCardVisible] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [frameModal, setFrameModal] = useState<string | null>(null)
  const [frameVideo, setFrameVideo] = useState<Video | null>(null)
  const [frameMode, setFrameMode] = useState<'scene' | 'interval'>('scene')
  const [frameInterval, setFrameInterval] = useState(2)
  const [frameThreshold, setFrameThreshold] = useState(0.35)
  const [frameMax, setFrameMax] = useState(120)
  const [frameResolution, setFrameResolution] = useState<'720p' | '1080p'>('720p')
  const [frameJob, setFrameJob] = useState<FrameJobState | null>(null)
  const [frameItems, setFrameItems] = useState<FrameItem[]>([])
  const [framePage, setFramePage] = useState(1)
  const [frameTotal, setFrameTotal] = useState(0)
  const [frameSubmitting, setFrameSubmitting] = useState(false)
  const [framePreviewIndex, setFramePreviewIndex] = useState<number | null>(null)
  const [frameOnlyFavorited, setFrameOnlyFavorited] = useState(false)
  const [frameSelected, setFrameSelected] = useState<string[]>([])
  const [showFrameConfig, setShowFrameConfig] = useState(false)
  const frameModalBodyRef = useRef<HTMLDivElement | null>(null)
  const [tagModal, setTagModal] = useState<Video | null>(null)
  const [tagDraft, setTagDraft] = useState<string[]>([])
  const [tagSaving, setTagSaving] = useState(false)
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  const framePageSize = 80

  const load = async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (labels.length > 0) params.set('tags', labels.join(','))
    if (publishFrom) params.set('publish_from', publishFrom)
    if (publishTo) params.set('publish_to', publishTo)
    if (bvidKeyword.trim()) params.set('bvid', bvidKeyword.trim())
    if (titleKeyword.trim()) params.set('title', titleKeyword.trim())
    if (minFans) params.set('min_fans', minFans)
    if (favoritedOnly) params.set('is_favorited', 'true')
    if (statusTab && statusTab !== 'all') params.set('status', statusTab)
    if (sortKey) params.set('sort', sortKey)
    if (sortOrder) params.set('order', sortOrder)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    try {
      const res = await api.get(`/api/videos?${params.toString()}`)
      setVideos(res.data.items)
      setTotal(res.data.total || 0)
    } catch (err: any) {
      const message = err?.response?.data?.detail || '加载失败，请稍后重试'
      setError(message)
      setVideos([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (libraryTab !== 'videos') return
    load()
  }, [libraryTab, labels, publishFrom, publishTo, bvidKeyword, titleKeyword, minFans, favoritedOnly, statusTab, sortKey, sortOrder, page, pageSize])

  useEffect(() => {
    api.get('/api/tags').then((res) => setTagOptions(res.data.items || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (libraryTab !== 'videos') return
    setPage(1)
  }, [libraryTab, labels, publishFrom, publishTo, bvidKeyword, titleKeyword, minFans, favoritedOnly, statusTab, sortKey, sortOrder])

  useEffect(() => {
    if (libraryTab !== 'videos') return
    setSelected([])
  }, [libraryTab, labels, publishFrom, publishTo, bvidKeyword, titleKeyword, minFans, favoritedOnly, statusTab, sortKey, sortOrder, page, pageSize])

  useEffect(() => {
    setCoverError({})
  }, [videos])

  useEffect(() => {
    if (framePreviewIndex !== null && framePreviewIndex >= frameItems.length) {
      setFramePreviewIndex(null)
    }
  }, [frameItems, framePreviewIndex])

  useEffect(() => {
    setFrameSelected([])
  }, [frameItems])

  useEffect(() => {
    if (!frameModal) return
    frameModalBodyRef.current?.scrollTo({ top: 0 })
  }, [frameModal, showFrameConfig, frameJob?.status])

  const allSelected = videos.length > 0 && selected.length === videos.length

  const toggleSelect = (bvid: string) => {
    setSelected((prev) => (prev.includes(bvid) ? prev.filter((id) => id !== bvid) : [...prev, bvid]))
  }

  const toggleSelectAll = () => {
    setSelected(allSelected ? [] : videos.map((v) => v.bvid))
  }

  const batchUpdateStatusV2 = async () => {
    if (selected.length === 0) return
    await api.post('/api/videos/batch/status', { bvids: selected, process_status: bulkStatus })
    await load()
    setSelected([])
  }

  const batchFavorite = async (next: boolean) => {
    if (selected.length === 0) return
    await api.post('/api/videos/batch/favorite', { bvids: selected, is_favorited: next })
    await load()
    setSelected([])
    showToast(next ? '已收藏' : '已取消收藏')
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
  const showSubtitleToast = (bvid: string, message: string) => {
    setSubtitleToast({ bvid, message })
    window.setTimeout(() => setSubtitleToast(null), 4000)
  }

  const updateSubtitleProgress = (bvid: string, progress: number, stage: string) => {
    setSubtitleProgress((prev) => ({
      ...prev,
      [bvid]: { progress, stage },
    }))
  }

  const openFrameModal = async (video: Video) => {
    setFrameModal(video.bvid)
    setFrameVideo(video)
    setFrameJob(null)
    setFrameItems([])
    setFramePage(1)
    setFrameTotal(0)
    setFrameOnlyFavorited(false)
    setShowFrameConfig(false)
    setFrameSelected([])
    await loadLatestFrameJob(video.bvid)
  }

  const closeFrameModal = () => {
    setFrameModal(null)
    setFrameVideo(null)
    setFrameJob(null)
    setFrameItems([])
    setFramePage(1)
    setFrameTotal(0)
    setFramePreviewIndex(null)
    setFrameOnlyFavorited(false)
    setFrameSelected([])
    setShowFrameConfig(false)
  }

  const loadLatestFrameJob = async (bvid: string) => {
    try {
      const res = await api.get(`/api/videos/${bvid}/frame_jobs`)
      const job = res.data?.job
      if (!job) {
        setFrameJob(null)
        return null
      }
      setFrameJob(job)
      if (job.status === 'success') {
        await fetchFrames(job.id, 1)
      }
      return job
    } catch {
      setFrameJob(null)
      return null
    }
  }

  const startFrameJob = async (bvid: string) => {
    try {
      if (frameVideo && frameVideo.process_status !== 'to_shoot') {
        showToast('请先将视频标记为「待拍摄」后再拆解')
        return
      }
      setFrameSubmitting(true)
      setFrameItems([])
      setFramePage(1)
      setFrameTotal(0)
      const payload: Record<string, unknown> = {
        mode: frameMode,
        max_frames: Math.min(Math.max(frameMax || 120, 1), 300),
        resolution: frameResolution,
      }
      if (frameMode === 'interval') payload.interval_sec = frameInterval
      if (frameMode === 'scene') payload.scene_threshold = frameThreshold
      const res = await api.post(`/api/videos/${bvid}/frame_jobs`, payload)
      setFrameJob({ id: res.data.job_id, status: 'pending', progress: 0, generated_frames: 0 })
      setShowFrameConfig(false)
    } catch (error: any) {
      const detail = error?.response?.data?.detail || '创建任务失败'
      if (detail === 'VIDEO_NOT_TO_SHOOT') {
        showToast('请先将视频标记为「待拍摄」后再拆解')
      } else {
        showToast(detail)
      }
    } finally {
      setFrameSubmitting(false)
    }
  }

  const fetchFrameJob = async (jobId: string) => {
    const res = await api.get(`/api/frame_jobs/${jobId}`)
    setFrameJob(res.data)
    return res.data
  }

  const fetchFrames = async (jobId: string, pageNum = 1, onlyFavorited = frameOnlyFavorited) => {
    const res = await api.get(
      `/api/frame_jobs/${jobId}/frames?page=${pageNum}&page_size=${framePageSize}&only_favorited=${onlyFavorited ? 'true' : 'false'}`
    )
    setFrameItems(res.data.items || [])
    setFrameTotal(res.data.total || 0)
  }

  const cancelFrameJob = async (jobId: string) => {
    await api.post(`/api/frame_jobs/${jobId}/cancel`)
    await fetchFrameJob(jobId)
  }

  useEffect(() => {
    if (!frameJob?.id) return
    if (frameJob.status === 'running' || frameJob.status === 'pending') {
      const timer = window.setInterval(async () => {
        const data = await fetchFrameJob(frameJob.id)
        if (data.status === 'success') {
          await fetchFrames(frameJob.id, 1, frameOnlyFavorited)
        }
      }, 1500)
      return () => window.clearInterval(timer)
    }
    if (frameJob.status === 'success') {
      fetchFrames(frameJob.id, framePage, frameOnlyFavorited)
    }
  }, [frameJob?.id, frameJob?.status, framePage, frameOnlyFavorited])

  const updateFavorite = async (video: Video) => {
    const next = !video.is_favorited
    await api.post(`/api/videos/${video.bvid}/favorite`, { is_favorited: next })
    setVideos((prev) =>
      prev.map((v) =>
        v.bvid === video.bvid
          ? {
              ...v,
              is_favorited: next,
              favorited_at: next ? new Date().toISOString() : null,
            }
          : v
      )
    )
    showToast(next ? '已收藏' : '已取消收藏')
  }

  const updateCoverFavorite = async (video: Video) => {
    const isOn = Boolean(video.is_cover_favorited)
    if (isOn && video.cover_favorite_id) {
      await api.post('/api/covers/unfavorite', { id: video.cover_favorite_id })
      setVideos((prev) =>
        prev.map((v) =>
          v.bvid === video.bvid
            ? { ...v, is_cover_favorited: false, cover_favorite_id: null }
            : v
        )
      )
      showToast('已取消封面收藏')
      return
    }
    const res = await api.post('/api/covers/favorite', {
      bvid: video.bvid,
      cover_url: video.cover_url,
    })
    if (res.data?.ok === false && res.data?.reason === 'duplicate') {
      setVideos((prev) =>
        prev.map((v) =>
          v.bvid === video.bvid
            ? { ...v, is_cover_favorited: true, cover_favorite_id: res.data?.id || v.cover_favorite_id }
            : v
        )
      )
      showToast('已在封面库')
      return
    }
    setVideos((prev) =>
      prev.map((v) =>
        v.bvid === video.bvid
          ? { ...v, is_cover_favorited: true, cover_favorite_id: res.data?.id || v.cover_favorite_id }
          : v
      )
    )
    showToast('已收藏封面')
  }

  const updateProcessStatus = async (video: Video, status: string) => {
    await api.post(`/api/videos/${video.bvid}/process_status`, { process_status: status })
    setVideos((prev) => {
      if (statusTab !== 'all' && statusTab !== status) {
        return prev.filter((v) => v.bvid !== video.bvid)
      }
      return prev.map((v) =>
        v.bvid === video.bvid
          ? {
              ...v,
              process_status: status,
              status_updated_at: new Date().toISOString(),
            }
          : v
      )
    })
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

  const pollSubtitle = async (bvid: string, attempts = 60, interval = 2000) => {
    const startedAt = Date.now()
    const current = subtitleProgress[bvid]?.progress || 0
    updateSubtitleProgress(bvid, Math.max(current, 10), '准备中')
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
        const elapsed = Date.now() - startedAt
        if (status === 'extracting') {
          if (elapsed < 30_000) {
            updateSubtitleProgress(bvid, Math.min(20 + (elapsed / 30_000) * 20, 40), '识别中')
          } else if (elapsed < 90_000) {
            updateSubtitleProgress(bvid, Math.min(40 + (elapsed - 30_000) / 60_000 * 40, 80), '识别中')
          } else if (elapsed < 120_000) {
            updateSubtitleProgress(bvid, Math.min(80 + (elapsed - 90_000) / 30_000 * 15, 95), '生成中')
          } else {
            updateSubtitleProgress(bvid, 96, '保存中')
          }
        }
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
    updateSubtitleProgress(bvid, 5, '准备中')
    await api.post(`/api/videos/${bvid}/subtitle/extract`)
    try {
      const text = await pollSubtitle(bvid)
      updateSubtitleProgress(bvid, 100, '完成')
      return text || ''
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('超时')) {
        // Keep showing extracting; the backend job may still be running.
        updateSubtitleState(bvid, { status: 'extracting' })
        updateSubtitleProgress(bvid, Math.min(subtitleProgress[bvid]?.progress || 90, 95), '保存中')
      } else {
        updateSubtitleState(bvid, { status: 'failed' })
        updateSubtitleProgress(bvid, 0, '失败')
      }
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
  }

  const canClear = labels.length > 0 || !!publishFrom || !!publishTo || quickDays !== null || customDate || !!bvidKeyword || !!titleKeyword || !!minFans || favoritedOnly || statusTab !== 'todo' || sortKey !== 'publish_time' || sortOrder !== 'desc'

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
    setBvidKeyword('')
    setTitleKeyword('')
    setMinFans('')
    setFavoritedOnly(false)
    setStatusTab('todo')
    setSortKey('publish_time')
    setSortOrder('desc')
  }

  const statusOptions = [
    { value: 'todo', label: '待处理' },
    { value: 'to_shoot', label: '待拍摄' },
    { value: 'shot', label: '已拍摄' },
    { value: 'published', label: '已发布' },
    { value: 'dropped', label: '淘汰' },
  ]

  const statusLabelMap = statusOptions.reduce<Record<string, string>>((acc, item) => {
    acc[item.value] = item.label
    return acc
  }, {})

  const statusTabs = [
    { value: 'todo', label: '待处理' },
    { value: 'to_shoot', label: '待拍摄' },
    { value: 'shot', label: '已拍摄' },
    { value: 'published', label: '已发布' },
    { value: 'dropped', label: '淘汰' },
    { value: 'all', label: '全部' },
  ]

  const applyRange = (range?: DateRangeValue) => {
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

  const formatTimestamp = (ms?: number | null) => {
    if (ms === null || ms === undefined) return ''
    const total = Math.max(0, Math.floor(ms / 1000))
    const mm = String(Math.floor(total / 60)).padStart(2, '0')
    const ss = String(total % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  const toggleFrameSelect = (frameId: string) => {
    setFrameSelected((prev) => (prev.includes(frameId) ? prev.filter((id) => id !== frameId) : [...prev, frameId]))
  }

  const toggleFrameSelectAll = () => {
    const allIds = frameItems.map((item) => item.id)
    const allSelected = allIds.length > 0 && frameSelected.length === allIds.length
    setFrameSelected(allSelected ? [] : allIds)
  }

  const toggleFrameFavorite = async (frame: FrameItem) => {
    if (frame.is_favorited) {
      await api.post(`/api/frames/${frame.id}/unfavorite`)
    } else {
      await api.post(`/api/frames/${frame.id}/favorite`, {})
    }
    setFrameItems((prev) =>
      prev.map((item) =>
        item.id === frame.id ? { ...item, is_favorited: !frame.is_favorited } : item
      )
    )
    if (frameOnlyFavorited && frame.is_favorited && frameJob?.id) {
      await fetchFrames(frameJob.id, framePage, frameOnlyFavorited)
    }
  }

  const openTagModal = (video: Video) => {
    setTagModal(video)
    setTagDraft(video.labels || [])
  }

  const closeTagModal = () => {
    setTagModal(null)
    setTagDraft([])
  }

  const saveVideoTags = async () => {
    if (!tagModal) return
    setTagSaving(true)
    try {
      const res = await api.post(`/api/videos/${tagModal.bvid}/tags`, { tags: tagDraft })
      const nextTags = res.data?.tags || tagDraft
      setVideos((prev) =>
        prev.map((v) => (v.bvid === tagModal.bvid ? { ...v, labels: nextTags } : v))
      )
      closeTagModal()
    } finally {
      setTagSaving(false)
    }
  }

  const batchFrameFavorite = async (next: boolean) => {
    if (frameSelected.length === 0) return
    await api.post('/api/frames/batch/favorite', { frame_ids: frameSelected, is_favorited: next })
    setFrameSelected([])
    if (frameJob?.id) {
      await fetchFrames(frameJob.id, framePage, frameOnlyFavorited)
    }
    showToast(next ? '已收藏' : '已取消收藏')
  }

  const frameStatusLabel = (status?: FrameJobState['status']) => {
    if (!status) return '未开始'
    if (status === 'pending') return '排队中'
    if (status === 'running') return '处理中'
    if (status === 'success') return '已完成'
    if (status === 'failed') return '失败'
    if (status === 'canceled') return '已取消'
    return status
  }

  const frameErrorMessage = (code?: string | null) => {
    if (!code) return '拆解失败，请重试'
    if (code === 'VIDEO_SOURCE_NOT_AVAILABLE') return '无法获取视频源'
    if (code === 'NO_FRAMES') return '未抽取到有效帧，可降低阈值或改用定频模式'
    return code
  }

  const handleStatusTab = (value: string) => {
    setStatusTab(value)
    setPage(1)
  }

  const openFramePreview = (index: number) => {
    setFramePreviewIndex(index)
  }

  const closeFramePreview = () => {
    setFramePreviewIndex(null)
  }

  const goPrevFrame = () => {
    if (framePreviewIndex === null) return
    setFramePreviewIndex((prev) => (prev === null ? null : Math.max(prev - 1, 0)))
  }

  const goNextFrame = () => {
    if (framePreviewIndex === null) return
    setFramePreviewIndex((prev) => {
      if (prev === null) return null
      return Math.min(prev + 1, frameItems.length - 1)
    })
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>视频库</h1>
          <p>按标签与发布时间快速筛选。</p>
        </div>
      </header>

      <div className='library-tabs'>
        <button className={`tab-btn ${libraryTab === 'videos' ? 'active' : ''}`} onClick={() => setLibraryTab('videos')}>
          视频库
        </button>
        <button className={`tab-btn ${libraryTab === 'covers' ? 'active' : ''}`} onClick={() => setLibraryTab('covers')}>
          封面库
        </button>
      </div>

      {libraryTab === 'covers' ? (
        <CoversPanel showHeader={false} />
      ) : (
        <>
      <div className='status-row'>
        <div className='status-tabs'>
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              className={`tab-btn ${statusTab === tab.value ? 'active' : ''}`}
              onClick={() => handleStatusTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className='status-actions'>
          <button
            className={`btn ghost small ${favoritedOnly ? 'active' : ''}`}
            onClick={() => setFavoritedOnly((prev) => !prev)}
          >
            ⭐ 只看收藏
          </button>
          <button className='btn ghost small weak' onClick={clearAll} disabled={!canClear}>清空全部</button>
        </div>
      </div>

      <div className='filters'>
        <div className='filters-grid'>
          <div className='filter-block span-5'>
            <label>标签/关键词</label>
            <TagInput
              value={labels}
              suggestions={tagOptions}
              onChange={setLabels}
              placeholder='选择或输入标签'
            />
          </div>
          <div className='filter-block span-4 time-block'>
            <label>发布时间</label>
            <div className='segmented'>
              <button className={quickDays === 3 ? 'active' : ''} onClick={() => applyQuickDays(3)}>3天</button>
              <button className={quickDays === 7 ? 'active' : ''} onClick={() => applyQuickDays(7)}>7天</button>
              <button className={quickDays === 15 ? 'active' : ''} onClick={() => applyQuickDays(15)}>15天</button>
              <button
                className={customDate ? 'active' : ''}
                onClick={() => {
                  setQuickDays(null)
                  setCustomDate(true)
                }}
              >
                自定义
              </button>
            </div>
            {customDate && (
              <div className='time-popover' onClick={(e) => e.stopPropagation()}>
                <div className='time-popover-header'>选择日期范围</div>
                <div className='time-popover-inputs'>
                  <input
                    type='date'
                    value={publishFrom}
                    onChange={(e) => applyRange({
                      from: e.target.value ? dayjs(e.target.value).toDate() : undefined,
                      to: publishTo ? dayjs(publishTo).toDate() : undefined,
                    })}
                  />
                  <span>至</span>
                  <input
                    type='date'
                    value={publishTo}
                    onChange={(e) => applyRange({
                      from: publishFrom ? dayjs(publishFrom).toDate() : undefined,
                      to: e.target.value ? dayjs(e.target.value).toDate() : undefined,
                    })}
                  />
                </div>
                <div className='time-popover-footer'>
                  <button className='btn ghost small' onClick={() => setCustomDate(false)}>收起</button>
                  <button className='btn primary small' onClick={() => setCustomDate(false)}>确定</button>
                </div>
              </div>
            )}
          </div>
          <div className='filter-block span-3'>
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
              <option value='favorited_at:desc'>收藏时间 新→旧</option>
              <option value='favorited_at:asc'>收藏时间 旧→新</option>
              <option value='status_updated_at:desc'>状态更新时间 新→旧</option>
              <option value='status_updated_at:asc'>状态更新时间 旧→新</option>
            </select>
          </div>
        </div>

        <div className='filters-grid'>
          <div className='filter-block span-4'>
            <label>BVID</label>
            <input
              className='filter-control'
              placeholder='输入BV号（支持逗号分隔）'
              value={bvidKeyword}
              onChange={(e) => setBvidKeyword(e.target.value)}
            />
          </div>
          <div className='filter-block span-5'>
            <label>视频标题关键词</label>
            <input
              className='filter-control'
              placeholder='输入标题关键词'
              value={titleKeyword}
              onChange={(e) => setTitleKeyword(e.target.value)}
            />
          </div>
          <div className='filter-block span-3'>
            <label>粉丝量 ≥</label>
            <input
              className='filter-control'
              type='number'
              min='0'
              step='1'
              placeholder='例如 1000'
              value={minFans}
              onChange={(e) => setMinFans(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
        </div>

      </div>

      <div className='filter-summary'>
        <div className='summary-text'>
          {(() => {
            const items: string[] = []
            if (statusTab && statusTab !== 'all') items.push(`状态 ${statusLabelMap[statusTab] || statusTab}`)
            if (labels.length) items.push(`标签 ${labels.join('、')}`)
            if (quickDays) items.push(`发布时间 ${quickDays}天内`)
            if (!quickDays && (publishFrom || publishTo)) items.push(`发布时间 ${publishFrom || '--'}~${publishTo || '--'}`)
            if (bvidKeyword.trim()) items.push(`BVID ${bvidKeyword.trim()}`)
            if (titleKeyword.trim()) items.push(`标题含 ${titleKeyword.trim()}`)
            if (minFans) items.push(`粉丝≥${minFans}`)
            if (favoritedOnly) items.push('只看收藏')
            return items.length ? `已选条件：${items.join(' · ')}` : '未设置筛选条件'
          })()}
        </div>
        <div className='summary-actions'>
          <ExportPanel
            baseUrl={baseUrl}
            label='导出筛选'
            filters={{
              tags: labels.join(','),
              publish_from: publishFrom,
              publish_to: publishTo,
              bvid: bvidKeyword.trim(),
              title: titleKeyword.trim(),
              min_fans: minFans,
            }}
          />
        </div>
      </div>

      {selected.length > 0 && (
        <div className='bulk-bar sticky'>
          <div className='select-all'>
            <input type='checkbox' checked={allSelected} onChange={toggleSelectAll} />
            <span>已选 {selected.length} 条</span>
            <button className='btn ghost small' onClick={() => setSelected([])}>清除选择</button>
          </div>
          <div className='bulk-actions'>
            <div className='bulk-status'>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
              >
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <button
                className='btn ghost'
                onClick={() => {
                  if (bulkStatus === 'dropped' && !window.confirm('确定将选中视频标记为淘汰吗？')) return
                  batchUpdateStatusV2()
                }}
              >
                批量改状态
              </button>
            </div>
            <button className='btn ghost' onClick={() => batchFavorite(true)}>批量收藏</button>
            <button className='btn ghost' onClick={() => batchFavorite(false)}>批量取消收藏</button>
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
      {error ? <Empty label={error} /> : null}
      {!loading && !error && videos.length === 0 && <Empty label='暂无数据' />}
      {!loading && videos.length > 0 && (
        <section className='video-grid'>
          {videos.map((v) => (
            <div key={v.bvid} className='video-card'>
              <div className='card-check'>
                <input type='checkbox' checked={selected.includes(v.bvid)} onChange={() => toggleSelect(v.bvid)} />
              </div>
              <div className='cover'>
                <button
                  className={`favorite-btn ${v.is_favorited ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateFavorite(v)
                  }}
                  title={v.is_favorited ? '取消收藏' : '收藏视频'}
                >
                  {v.is_favorited ? '★' : '☆'}
                </button>
                <button
                  className={`cover-favorite-btn ${v.is_cover_favorited ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateCoverFavorite(v)
                  }}
                  title={v.is_cover_favorited ? '取消封面收藏' : '收藏封面'}
                >
                  📌
                </button>
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
                  <select
                    className='status-select'
                    value={v.process_status}
                    onChange={(e) => updateProcessStatus(v, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {statusOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  {v.labels && v.labels.length > 0 && (
                    <span className='tag-text'>标签：{v.labels.join(' / ')}</span>
                  )}
                </div>
                <div
                  className='video-actions'
                  ref={(el) => {
                    if (!el) return
                    if ((el as any)._subtitleObserverAttached) return
                    ;(el as any)._subtitleObserverAttached = true
                    const card = el.closest('.video-card') as HTMLElement | null
                    if (!card) return
                    const bvid = (card.querySelector('.subtitle-actions') as HTMLElement | null)?.dataset?.bvid
                    if (!bvid) return
                    const observer = new IntersectionObserver((entries) => {
                      const visible = entries.some((entry) => entry.isIntersecting)
                      setSubtitleCardVisible((prev) => ({ ...prev, [bvid]: visible }))
                    }, { threshold: 0.35 })
                    observer.observe(card)
                  }}
                >
                  <div className='subtitle-actions' data-bvid={v.bvid}>
                    <button
                      className='btn ghost'
                      onClick={async () => {
                        const status = subtitleMap[v.bvid]?.status || 'none'
                        if (status === 'extracting') return
                        if (status === 'done') {
                          setSubtitleModal(v.bvid)
                          return
                        }
                        const text = await startExtractSubtitle(v.bvid)
                        const inView = subtitleCardVisible[v.bvid]
                        if (text) {
                          if (inView) {
                            setSubtitleModal(v.bvid)
                          } else {
                            showSubtitleToast(v.bvid, '字幕提取完成')
                          }
                        }
                      }}
                      title='提取字幕'
                    >
                      字幕
                    </button>
                    {subtitleMap[v.bvid]?.status === 'extracting' && (
                      <div className='subtitle-progress'>
                        <div className='progress-meta'>
                          <span>{subtitleProgress[v.bvid]?.stage || '提取中'}</span>
                          <span>{Math.round(subtitleProgress[v.bvid]?.progress || 0)}%</span>
                        </div>
                        <div className='progress-bar'>
                          <span style={{ width: `${subtitleProgress[v.bvid]?.progress || 0}%` }} />
                        </div>
                      </div>
                    )}
                    {subtitleMap[v.bvid]?.status === 'failed' && (
                      <div className='subtitle-error-inline'>
                        <span>提取失败</span>
                        <button className='btn ghost small' onClick={() => startExtractSubtitle(v.bvid)}>重试</button>
                      </div>
                    )}
                  </div>
                  <button className='btn ghost' onClick={() => openTagModal(v)}>编辑标签</button>
                  <button className='btn ghost' onClick={() => openFrameModal(v)}>帧文件夹</button>
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
      {tagModal && (
        <div className='tag-modal-mask' onClick={closeTagModal}>
          <div className='tag-modal' onClick={(e) => e.stopPropagation()}>
            <header className='tag-modal-header'>
              <div>
                <h3>编辑标签</h3>
                <p>{tagModal.title}</p>
              </div>
              <button className='btn ghost' onClick={closeTagModal}>关闭</button>
            </header>
            <div className='tag-modal-body'>
              <TagInput
                value={tagDraft}
                suggestions={tagOptions}
                onChange={setTagDraft}
                placeholder='输入标签，回车添加'
              />
              <p className='tag-modal-tip'>保存后会覆盖当前视频标签。</p>
            </div>
            <footer className='tag-modal-footer'>
              <button className='btn ghost' onClick={closeTagModal}>取消</button>
              <button className='btn primary' onClick={saveVideoTags} disabled={tagSaving}>
                {tagSaving ? '保存中...' : '保存'}
              </button>
            </footer>
          </div>
        </div>
      )}
      {frameModal && (
        <div className='frame-modal-mask' onClick={closeFrameModal}>
          <div className='frame-modal' onClick={(e) => e.stopPropagation()}>
            <header className='frame-modal-header'>
              <div>
                <h3>帧文件夹</h3>
                <p>{frameVideo?.title || ''}</p>
              </div>
              <div className='frame-header-actions'>
                {frameVideo?.process_status === 'to_shoot' && (
                  <button
                    className='btn ghost small'
                    onClick={() => setShowFrameConfig((prev) => !prev)}
                  >
                    {showFrameConfig ? '收起配置' : '重新拆解'}
                  </button>
                )}
                <button className='btn ghost' onClick={closeFrameModal}>关闭</button>
              </div>
            </header>
            <div className='frame-modal-body' ref={frameModalBodyRef}>
              {showFrameConfig && (
                <div className='frame-config'>
                  <div className='config-row'>
                    <label>模式</label>
                    <div className='config-options'>
                      <button className={`btn ghost small ${frameMode === 'scene' ? 'active' : ''}`} onClick={() => setFrameMode('scene')}>关键帧</button>
                      <button className={`btn ghost small ${frameMode === 'interval' ? 'active' : ''}`} onClick={() => setFrameMode('interval')}>定频</button>
                    </div>
                  </div>
                  {frameMode === 'interval' ? (
                    <div className='config-row'>
                      <label>间隔</label>
                      <select value={frameInterval} onChange={(e) => setFrameInterval(Number(e.target.value))}>
                        {[1, 2, 3, 5, 10].map((n) => (
                          <option key={n} value={n}>{n} 秒/帧</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className='config-row'>
                      <label>阈值</label>
                      <input
                        type='range'
                        min={0.25}
                        max={0.45}
                        step={0.01}
                        value={frameThreshold}
                        onChange={(e) => setFrameThreshold(Number(e.target.value))}
                      />
                      <span className='config-value'>{frameThreshold.toFixed(2)}</span>
                    </div>
                  )}
                  <div className='config-row'>
                    <label>上限</label>
                    <input type='number' min={1} max={300} value={frameMax} onChange={(e) => setFrameMax(Number(e.target.value || 120))} />
                  </div>
                  <div className='config-row'>
                    <label>分辨率</label>
                    <select value={frameResolution} onChange={(e) => setFrameResolution(e.target.value as '720p' | '1080p')}>
                      <option value='720p'>720p</option>
                      <option value='1080p'>1080p</option>
                    </select>
                  </div>
                  <button
                    className='btn primary'
                    onClick={() => startFrameJob(frameModal)}
                    disabled={frameSubmitting}
                  >
                    {frameSubmitting ? '创建中...' : '开始拆解'}
                  </button>
                </div>
              )}
              {!frameJob && !showFrameConfig && (
                <div className='frame-empty'>
                  暂无拆解结果
                  {frameVideo?.process_status === 'to_shoot' ? (
                    <button className='btn ghost small' onClick={() => setShowFrameConfig(true)}>开始拆解</button>
                  ) : (
                    <span>（将状态设为待拍摄后可拆解）</span>
                  )}
                </div>
              )}
              {frameJob && !showFrameConfig && frameJob.status !== 'success' && (
                <div className='frame-progress'>
                  <div className='progress-row'>
                    <span>状态：{frameStatusLabel(frameJob.status)}</span>
                    {(frameJob.generated_frames !== undefined || frameJob.frame_count !== undefined) && (
                      <span>已生成 {frameJob.generated_frames ?? frameJob.frame_count} 帧</span>
                    )}
                  </div>
                  <div className='progress-bar'>
                    <div className='progress-fill' style={{ width: `${Math.min((frameJob.progress || 0) * 100, 100)}%` }} />
                  </div>
                  <div className='progress-meta'>
                    <span>{Math.round((frameJob.progress || 0) * 100)}%</span>
                  </div>
                  {(frameJob.status === 'running' || frameJob.status === 'pending') && (
                    <button className='btn ghost' onClick={() => cancelFrameJob(frameJob.id)}>取消任务</button>
                  )}
                  {frameJob.status === 'failed' && (
                    <div className='frame-error'>拆解失败：{frameErrorMessage(frameJob.error_msg)}</div>
                  )}
                  {frameJob.status === 'canceled' && (
                    <div className='frame-error'>任务已取消</div>
                  )}
                </div>
              )}
              {frameJob?.status === 'success' && !showFrameConfig && (
                <div className='frame-section'>
                  <div className='frame-toolbar'>
                    <div className='frame-tabs'>
                      <button
                        className={`btn ghost small ${!frameOnlyFavorited ? 'active' : ''}`}
                        onClick={() => {
                          setFrameOnlyFavorited(false)
                          setFramePage(1)
                        }}
                      >
                        全部帧
                      </button>
                      <button
                        className={`btn ghost small ${frameOnlyFavorited ? 'active' : ''}`}
                        onClick={() => {
                          setFrameOnlyFavorited(true)
                          setFramePage(1)
                        }}
                      >
                        仅收藏
                      </button>
                    </div>
                    <span className='frame-count'>共 {frameTotal} 帧</span>
                  </div>
                  {frameSelected.length > 0 && (
                    <div className='frame-bulk-bar'>
                      <div className='frame-bulk-left'>
                        <input type='checkbox' checked={frameSelected.length === frameItems.length} onChange={toggleFrameSelectAll} />
                        <span>已选 {frameSelected.length} 帧</span>
                        <button className='btn ghost small' onClick={() => setFrameSelected([])}>清除选择</button>
                      </div>
                      <div className='frame-bulk-actions'>
                        <button className='btn ghost small' onClick={() => batchFrameFavorite(true)}>批量收藏</button>
                        <button className='btn ghost small' onClick={() => batchFrameFavorite(false)}>批量取消收藏</button>
                      </div>
                    </div>
                  )}
                  {frameItems.length === 0 ? (
                    <div className='frame-empty'>未抽取到有效帧，可降低阈值或改用定频模式</div>
                  ) : (
                    <div className='frame-grid'>
                      {frameItems.map((item, index) => {
                        const src = item.frame_url.startsWith('http') ? item.frame_url : `${baseUrl}${item.frame_url}`
                        return (
                          <div
                            key={item.id}
                            className='frame-card'
                            role='button'
                            tabIndex={0}
                            onClick={() => openFramePreview(index)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') openFramePreview(index)
                            }}
                          >
                            <img src={src} alt={`frame-${item.idx}`} loading='lazy' />
                            {item.timestamp_ms !== null && (
                              <span className='frame-time'>{formatTimestamp(item.timestamp_ms)}</span>
                            )}
                            <button
                              className={`frame-fav ${item.is_favorited ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFrameFavorite(item)
                              }}
                              type='button'
                            >
                              {item.is_favorited ? '★' : '☆'}
                            </button>
                            <label
                              className='frame-check'
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type='checkbox'
                                checked={frameSelected.includes(item.id)}
                                onChange={() => toggleFrameSelect(item.id)}
                              />
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {frameTotal > framePageSize && (
                    <div className='frame-pagination'>
                      <button
                        className='btn ghost small'
                        disabled={framePage <= 1}
                        onClick={() => setFramePage((prev) => Math.max(prev - 1, 1))}
                      >
                        上一页
                      </button>
                      <span>{framePage} / {Math.ceil(frameTotal / framePageSize)}</span>
                      <button
                        className='btn ghost small'
                        disabled={framePage >= Math.ceil(frameTotal / framePageSize)}
                        onClick={() => setFramePage((prev) => Math.min(prev + 1, Math.ceil(frameTotal / framePageSize)))}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {framePreviewIndex !== null && frameItems[framePreviewIndex] && (
          <div className='frame-lightbox' onClick={closeFramePreview}>
          <div className='frame-lightbox-body' onClick={(e) => e.stopPropagation()}>
            <button className='lightbox-close' onClick={closeFramePreview}>关闭</button>
            <button className='lightbox-nav prev' onClick={goPrevFrame} disabled={framePreviewIndex === 0}>‹</button>
            <img
              src={
                frameItems[framePreviewIndex].frame_url.startsWith('http')
                  ? frameItems[framePreviewIndex].frame_url
                  : `${baseUrl}${frameItems[framePreviewIndex].frame_url}`
              }
              alt='frame-preview'
            />
            <button
              className={`lightbox-fav ${frameItems[framePreviewIndex].is_favorited ? 'active' : ''}`}
              onClick={() => toggleFrameFavorite(frameItems[framePreviewIndex])}
            >
              {frameItems[framePreviewIndex].is_favorited ? '已收藏' : '收藏'}
            </button>
            <button
              className='lightbox-nav next'
              onClick={goNextFrame}
              disabled={framePreviewIndex >= frameItems.length - 1}
            >
              ›
            </button>
            <div className='lightbox-meta'>
              {frameItems[framePreviewIndex].timestamp_ms !== null
                ? formatTimestamp(frameItems[framePreviewIndex].timestamp_ms)
                : '--'}
            </div>
          </div>
        </div>
      )}
      {subtitleToast && (
        <div className='toast subtitle-toast'>
          <span>{subtitleToast.message}</span>
          <button
            className='btn ghost small'
            onClick={() => {
              setSubtitleModal(subtitleToast.bvid)
              setSubtitleToast(null)
            }}
          >
            查看
          </button>
        </div>
      )}
      {toast && <div className='toast'>{toast}</div>}
        </>
      )}
    </div>
  )
}
