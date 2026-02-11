import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import ExportPanel from '../components/ExportPanel'
import '../components/ExportPanel.css'
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

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [tag, setTag] = useState('')
  const [processStatus, setProcessStatus] = useState('')
  const [sort, setSort] = useState('')
  const [minViews, setMinViews] = useState('')
  const [minFav, setMinFav] = useState('')
  const [minCoin, setMinCoin] = useState('')
  const [minReply, setMinReply] = useState('')
  const [minFavRate, setMinFavRate] = useState('')
  const [minCoinRate, setMinCoinRate] = useState('')
  const [minReplyRate, setMinReplyRate] = useState('')
  const [minFavFanRatio, setMinFavFanRatio] = useState('')

  const load = async () => {
    const params = new URLSearchParams()
    if (tag) params.set('tag', tag)
    if (processStatus) params.set('process_status', processStatus)
    if (sort) params.set('sort', sort)
    if (minViews) params.set('min_views', minViews)
    if (minFav) params.set('min_fav', minFav)
    if (minCoin) params.set('min_coin', minCoin)
    if (minReply) params.set('min_reply', minReply)
    if (minFavRate) params.set('min_fav_rate', minFavRate)
    if (minCoinRate) params.set('min_coin_rate', minCoinRate)
    if (minReplyRate) params.set('min_reply_rate', minReplyRate)
    if (minFavFanRatio) params.set('min_fav_fan_ratio', minFavFanRatio)
    const res = await api.get(`/api/videos?${params.toString()}`)
    setVideos(res.data.items)
  }

  useEffect(() => {
    load()
  }, [tag, processStatus, sort, minViews, minFav, minCoin, minReply, minFavRate, minCoinRate, minReplyRate, minFavFanRatio])

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>视频库</h1>
          <p>按爆款标签、指标区间快速筛选。</p>
        </div>
        <ExportPanel
          baseUrl={import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}
          filters={{
            tag,
            process_status: processStatus,
            sort,
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
        <input placeholder='播放≥' value={minViews} onChange={(e) => setMinViews(e.target.value)} />
        <input placeholder='收藏≥' value={minFav} onChange={(e) => setMinFav(e.target.value)} />
        <input placeholder='投币≥' value={minCoin} onChange={(e) => setMinCoin(e.target.value)} />
        <input placeholder='评论≥' value={minReply} onChange={(e) => setMinReply(e.target.value)} />
        <input placeholder='收藏率≥' value={minFavRate} onChange={(e) => setMinFavRate(e.target.value)} />
        <input placeholder='投币率≥' value={minCoinRate} onChange={(e) => setMinCoinRate(e.target.value)} />
        <input placeholder='评论率≥' value={minReplyRate} onChange={(e) => setMinReplyRate(e.target.value)} />
        <input placeholder='收藏/粉丝比≥' value={minFavFanRatio} onChange={(e) => setMinFavFanRatio(e.target.value)} />
      </div>

      <section className='video-grid'>
        {videos.map((v) => (
          <div key={v.bvid} className='video-card'>
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
    </div>
  )
}
