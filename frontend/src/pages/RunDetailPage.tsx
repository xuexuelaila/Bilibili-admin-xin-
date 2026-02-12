import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import './RunDetailPage.css'

export default function RunDetailPage() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState<any>(null)

  const load = async () => {
    const res = await api.get(`/api/runs/${runId}`)
    setRun(res.data)
  }

  useEffect(() => {
    load()
  }, [runId])

  const retry = async () => {
    const res = await api.post(`/api/runs/${runId}/retry`)
    window.alert(`已触发重跑，新的运行ID：${res.data.run_id}`)
    navigate(`/runs/${res.data.run_id}`)
  }

  const parsedErrors = useMemo(() => {
    if (!run?.error_detail) return { ok: false, items: [] as any[] }
    try {
      const data = JSON.parse(run.error_detail)
      if (Array.isArray(data)) {
        return { ok: true, items: data }
      }
      return { ok: false, items: [] as any[] }
    } catch {
      return { ok: false, items: [] as any[] }
    }
  }, [run])

  const downloadErrorDetail = () => {
    if (!run?.error_detail) return
    const blob = new Blob([run.error_detail], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `run_${run.id}_errors.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toMetaText = (item: Record<string, any>) => {
    const ignored = new Set(['stage', 'message'])
    const parts = Object.entries(item)
      .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${String(value)}`)
    return parts.join(' ')
  }

  if (!run) return null

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>运行详情</h1>
          <p>开始：{dayjs(run.start_at).format('YYYY-MM-DD HH:mm:ss')}</p>
        </div>
        <button className='btn ghost' onClick={retry}>重跑</button>
      </header>

      <section className='detail-panel'>
        <div className='grid'>
          <span>状态：{run.status}</span>
          <span>耗时：{Math.round((run.duration_ms || 0) / 1000)}s</span>
          <span>抓取：{run.counts?.fetched || 0}</span>
          <span>入库：{run.counts?.inserted || 0}</span>
          <span>爆款：{run.counts?.basic_hot || 0}</span>
          <span>低粉爆款：{run.counts?.low_fan_hot || 0}</span>
          <span>失败项：{run.counts?.failed_items || 0}</span>
        </div>
      </section>

      {run.error_summary && (
        <section className='detail-panel'>
          <h3>错误摘要</h3>
          <p>{run.error_summary}</p>
        </section>
      )}

      {run.error_detail && (
        <section className='detail-panel'>
          <div className='detail-header'>
            <h3>错误明细</h3>
            <button className='btn ghost' onClick={downloadErrorDetail}>下载明细</button>
          </div>
          {parsedErrors.ok ? (
            <div className='error-table'>
              <div className='error-header'>
                <span>阶段</span>
                <span>信息</span>
                <span>上下文</span>
              </div>
              {parsedErrors.items.map((item, idx) => (
                <div key={`${item.stage || 'stage'}-${idx}`} className='error-row'>
                  <span>{item.stage || '-'}</span>
                  <span>{item.message || '-'}</span>
                  <span className='meta'>{toMetaText(item) || '-'}</span>
                </div>
              ))}
            </div>
          ) : (
            <pre>{run.error_detail}</pre>
          )}
        </section>
      )}
    </div>
  )
}
