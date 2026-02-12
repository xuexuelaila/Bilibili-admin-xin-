import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import ExportPanel from '../components/ExportPanel'
import '../components/ExportPanel.css'
import Pagination from '../components/Pagination'
import '../components/Pagination.css'
import Empty from '../components/Empty'
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
  process_status: string
}

interface TaskOption {
  id: string
  name: string
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [taskId, setTaskId] = useState('')
  const [tag, setTag] = useState('')
  const [processStatus, setProcessStatus] = useState('')
  const [sort, setSort] = useState('')
  const [publishFrom, setPublishFrom] = useState('')
  const [publishTo, setPublishTo] = useState('')
  const [fetchFrom, setFetchFrom] = useState('')
  const [fetchTo, setFetchTo] = useState('')
  const [minViews, setMinViews] = useState('')
  const [minFav, setMinFav] = useState('')
  const [minCoin, setMinCoin] = useState('')
  const [minReply, setMinReply] = useState('')
  const [minFavRate, setMinFavRate] = useState('')
  const [minCoinRate, setMinCoinRate] = useState('')
  const [minReplyRate, setMinReplyRate] = useState('')
  const [minFavFanRatio, setMinFavFanRatio] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const loadTasks = async () => {
    const res = await api.get('/api/tasks?page=1&page_size=200')
    setTasks(res.data.items || [])
  }

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (taskId) params.set('task_id', taskId)
    if (tag) params.set('tag', tag)
    if (processStatus) params.set('process_status', processStatus)
    if (sort) params.set('sort', sort)
    if (publishFrom) params.set('publish_from', publishFrom)
    if (publishTo) params.set('publish_to', publishTo)
    if (fetchFrom) params.set('fetch_from', fetchFrom)
    if (fetchTo) params.set('fetch_to', fetchTo)
    if (minViews) params.set('min_views', minViews)
    if (minFav) params.set('min_fav', minFav)
    if (minCoin) params.set('min_coin', minCoin)
    if (minReply) params.set('min_reply', minReply)
    if (minFavRate) params.set('min_fav_rate', minFavRate)
    if (minCoinRate) params.set('min_coin_rate', minCoinRate)
    if (minReplyRate) params.set('min_reply_rate', minReplyRate)
    if (minFavFanRatio) params.set('min_fav_fan_ratio', minFavFanRatio)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    const res = await api.get(`/api/videos?${params.toString()}`)
    setVideos(res.data.items)
    setTotal(res.data.total || 0)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [taskId, tag, processStatus, sort, publishFrom, publishTo, fetchFrom, fetchTo, minViews, minFav, minCoin, minReply, minFavRate, minCoinRate, minReplyRate, minFavFanRatio, page, pageSize])

  useEffect(() => {
    loadTasks()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [taskId, tag, processStatus, sort, publishFrom, publishTo, fetchFrom, fetchTo, minViews, minFav, minCoin, minReply, minFavRate, minCoinRate, minReplyRate, minFavFanRatio])

  useEffect(() => {
    setSelected([])
  }, [taskId, tag, processStatus, sort, publishFrom, publishTo, fetchFrom, fetchTo, minViews, minFav, minCoin, minReply, minFavRate, minCoinRate, minReplyRate, minFavFanRatio, page, pageSize])

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

  const applyQuick = (nextTag: string, nextStatus: string) => {
    setTag(nextTag)
    setProcessStatus(nextStatus)
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>视频库</h1>
          <p>按爆款标签、指标区间快速筛选。</p>
        </div>
        <ExportPanel
          baseUrl={baseUrl}
          label='导出筛选'
          filters={{
            task_id: taskId,
            tag,
            process_status: processStatus,
            sort,
            publish_from: publishFrom,
            publish_to: publishTo,
            fetch_from: fetchFrom,
            fetch_to: fetchTo,
            min_views: minViews,
            min_fav: minFav,
            min_coin: minCoin,
            min_reply: minReply,
            min_fav_rate: minFavRate,
            min_coin_rate: minCoinRate,
            min_reply_rate: minReplyRate,
            min_fav_fan_ratio: minFavFanRatio,
          }}
        />
      </header>

      <div className='filters'>
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value=''>全部任务</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>{task.name}</option>
          ))}
        </select>
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value=''>全部标签</option>
          <option value='basic_hot'>爆款</option>
          <option value='low_fan_hot'>低粉爆款</option>
        </select>
        <select value={processStatus} onChange={(e) => setProcessStatus(e.target.value)}>
          <option value=''>全部状态</option>
          <option value='todo'>待处理</option>
          <option value='done'>已处理</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value=''>默认排序</option>
          <option value='views'>播放</option>
          <option value='fav'>收藏</option>
          <option value='coin'>投币</option>
          <option value='reply'>评论</option>
          <option value='fav_rate'>收藏率</option>
          <option value='coin_rate'>投币率</option>
          <option value='reply_rate'>评论率</option>
          <option value='fav_fan_ratio'>收藏/粉丝比</option>
          <option value='publish_time'>发布时间</option>
          <option value='fetch_time'>抓取时间</option>
        </select>
        <input
          type='date'
          value={publishFrom}
          onChange={(e) => setPublishFrom(e.target.value)}
          aria-label='发布时间起始'
          title='发布时间起始'
        />
        <input
          type='date'
          value={publishTo}
          onChange={(e) => setPublishTo(e.target.value)}
          aria-label='发布时间结束'
          title='发布时间结束'
        />
        <input
          type='date'
          value={fetchFrom}
          onChange={(e) => setFetchFrom(e.target.value)}
          aria-label='抓取时间起始'
          title='抓取时间起始'
        />
        <input
          type='date'
          value={fetchTo}
          onChange={(e) => setFetchTo(e.target.value)}
          aria-label='抓取时间结束'
          title='抓取时间结束'
        />
        <input placeholder='播放≥' value={minViews} onChange={(e) => setMinViews(e.target.value)} />
        <input placeholder='收藏≥' value={minFav} onChange={(e) => setMinFav(e.target.value)} />
        <input placeholder='投币≥' value={minCoin} onChange={(e) => setMinCoin(e.target.value)} />
        <input placeholder='评论≥' value={minReply} onChange={(e) => setMinReply(e.target.value)} />
        <input placeholder='收藏率≥' value={minFavRate} onChange={(e) => setMinFavRate(e.target.value)} />
        <input placeholder='投币率≥' value={minCoinRate} onChange={(e) => setMinCoinRate(e.target.value)} />
        <input placeholder='评论率≥' value={minReplyRate} onChange={(e) => setMinReplyRate(e.target.value)} />
        <input placeholder='收藏/粉丝比≥' value={minFavFanRatio} onChange={(e) => setMinFavFanRatio(e.target.value)} />
      </div>

      <div className='quick-filters'>
        <button className='btn ghost small' onClick={() => applyQuick('', '')}>全部</button>
        <button className='btn ghost small' onClick={() => applyQuick('basic_hot', processStatus)}>爆款</button>
        <button className='btn ghost small' onClick={() => applyQuick('low_fan_hot', processStatus)}>低粉爆款</button>
        <button className='btn ghost small' onClick={() => applyQuick(tag, 'todo')}>待处理</button>
        <button className='btn ghost small' onClick={() => applyQuick(tag, 'done')}>已处理</button>
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
                {v.cover_url ? <img src={v.cover_url} alt={v.title} /> : <div className='cover-placeholder'>No Cover</div>}
              </div>
              <div className='video-body'>
                <h3>{v.title}</h3>
                <p>{v.up_name} · 粉丝 {v.follower_count}</p>
                <div className='stats'>
                  <span>播放 {v.stats.views}</span>
                  <span>收藏 {v.stats.fav}</span>
                  <span>投币 {v.stats.coin}</span>
                  <span>评论 {v.stats.reply}</span>
                  <span>收藏率 {(v.stats.fav_rate * 100).toFixed(2)}%</span>
                  <span>投币率 {(v.stats.coin_rate * 100).toFixed(2)}%</span>
                  <span>评论率 {(v.stats.reply_rate * 100).toFixed(2)}%</span>
                  <span>收藏/粉丝比 {v.stats.fav_fan_ratio.toFixed(3)}</span>
                </div>
                <div className='tags'>
                  {v.tags.basic_hot.is_hit && <span className='pill hot'>爆款</span>}
                  {v.tags.low_fan_hot.is_hit && <span className='pill low'>低粉爆款</span>}
                  <span className='pill status'>{v.process_status === 'done' ? '已处理' : '待处理'}</span>
                </div>
                <div className='video-meta'>
                  <span>发布时间 {v.publish_time ? dayjs(v.publish_time).format('MM-DD') : '-'}</span>
                  <span>抓取时间 {dayjs(v.fetch_time).format('MM-DD HH:mm')}</span>
                </div>
                <Link className='btn ghost' to={`/videos/${v.bvid}`}>查看详情</Link>
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
