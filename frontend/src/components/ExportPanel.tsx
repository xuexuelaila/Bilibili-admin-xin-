import { useMemo, useState } from 'react'

interface ExportFilters {
  bvids?: string
  tag?: string
  process_status?: string
  sort?: string
  task_id?: string
  publish_from?: string
  publish_to?: string
  fetch_from?: string
  fetch_to?: string
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
  { key: 'task_names', label: '任务名称' },
  { key: 'export_status', label: '导出状态' },
  { key: 'export_reason', label: '失败原因' },
]

export default function ExportPanel({
  filters,
  baseUrl,
  label = '导出 CSV',
}: {
  filters: ExportFilters
  baseUrl: string
  label?: string
}) {
  const [selected, setSelected] = useState<string[]>(FIELD_OPTIONS.map((f) => f.key))
  const [includeMissing, setIncludeMissing] = useState(false)

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
    if (includeMissing) {
      params.set('include_missing', '1')
    }
    return `${baseUrl}/api/videos/export?${params.toString()}`
  }, [filters, baseUrl, selected, includeMissing])

  return (
    <div className='export-panel'>
      <a className='btn ghost' href={exportUrl}>{label}</a>
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
        <label className='include-missing'>
          <input type='checkbox' checked={includeMissing} onChange={(e) => setIncludeMissing(e.target.checked)} />
          包含导出失败列表
        </label>
      </details>
    </div>
  )
}
