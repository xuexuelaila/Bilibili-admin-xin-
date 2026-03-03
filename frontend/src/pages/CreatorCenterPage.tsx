import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import TagInput from '../components/TagInput'
import Pagination from '../components/Pagination'
import Empty from '../components/Empty'
import { useUpdates } from '../hooks/useUpdates'
import './VideosPage.css'
import './CreatorCenterPage.css'

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
}

interface Video {
  bvid: string
  title: string
  up_id: string
  up_name: string
  follower_count?: number
  publish_time: string | null
  cover_url: string | null
  video_url?: string | null
  views_delta_1d?: number | null
  process_status?: string
  labels?: string[]
  tags?: { basic_hot: { is_hit: boolean }; low_fan_hot: { is_hit: boolean } }
  stats: { views: number; fav: number; coin: number; reply: number; like: number }
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
  return String(value || 0)
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
  { value: 'all', label: '全部' },
  ...statusOptions,
]

export default function CreatorCenterPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [creatorQ, setCreatorQ] = useState('')
  const [creatorGroup, setCreatorGroup] = useState('')
  const [creatorEnabled, setCreatorEnabled] = useState('')
  const [creatorLoading, setCreatorLoading] = useState(false)

  const [selectedUps, setSelectedUps] = useState<string[]>([])
  const [focusUpId, setFocusUpId] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editGroups, setEditGroups] = useState<string[]>([])

  const [showAdd, setShowAdd] = useState(false)
  const [newInput, setNewInput] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newGroups, setNewGroups] = useState<string[]>([])
  const [newEnabled, setNewEnabled] = useState(true)
  const [creating, setCreating] = useState(false)

  const [days, setDays] = useState<number | null>(7)
  const [publishFrom, setPublishFrom] = useState('')
  const [publishTo, setPublishTo] = useState('')
  const [processStatus, setProcessStatus] = useState('all')
  const [bvidKeyword, setBvidKeyword] = useState('')
  const [titleKeyword, setTitleKeyword] = useState('')
  const [minFans, setMinFans] = useState('')
  const [sortKey, setSortKey] = useState('publish_time')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [refreshTick, setRefreshTick] = useState(0)

  const [selectedVideos, setSelectedVideos] = useState<string[]>([])
  const [bulkStatus, setBulkStatus] = useState('todo')

  const [videoList, setVideoList] = useState<Video[]>([])
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [tagModal, setTagModal] = useState<Video | null>(null)
  const [tagDraft, setTagDraft] = useState<string[]>([])
  const [tagSaving, setTagSaving] = useState(false)

  const [subtitleModal, setSubtitleModal] = useState<string | null>(null)
  const [subtitleSearch, setSubtitleSearch] = useState('')
  const [subtitleMap, setSubtitleMap] = useState<Record<string, SubtitleState>>({})
  const [subtitleTab, setSubtitleTab] = useState<'text' | 'analysis'>('text')

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

  const [toast, setToast] = useState<string | null>(null)

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  const framePageSize = 80

  const proxyImage = (url?: string | null) => {
    if (!url) return null
    return `${baseUrl}/api/proxy?url=${encodeURIComponent(url)}`
  }

  const creatorMap = useMemo(() => {
    return creators.reduce<Record<string, Creator>>((acc, c) => {
      acc[c.up_id] = c
      return acc
    }, {})
  }, [creators])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    creators.forEach((c) => (c.group_tags || []).forEach((g) => set.add(g)))
    return Array.from(set)
  }, [creators])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2000)
  }

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const effectiveUpIds = focusUpId ? [focusUpId] : selectedUps

  const { items: videos, total, loading } = useUpdates<Video>({
    upIds: effectiveUpIds,
    days,
    publishFrom,
    publishTo,
    processStatus,
    bvid: bvidKeyword.trim(),
    title: titleKeyword.trim(),
    minFans,
    sortKey,
    sortOrder,
    page,
    pageSize,
  }, refreshTick)

  useEffect(() => {
    setVideoList(videos)
  }, [videos])

  useEffect(() => {
    api.get('/api/tags').then((res) => setTagOptions(res.data.items || [])).catch(() => {})
  }, [])

  const loadCreators = async () => {
    try {
      setCreatorLoading(true)
      const params = new URLSearchParams()
      if (creatorQ) params.set('q', creatorQ)
      if (creatorGroup) params.set('group', creatorGroup)
      if (creatorEnabled) params.set('enabled', creatorEnabled)
      params.set('page', '1')
      params.set('page_size', '200')
      const res = await api.get(`/api/creators?${params.toString()}`)
      setCreators(res.data.items || [])
    } finally {
      setCreatorLoading(false)
    }
  }

  useEffect(() => {
    loadCreators()
  }, [creatorQ, creatorGroup, creatorEnabled])

  useEffect(() => {
    setPage(1)
  }, [effectiveUpIds, days, publishFrom, publishTo, processStatus, bvidKeyword, titleKeyword, minFans, sortKey, sortOrder])

  useEffect(() => {
    setSelectedVideos([])
  }, [effectiveUpIds, days, publishFrom, publishTo, processStatus, bvidKeyword, titleKeyword, minFans, sortKey, sortOrder, page, pageSize])

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

  useEffect(() => {
    if (framePreviewIndex !== null && framePreviewIndex >= frameItems.length) {
      setFramePreviewIndex(null)
    }
  }, [frameItems, framePreviewIndex])

  useEffect(() => {
    setFrameSelected([])
  }, [frameItems])

  const toggleUpSelect = (up_id: string) => {
    setSelectedUps((prev) => (prev.includes(up_id) ? prev.filter((id) => id !== up_id) : [...prev, up_id]))
    setFocusUpId(null)
  }

  const focusUp = (up_id: string) => {
    setFocusUpId(up_id)
  }

  const clearCreatorFilters = () => {
    setCreatorQ('')
    setCreatorGroup('')
    setCreatorEnabled('')
  }

  const clearFocus = () => setFocusUpId(null)
  const clearSelectedUps = () => setSelectedUps([])

  const canClearStreamFilters =
    days !== 7 ||
    !!publishFrom ||
    !!publishTo ||
    processStatus !== 'all' ||
    !!bvidKeyword ||
    !!titleKeyword ||
    !!minFans ||
    sortKey !== 'publish_time' ||
    sortOrder !== 'desc'

  const clearStreamFilters = () => {
    setDays(7)
    setPublishFrom('')
    setPublishTo('')
    setProcessStatus('all')
    setBvidKeyword('')
    setTitleKeyword('')
    setMinFans('')
    setSortKey('publish_time')
    setSortOrder('desc')
  }

  const toggleMonitor = async (creator: Creator) => {
    await api.put(`/api/creators/${creator.up_id}`, { monitor_enabled: !creator.monitor_enabled })
    loadCreators()
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
    loadCreators()
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
    loadCreators()
  }

  const create = async () => {
    if (!newInput.trim()) {
      window.alert('请输入UP主ID或主页链接')
      return
    }
    try {
      setCreating(true)
      await api.post('/api/creators', {
        up_id_or_url: newInput.trim(),
        up_id: newInput.trim(),
        note: newNote.trim() || undefined,
        group_tags: newGroups,
        monitor_enabled: newEnabled,
      })
      setNewInput('')
      setNewNote('')
      setNewGroups([])
      setNewEnabled(true)
      setShowAdd(false)
      loadCreators()
    } catch (err: any) {
      const message = err?.response?.data?.detail || '添加失败，请检查UP主ID或链接'
      window.alert(message)
    } finally {
      setCreating(false)
    }
  }

  const updateSubtitleState = (bvid: string, patch: Partial<SubtitleState>) => {
    setSubtitleMap((prev) => ({
      ...prev,
      [bvid]: { status: 'none', ...(prev[bvid] || {}), ...patch },
    }))
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

  const SUBTITLE_POLL_INTERVAL = 2000
  const SUBTITLE_POLL_MAX_MS = 10 * 60 * 1000

  const pollSubtitle = async (bvid: string) => {
    const startAt = Date.now()
    while (Date.now() - startAt < SUBTITLE_POLL_MAX_MS) {
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
      await wait(SUBTITLE_POLL_INTERVAL)
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('超时')) {
        updateSubtitleState(bvid, { status: 'extracting', error: '提取耗时较长，可点击“刷新状态”查看进度' })
      } else {
        updateSubtitleState(bvid, { status: 'failed' })
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

  const openSubtitleModal = async (bvid: string) => {
    const next = subtitleModal === bvid ? null : bvid
    setSubtitleModal(next)
    setSubtitleSearch('')
    setSubtitleTab('text')
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
    setSubtitleTab('text')
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

  const splitSentences = (text: string) => {
    return text
      .replace(/\r/g, '')
      .split(/(?<=[。！？.!?])\s*/g)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const extractTokens = (text: string) => {
    const lowered = text.toLowerCase()
    const tokens: string[] = []
    const en = lowered.match(/[a-z0-9]+/g) || []
    const zh = lowered.match(/[\u4e00-\u9fa5]{2,}/g) || []
    tokens.push(...en, ...zh)
    const stop = new Set([
      '这个', '那个', '我们', '你们', '他们', '她们', '不是', '没有', '就是', '然后', '但是', '因为', '所以',
      '如果', '还是', '已经', '这里', '那个', '一个', '这种', '可以', '不会', '需要', '进行', '以及',
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has', 'had', 'you',
    ])
    return tokens.filter((t) => !stop.has(t) && t.length >= 2)
  }

  const getTopTokens = (tokens: string[], limit = 8) => {
    const map = new Map<string, number>()
    tokens.forEach((t) => map.set(t, (map.get(t) || 0) + 1))
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([t]) => t)
  }

  const buildSummary = (sentences: string[], maxLen = 120) => {
    if (sentences.length === 0) return ''
    let result = sentences.slice(0, 2).join(' ')
    if (result.length > maxLen) {
      result = result.slice(0, maxLen) + '…'
    }
    return result
  }

  const formatTimestamp = (ms?: number | null) => {
    if (ms === null || ms === undefined) return ''
    const total = Math.max(0, Math.floor(ms / 1000))
    const mm = String(Math.floor(total / 60)).padStart(2, '0')
    const ss = String(total % 60).padStart(2, '0')
    return `${mm}:${ss}`
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
      setVideoList((prev) =>
        prev.map((v) => (v.bvid === tagModal.bvid ? { ...v, labels: nextTags } : v))
      )
      closeTagModal()
    } finally {
      setTagSaving(false)
    }
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

  const applyQuickDays = (value: number | null) => {
    setDays(value)
    if (value !== null) {
      setPublishFrom('')
      setPublishTo('')
    }
  }

  const updateFrom = (value: string) => {
    setPublishFrom(value)
    setDays(null)
  }

  const updateTo = (value: string) => {
    setPublishTo(value)
    setDays(null)
  }

  const downloadCover = (bvid: string) => {
    const url = `${baseUrl}/api/videos/${bvid}/cover/download`
    window.open(url, '_blank')
  }

  const refresh = () => {
    setRefreshTick((v) => v + 1)
  }

  const toggleSelectVideo = (bvid: string) => {
    setSelectedVideos((prev) => (prev.includes(bvid) ? prev.filter((id) => id !== bvid) : [...prev, bvid]))
  }

  const allSelected = videoList.length > 0 && selectedVideos.length === videoList.length
  const toggleSelectAll = () => {
    setSelectedVideos(allSelected ? [] : videoList.map((v) => v.bvid))
  }

  const batchUpdateStatus = async () => {
    if (selectedVideos.length === 0) return
    if (bulkStatus === 'dropped' && !window.confirm('确定将选中视频标记为淘汰吗？')) return
    await api.post('/api/videos/batch/status', { bvids: selectedVideos, process_status: bulkStatus })
    setSelectedVideos([])
    refresh()
  }

  const batchFavorite = async () => {
    if (selectedVideos.length === 0) return
    await api.post('/api/videos/batch/favorite', { bvids: selectedVideos, is_favorited: true })
    setSelectedVideos([])
    refresh()
  }

  const batchUnfavorite = async () => {
    if (selectedVideos.length === 0) return
    await api.post('/api/videos/batch/favorite', { bvids: selectedVideos, is_favorited: false })
    setSelectedVideos([])
    refresh()
  }

  const updateProcessStatus = async (video: Video, status: string) => {
    await api.post(`/api/videos/${video.bvid}/process_status`, { process_status: status })
    setVideoList((prev) => {
      if (processStatus !== 'all' && processStatus !== status) {
        return prev.filter((v) => v.bvid !== video.bvid)
      }
      return prev.map((v) =>
        v.bvid === video.bvid ? { ...v, process_status: status, status_updated_at: new Date().toISOString() } : v
      )
    })
  }


  return (
    <div className='page creator-center'>
      <header className='creator-header'>
        <div>
          <h1>UP主中心</h1>
          <p>左侧管理关注UP主，右侧查看更新流。</p>
        </div>
        <div className='creator-header-actions'>
          <button className='btn ghost' onClick={refresh} disabled={loading}>刷新</button>
        </div>
      </header>

      <section className='creator-center-body'>
        <aside className='creator-panel'>
          <div className='creator-panel-header'>
            <div className='creator-panel-title'>关注UP主</div>
            <div className='creator-panel-actions'>
              <button className='btn ghost small' onClick={loadCreators}>刷新</button>
              <button className='btn ghost small weak' onClick={clearCreatorFilters}>清空筛选</button>
              <button className='btn small primary' onClick={() => setShowAdd(true)}>+ 添加UP主</button>
            </div>
          </div>

          <div className='creator-panel-filters compact'>
            <input
              className='filter-control'
              placeholder='搜索昵称或UID'
              value={creatorQ}
              onChange={(e) => setCreatorQ(e.target.value)}
            />
            <select className='filter-control' value={creatorGroup} onChange={(e) => setCreatorGroup(e.target.value)}>
              <option value=''>全部分组</option>
              {groupOptions.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select className='filter-control' value={creatorEnabled} onChange={(e) => setCreatorEnabled(e.target.value)}>
              <option value=''>全部状态</option>
              <option value='true'>启用</option>
              <option value='false'>停用</option>
            </select>
          </div>

          <div className='creator-panel-focus'>
            <label>更新筛选</label>
            <select
              className='filter-control'
              value={focusUpId || ''}
              onChange={(e) => setFocusUpId(e.target.value || null)}
            >
              <option value=''>全部UP主（{creators.length}）</option>
              {creators.map((c) => {
                const groupLabel = (c.group_tags || []).length > 0 ? c.group_tags.join('/') : '未分组'
                const enabledLabel = c.monitor_enabled ? '启用' : '停用'
                const title = `${c.up_name || c.up_id} (${c.up_id}) · ${groupLabel} · ${enabledLabel}`
                return (
                  <option key={c.up_id} value={c.up_id}>{title}</option>
                )
              })}
            </select>
            <div className='filter-hint muted'>
              筛选：{creatorQ ? `关键词 ${creatorQ}` : '关键词 全部'} ·
              {creatorGroup ? ` 分组 ${creatorGroup}` : ' 分组 全部'} ·
              {creatorEnabled ? ` 状态 ${creatorEnabled === 'true' ? '启用' : '停用'}` : ' 状态 全部'}
            </div>
          </div>

          {creatorLoading ? <div className='muted'>加载中...</div> : null}
          {!creatorLoading && creators.length === 0 ? <Empty text='暂无关注UP主' /> : null}

          <div className='creator-list'>
            {creators.map((creator) => {
              const isFocused = focusUpId === creator.up_id
              return (
                <div
                  key={creator.up_id}
                  className={`creator-item ${isFocused ? 'active' : ''}`}
                  onClick={() => focusUp(creator.up_id)}
                >
                  <label className='creator-select' onClick={(e) => e.stopPropagation()}>
                    <input
                      type='checkbox'
                      checked={selectedUps.includes(creator.up_id)}
                      onChange={() => toggleUpSelect(creator.up_id)}
                    />
                  </label>
                  {creator.avatar ? (
                    <img src={proxyImage(creator.avatar) || undefined} alt={creator.up_name} />
                  ) : (
                    <div className='avatar-placeholder'>UP</div>
                  )}
                  <div className='creator-item-main'>
                    <div className='creator-item-title'>
                      <span>{creator.up_name}</span>
                    </div>
                    <div className='creator-item-meta'>{creator.up_id}</div>
                    <div className='creator-item-groups'>
                      {(creator.group_tags || []).length > 0 ? creator.group_tags.map((tag) => (
                        <span key={tag} className='tag-pill'>{tag}</span>
                      )) : <span className='muted'>未分组</span>}
                    </div>
                  </div>
                  <div className='creator-item-actions' onClick={(e) => e.stopPropagation()}>
                    <details className='more-menu'>
                      <summary className='btn ghost small'>更多</summary>
                      <div className='more-menu-panel'>
                        <label className='toggle'>
                          <input type='checkbox' checked={creator.monitor_enabled} onChange={() => toggleMonitor(creator)} />
                          <span>{creator.monitor_enabled ? '启用' : '停用'}</span>
                        </label>
                        <button className='btn small' onClick={() => startEdit(creator)}>编辑</button>
                        <button className='btn small ghost' onClick={() => remove(creator)}>删除</button>
                      </div>
                    </details>
                  </div>

                  {editingId === creator.up_id && (
                    <div className='creator-edit' onClick={(e) => e.stopPropagation()}>
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
              )
            })}
          </div>
        </aside>

        <section className='creator-stream'>
          <div className='stream-header'>
            <div className='stream-title'>
              <span>更新流</span>
              {focusUpId && (
                <span className='focus-pill'>
                  聚焦：{creatorMap[focusUpId]?.up_name || focusUpId}
                  <button onClick={clearFocus}>取消聚焦</button>
                </span>
              )}
              {!focusUpId && selectedUps.length > 0 && (
                <span className='focus-pill neutral'>
                  已选 {selectedUps.length} 个
                  <button onClick={clearSelectedUps}>清空</button>
                </span>
              )}
            </div>
            <div className='stream-actions'>
              <button className='btn small ghost' onClick={refresh}>刷新列表</button>
            </div>
          </div>

          <div className='stream-filter-card'>
            <div className='filters-grid row-1'>
              <div className='filter-block span-4'>
                <label>状态</label>
                <div className='segmented'>
                  {statusTabs.map((tab) => (
                    <button
                      key={tab.value}
                      className={processStatus === tab.value ? 'active' : ''}
                      onClick={() => setProcessStatus(tab.value)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className='filter-block span-4'>
                <label>时间</label>
                <div className='segmented'>
                  <button className={days === 1 ? 'active' : ''} onClick={() => applyQuickDays(1)}>24h</button>
                  <button className={days === 3 ? 'active' : ''} onClick={() => applyQuickDays(3)}>3天</button>
                  <button className={days === 7 ? 'active' : ''} onClick={() => applyQuickDays(7)}>7天</button>
                  <button className={days === null ? 'active' : ''} onClick={() => applyQuickDays(null)}>自定义</button>
                </div>
              </div>
              <div className='filter-block span-3'>
                <label>排序</label>
                <select className='filter-control' value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                  <option value='publish_time'>发布时间 新→旧</option>
                  <option value='views'>播放量 高→低</option>
                  <option value='views_delta_1d'>单日新增 高→低</option>
                </select>
              </div>
              <div className='filter-block span-1 filter-actions'>
                <label>&nbsp;</label>
                <button className='btn ghost small weak' onClick={clearStreamFilters} disabled={!canClearStreamFilters}>
                  清空全部
                </button>
              </div>
            </div>

            <div className={`filters-grid row-2 ${days === null ? 'with-range' : ''}`}>
              <div className='filter-block span-bvid'>
                <label>BVID</label>
                <input
                  className='filter-control'
                  value={bvidKeyword}
                  onChange={(e) => setBvidKeyword(e.target.value)}
                  placeholder='输入BV号（支持逗号分隔）'
                />
              </div>
              <div className='filter-block span-title'>
                <label>标题关键词</label>
                <input
                  className='filter-control'
                  value={titleKeyword}
                  onChange={(e) => setTitleKeyword(e.target.value)}
                  placeholder='输入标题关键词'
                />
              </div>
              <div className='filter-block span-fans'>
                <label>粉丝量 ≥</label>
                <input
                  className='filter-control'
                  value={minFans}
                  onChange={(e) => setMinFans(e.target.value.replace(/\D/g, ''))}
                  placeholder='例如 1000'
                />
              </div>
              {days === null && (
                <div className='filter-block span-range'>
                  <label>日期范围</label>
                  <div className='date-range-inline'>
                    <input type='date' value={publishFrom} onChange={(e) => updateFrom(e.target.value)} />
                    <span>至</span>
                    <input type='date' value={publishTo} onChange={(e) => updateTo(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedVideos.length > 0 && (
            <div className='bulk-bar'>
              <div className='bulk-left'>
                <label className='toggle'>
                  <input type='checkbox' checked={allSelected} onChange={toggleSelectAll} />
                  <span>已选 {selectedVideos.length} 条</span>
                </label>
              </div>
              <div className='bulk-actions'>
                <div className='bulk-status'>
                  <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                    {statusOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <button className='btn ghost' onClick={batchUpdateStatus}>批量改状态</button>
                </div>
                <button className='btn ghost' onClick={batchFavorite}>批量收藏视频</button>
                <button className='btn ghost' onClick={batchUnfavorite}>批量取消收藏</button>
              </div>
            </div>
          )}

          {loading ? <div className='muted'>加载中...</div> : null}
          {!loading && videoList.length === 0 ? <Empty text='暂无更新内容，尝试调整筛选或刷新列表' /> : null}

          <div className='creator-grid'>
            {videoList.map((video) => (
              <div key={video.bvid} className='creator-card'>
                <div className='creator-card-select'>
                  <input
                    type='checkbox'
                    checked={selectedVideos.includes(video.bvid)}
                    onChange={() => toggleSelectVideo(video.bvid)}
                  />
                </div>
                <a
                  className='creator-cover'
                  href={`https://www.bilibili.com/video/${video.bvid}`}
                  target='_blank'
                  rel='noreferrer'
                >
                  {video.cover_url ? <img src={proxyImage(video.cover_url) || undefined} alt={video.title} /> : <div className='cover-placeholder'>无封面</div>}
                </a>
                <div className='creator-body'>
                  <a
                    className='creator-title'
                    href={`https://www.bilibili.com/video/${video.bvid}`}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {video.title}
                  </a>
                  <div className='creator-meta'>
                    <span>{video.up_name}</span>
                    <span>{video.publish_time ? dayjs(video.publish_time).format('YYYY-MM-DD HH:mm') : '-'}</span>
                  </div>
                  <div className='creator-meta'>
                    <select
                      className='status-select'
                      value={video.process_status || 'todo'}
                      onChange={(e) => updateProcessStatus(video, e.target.value)}
                    >
                      {statusOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <span>单日 +{formatCount(video.views_delta_1d || 0)}</span>
                  </div>
                  <div className='creator-stats'>
                    <div><span>播放</span><strong>{formatCount(video.stats?.views || 0)}</strong></div>
                    <div><span>获赞</span><strong>{formatCount(video.stats?.like || 0)}</strong></div>
                    <div><span>评论</span><strong>{formatCount(video.stats?.reply || 0)}</strong></div>
                    <div><span>收藏</span><strong>{formatCount(video.stats?.fav || 0)}</strong></div>
                    <div><span>投币</span><strong>{formatCount(video.stats?.coin || 0)}</strong></div>
                  </div>
                  {video.labels && video.labels.length > 0 && (
                    <div className='creator-meta'>
                      <span className='tag-text'>标签：{video.labels.join(' / ')}</span>
                    </div>
                  )}
                  <div className='video-actions'>
                    <button
                      className='btn ghost'
                      onClick={() => openSubtitleModal(video.bvid)}
                      disabled={subtitleMap[video.bvid]?.status === 'extracting'}
                      title='打开字幕弹窗'
                    >
                      字幕
                    </button>
                    <button className='btn ghost' onClick={() => openTagModal(video)}>编辑标签</button>
                    <button className='btn ghost' onClick={() => openFrameModal(video)}>帧文件夹</button>
                    <button className='btn ghost' onClick={() => downloadCover(video.bvid)}>封面海报</button>
                  </div>
                  <div className='creator-actions-row'>
                    <span className='muted'>发布于 {video.publish_time ? dayjs(video.publish_time).format('MM-DD HH:mm') : '-'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </section>
      </section>

      {showAdd && (
        <div className='drawer-backdrop' onClick={() => setShowAdd(false)}>
          <div className='drawer-panel' onClick={(e) => e.stopPropagation()}>
            <div className='drawer-header'>
              <h3>添加UP主</h3>
              <button className='btn ghost' onClick={() => setShowAdd(false)}>关闭</button>
            </div>
            <div className='drawer-body'>
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
              <div className='field'>
                <label>分组标签</label>
                <TagInput value={newGroups} suggestions={groupOptions} onChange={setNewGroups} placeholder='输入分组标签' />
              </div>
              <label className='toggle'>
                <input type='checkbox' checked={newEnabled} onChange={(e) => setNewEnabled(e.target.checked)} />
                <span>启用监控</span>
              </label>
            </div>
            <div className='drawer-footer'>
              <button className='btn ghost' onClick={() => setShowAdd(false)}>取消</button>
              <button className='btn primary' onClick={create} disabled={creating}>
                {creating ? '添加中...' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <div className='subtitle-tabs'>
                      <button
                        className={`btn ghost small ${subtitleTab === 'text' ? 'active' : ''}`}
                        onClick={() => setSubtitleTab('text')}
                      >
                        字幕
                      </button>
                      <button
                        className={`btn ghost small ${subtitleTab === 'analysis' ? 'active' : ''}`}
                        onClick={() => setSubtitleTab('analysis')}
                      >
                        分析
                      </button>
                    </div>
                    {displayStatus === 'extracting' && (
                      <button className='btn ghost small' onClick={() => fetchSubtitle(subtitleModal)}>
                        刷新状态
                      </button>
                    )}
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
                    {subtitleTab === 'text' ? (
                      <>
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
                      </>
                    ) : (
                      <div className='subtitle-analysis'>
                        {text ? (() => {
                          const sentences = splitSentences(text)
                          const summary = buildSummary(sentences)
                          const tokens = extractTokens(text)
                          const keywords = getTopTokens(tokens, 10)
                          return (
                            <>
                              <div className='analysis-card'>
                                <div className='analysis-title'>摘要</div>
                                <div className='analysis-body'>{summary || '暂无摘要'}</div>
                              </div>
                              <div className='analysis-grid'>
                                <div className='analysis-card'>
                                  <div className='analysis-title'>关键词</div>
                                  <div className='analysis-tags'>
                                    {keywords.length > 0 ? keywords.map((k) => (
                                      <span key={k} className='tag-pill'>{k}</span>
                                    )) : <span className='muted'>暂无关键词</span>}
                                  </div>
                                </div>
                                <div className='analysis-card'>
                                  <div className='analysis-title'>统计</div>
                                  <div className='analysis-metrics'>
                                    <div><span>句子数</span><strong>{sentences.length}</strong></div>
                                    <div><span>字数</span><strong>{wordCount}</strong></div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )
                        })() : (
                          <div className='subtitle-empty'>暂无字幕可分析</div>
                        )}
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
              <TagInput value={tagDraft} suggestions={tagOptions} onChange={setTagDraft} placeholder='输入标签' />
              <p className='tag-modal-tip'>使用回车添加，标签可用于筛选。</p>
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
                  <button className='btn ghost' onClick={() => setShowFrameConfig((prev) => !prev)}>
                    {showFrameConfig ? '收起参数' : '拆解参数'}
                  </button>
                )}
                <button className='btn ghost' onClick={closeFrameModal}>关闭</button>
              </div>
            </header>

            <div className='frame-modal-body'>
              {showFrameConfig && (
                <div className='frame-config'>
                  <div className='config-row'>
                    <label>拆解模式</label>
                    <div className='config-options'>
                      <button className={`btn ghost small ${frameMode === 'scene' ? 'active' : ''}`} onClick={() => setFrameMode('scene')}>关键帧</button>
                      <button className={`btn ghost small ${frameMode === 'interval' ? 'active' : ''}`} onClick={() => setFrameMode('interval')}>定频</button>
                    </div>
                    <span />
                  </div>
                  {frameMode === 'interval' ? (
                    <div className='config-row'>
                      <label>定频间隔</label>
                      <select value={frameInterval} onChange={(e) => setFrameInterval(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                          <option key={n} value={n}>{n} 秒/帧</option>
                        ))}
                      </select>
                      <span />
                    </div>
                  ) : (
                    <div className='config-row'>
                      <label>关键帧阈值</label>
                      <input
                        type='range'
                        min={0.1}
                        max={0.8}
                        step={0.05}
                        value={frameThreshold}
                        onChange={(e) => setFrameThreshold(Number(e.target.value))}
                      />
                      <span className='config-value'>{frameThreshold.toFixed(2)}</span>
                    </div>
                  )}
                  <div className='config-row'>
                    <label>最大帧数</label>
                    <input type='number' min={1} max={300} value={frameMax} onChange={(e) => setFrameMax(Number(e.target.value || 120))} />
                    <span />
                  </div>
                  <div className='config-row'>
                    <label>分辨率</label>
                    <select value={frameResolution} onChange={(e) => setFrameResolution(e.target.value as '720p' | '1080p')}>
                      <option value='720p'>720p</option>
                      <option value='1080p'>1080p</option>
                    </select>
                    <span />
                  </div>
                  <button className='btn primary' onClick={() => startFrameJob(frameModal)} disabled={frameSubmitting}>
                    {frameSubmitting ? '创建中...' : '开始拆解'}
                  </button>
                </div>
              )}

              {!frameJob && !showFrameConfig && (
                <div className='frame-empty'>
                  {frameVideo?.process_status === 'to_shoot' ? (
                    <button className='btn primary' onClick={() => setShowFrameConfig(true)}>开始拆解</button>
                  ) : (
                    <span>请先将视频标记为「待拍摄」后再拆解</span>
                  )}
                </div>
              )}

              {frameJob && (
                <div className='frame-progress'>
                  <div className='progress-header'>
                    <span>状态：{frameStatusLabel(frameJob.status)}</span>
                    {(frameJob.generated_frames !== undefined || frameJob.frame_count !== undefined) && (
                      <span>已生成 {frameJob.generated_frames ?? frameJob.frame_count} 帧</span>
                    )}
                  </div>
                  <div className='progress-bar'>
                    <div className='progress-fill' style={{ width: `${Math.min((frameJob.progress || 0) * 100, 100)}%` }} />
                  </div>
                  <span>{Math.round((frameJob.progress || 0) * 100)}%</span>
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

              {frameJob?.status === 'success' && (
                <div className='frame-section'>
                  <div className='frame-toolbar'>
                    <div className='frame-tabs'>
                      <button
                        className={`btn ghost small ${!frameOnlyFavorited ? 'active' : ''}`}
                        onClick={() => {
                          setFrameOnlyFavorited(false)
                          if (frameJob?.id) fetchFrames(frameJob.id, 1, false)
                        }}
                      >
                        全部帧
                      </button>
                      <button
                        className={`btn ghost small ${frameOnlyFavorited ? 'active' : ''}`}
                        onClick={() => {
                          setFrameOnlyFavorited(true)
                          if (frameJob?.id) fetchFrames(frameJob.id, 1, true)
                        }}
                      >
                        已收藏
                      </button>
                    </div>
                    <span className='frame-count'>共 {frameTotal} 帧</span>
                  </div>

                  {frameSelected.length > 0 && (
                    <div className='frame-bulk-bar'>
                      <div className='frame-bulk-left'>
                        <input type='checkbox' checked={frameSelected.length === frameItems.length} onChange={toggleFrameSelectAll} />
                        <span>已选 {frameSelected.length} 帧</span>
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
                          <div key={item.id} className='frame-card'>
                            <button className='frame-preview' onClick={() => openFramePreview(index)}>
                              <img src={src} alt={`frame-${item.idx}`} loading='lazy' />
                            </button>
                            <div className='frame-meta'>
                              <span className='frame-time'>{formatTimestamp(item.timestamp_ms)}</span>
                              <button
                                className={`frame-fav ${item.is_favorited ? 'active' : ''}`}
                                onClick={() => toggleFrameFavorite(item)}
                              >
                                {item.is_favorited ? '已收藏' : '收藏'}
                              </button>
                            </div>
                            <label className='frame-check'>
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
            <button className='lightbox-nav prev' onClick={goPrevFrame} disabled={framePreviewIndex === 0}>‹</button>
            <img
              src={frameItems[framePreviewIndex].frame_url.startsWith('http')
                ? frameItems[framePreviewIndex].frame_url
                : `${baseUrl}${frameItems[framePreviewIndex].frame_url}`}
              alt='frame-preview'
            />
            <button
              className={`lightbox-fav ${frameItems[framePreviewIndex].is_favorited ? 'active' : ''}`}
              onClick={() => toggleFrameFavorite(frameItems[framePreviewIndex])}
            >
              {frameItems[framePreviewIndex].is_favorited ? '已收藏' : '收藏'}
            </button>
            <button className='lightbox-nav next' onClick={goNextFrame} disabled={framePreviewIndex >= frameItems.length - 1}>›</button>
            <div className='lightbox-meta'>
              {frameItems[framePreviewIndex].timestamp_ms !== null
                ? formatTimestamp(frameItems[framePreviewIndex].timestamp_ms)
                : '-'}
            </div>
          </div>
        </div>
      )}

      {toast && <div className='toast'>{toast}</div>}
    </div>
  )
}
