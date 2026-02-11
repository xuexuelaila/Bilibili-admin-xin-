import { useMemo, useState } from 'react'

interface ExportFilters {
  tag?: string
  process_status?: string
  sort?: string
  min_views?: string
  min_fav?: string
  min_coin?: string
  min_reply?: string
  min_fav_rate?: string
  min_coin_rate?: string
  min_reply_rate?: string
  min_fav_fan_ratio?: string
}

const FIELD_OPTIONS = [
  { key: 'bvid', label: 'BVID' },
  { key: 'video_url', label: '视频链接' },
  { key: 'title', label: '标题' },
  { key: 'up_name', label: 'UP主' },
  { key: 'followers', label: '粉丝数' },
  { key: 'publish_time', label: '发布时间' },
  { key: 'views', label: '播放' },
  { key: 'fav', label: '收藏' },
  { key: 'coin', label: '投币' },
  { key: 'reply', label: '评论' },
  { key: 'fav_rate', label: '收藏率' },
  { key: 'coin_rate', label: '投币率' },
  { key: 'reply_rate', label: '评论率' },
  { key: 'fav_fan_ratio', label: '收藏/粉丝比' },
  { key: 'basic_hot', label: '爆款' },
  { key: 'low_fan_hot', label: '低粉爆款' },
  { key: 'process_status', label: '处理状态' },
  { key: 'task_ids', label: '任务ID' },
]

export default function ExportPanel({ filters, baseUrl }: { filters: ExportFilters; baseUrl: string }) {
  const [selected, setSelected] = useState<string[]>(FIELD_OPTIONS.map((f) => f.key))

  const toggle = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (selected.length > 0) {
      params.set('fields', selected.join(','))
    }
    return `${baseUrl}/api/videos/export?${params.toString()}`
  }, [filters, baseUrl, selected])

  return (
    <div className='export-panel'>
      <a className='btn ghost' href={exportUrl}>导出 CSV</a>
      <details className='export-fields'>
        <summary>字段配置</summary>
        <div className='field-grid'>
          {FIELD_OPTIONS.map((field) => (
            <label key={field.key}>
              <input
                type='checkbox'
                checked={selected.includes(field.key)}
                onChange={() => toggle(field.key)}
              />
              {field.label}
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}
