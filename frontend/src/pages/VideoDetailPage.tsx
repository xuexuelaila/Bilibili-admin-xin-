import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import './VideoDetailPage.css'

export default function VideoDetailPage() {
  const { bvid } = useParams()
  const [video, setVideo] = useState<any>(null)
  const [note, setNote] = useState('')
  const [subtitle, setSubtitle] = useState<any>(null)

  const load = async () => {
    const res = await api.get(`/api/videos/${bvid}`)
    setVideo(res.data)
    setNote(res.data.note || '')
    try {
      const sub = await api.get(`/api/videos/${bvid}/subtitle`)
      setSubtitle(sub.data)
    } catch {
      setSubtitle(null)
    }
  }

  useEffect(() => {
    load()
  }, [bvid])

  if (!video) return null

  const extractSubtitle = async () => {
    await api.post(`/api/videos/${bvid}/subtitle/extract`)
    await load()
  }

  const saveNote = async () => {
    await api.post(`/api/videos/${bvid}/note`, { note })
    await load()
  }

  const markDone = async () => {
    const next = video.process_status === 'done' ? 'todo' : 'done'
    await api.post(`/api/videos/${bvid}/process_status`, { process_status: next })
    await load()
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>{video.title}</h1>
          <p>{video.up_name} · 粉丝 {video.follower_count}</p>
        </div>
        <div className='actions'>
          <button className='btn ghost' onClick={extractSubtitle}>提取字幕</button>
          <button className='btn ghost' onClick={markDone}>{video.process_status === 'done' ? '标记未处理' : '标记已处理'}</button>
        </div>
      </header>

      <div className='detail-grid'>
        <div className='panel'>
          {video.cover_url ? <img src={video.cover_url} alt={video.title} /> : <div className='cover-placeholder'>No Cover</div>}
        </div>
        <div className='panel'>
          <h3>指标</h3>
          <div className='stats'>
            <span>播放 {video.stats.views}</span>
            <span>收藏 {video.stats.fav}</span>
            <span>投币 {video.stats.coin}</span>
            <span>评论 {video.stats.reply}</span>
            <span>收藏率 {(video.stats.fav_rate * 100).toFixed(2)}%</span>
            <span>投币率 {(video.stats.coin_rate * 100).toFixed(2)}%</span>
            <span>评论率 {(video.stats.reply_rate * 100).toFixed(2)}%</span>
            <span>收藏/粉丝比 {video.stats.fav_fan_ratio.toFixed(3)}</span>
          </div>
          <p>发布时间：{video.publish_time ? dayjs(video.publish_time).format('YYYY-MM-DD') : '-'}</p>
          <p>抓取时间：{dayjs(video.fetch_time).format('YYYY-MM-DD HH:mm')}</p>
          <div className='tags'>
            {video.tags.basic_hot.is_hit && <span className='pill hot'>爆款</span>}
            {video.tags.low_fan_hot.is_hit && <span className='pill low'>低粉爆款</span>}
          </div>
        </div>
        <div className='panel'>
          <h3>字幕</h3>
          <p>状态：{subtitle?.status || 'none'}</p>
          <textarea value={subtitle?.text || ''} readOnly />
        </div>
        <div className='panel'>
          <h3>备注</h3>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          <button className='btn ghost' onClick={saveNote}>保存备注</button>
        </div>
      </div>
    </div>
  )
}
