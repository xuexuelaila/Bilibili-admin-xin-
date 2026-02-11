import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api } from '../api/client'
import './RunsPage.css'

interface Run {
  id: string
  status: string
  start_at: string
  duration_ms: number
  counts: any
  error_summary?: string
  error_detail?: string | null
}

export default function RunsPage() {
  const { id } = useParams()
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    if (id) {
      api.get(`/api/tasks/${id}/runs`).then((res) => setRuns(res.data.items))
    }
  }, [id])

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>运行记录</h1>
          <p>任务：{id}</p>
        </div>
      </header>
      <div className='runs-table'>
        <div className='runs-header'>
          <span>开始时间</span>
          <span>耗时</span>
          <span>抓取/入库</span>
          <span>爆款/低粉</span>
          <span>状态</span>
        </div>
        {runs.map((run) => (
          <div key={run.id} className='runs-block'>
            <div className='runs-row'>
              <span>{dayjs(run.start_at).format('MM-DD HH:mm')}</span>
              <span>{Math.round((run.duration_ms || 0) / 1000)}s</span>
              <span>{run.counts?.fetched || 0}/{run.counts?.inserted || 0}</span>
              <span>{run.counts?.basic_hot || 0}/{run.counts?.low_fan_hot || 0}</span>
              <span className={`status ${run.status}`}>{run.status}</span>
            </div>
            {(run.error_summary || run.error_detail) && (
              <details className='run-error'>
                <summary>错误详情</summary>
                {run.error_summary && <p className='error-summary'>{run.error_summary}</p>}
                {run.error_detail && (
                  <pre>{run.error_detail}</pre>
                )}
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
