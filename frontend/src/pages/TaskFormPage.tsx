import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import TagInput from '../components/TagInput'
import './TaskFormPage.css'

export default function TaskFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [form, setForm] = useState({
    name: '',
    keywords: '',
    exclude_words: '',
    tags: [] as string[],
    days_limit: 30,
    fetch_limit: 200,
    search_sort: 'relevance',
    schedule_time: '09:00',
  })
  const [tagOptions, setTagOptions] = useState<string[]>([])

  useEffect(() => {
    api.get('/api/tags').then((res) => setTagOptions(res.data.items || [])).catch(() => {})
    if (mode === 'edit' && id) {
      api.get(`/api/tasks/${id}`).then((res) => {
        const task = res.data
        setForm((prev) => ({
          ...prev,
          name: task.name,
          keywords: (task.keywords || []).join('\n'),
          exclude_words: (task.exclude_words || []).join('\n'),
          tags: task.tags || [],
          days_limit: task.scope?.days_limit ?? 30,
          fetch_limit: task.scope?.fetch_limit ?? 200,
          search_sort: task.scope?.search_sort ?? 'relevance',
          schedule_time: task.schedule?.time ?? '09:00',
        }))
      })
    }
  }, [mode, id])

  const update = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    const payload = {
      name: form.name,
      keywords: form.keywords.split(/\n|,|，/).map((k) => k.trim()).filter(Boolean),
      exclude_words: form.exclude_words.split(/\n|,|，/).map((k) => k.trim()).filter(Boolean),
      scope: {
        days_limit: Number(form.days_limit),
        fetch_limit: Number(form.fetch_limit),
        search_sort: form.search_sort,
      },
      tags: form.tags,
      schedule: {
        type: 'daily',
        time: form.schedule_time,
      },
    }

    if (mode === 'create') {
      await api.post('/api/tasks', payload)
    } else if (id) {
      await api.put(`/api/tasks/${id}`, payload)
    }
    navigate('/tasks')
  }

  return (
    <div className='page'>
      <header className='page-header'>
        <div>
          <h1>{mode === 'create' ? '新建任务' : '编辑任务'}</h1>
          <p>设置关键词、抓取范围与爆款规则。</p>
        </div>
        <button className='btn primary' onClick={submit}>保存</button>
      </header>

      <section className='form-section'>
        <h3>基础信息</h3>
        <label>
          任务名
          <input value={form.name} onChange={(e) => update('name', e.target.value)} />
        </label>
        <label>
          商品关键词（换行或逗号分隔）
          <textarea value={form.keywords} onChange={(e) => update('keywords', e.target.value)} />
        </label>
        <label>
          排除词（可选）
          <textarea value={form.exclude_words} onChange={(e) => update('exclude_words', e.target.value)} />
        </label>
        <label>
          视频标签（抓取后自动打标，换行或逗号分隔）
          <TagInput
            value={form.tags}
            suggestions={tagOptions}
            onChange={(tags) => update('tags', tags)}
            placeholder='输入标签，回车添加'
          />
        </label>
      </section>

      <section className='form-section'>
        <h3>抓取范围</h3>
        <div className='grid'>
          <label>
            近几天
            <input type='number' value={form.days_limit} onChange={(e) => update('days_limit', e.target.value)} />
          </label>
          <label>
            每次抓取上限
            <input type='number' value={form.fetch_limit} onChange={(e) => update('fetch_limit', e.target.value)} />
          </label>
          <label>
            搜索排序
            <select value={form.search_sort} onChange={(e) => update('search_sort', e.target.value)}>
              <option value='relevance'>综合</option>
              <option value='new'>最新</option>
              <option value='views'>最多播放</option>
            </select>
          </label>
          <label>
            每日运行时间
            <input type='time' value={form.schedule_time} onChange={(e) => update('schedule_time', e.target.value)} />
          </label>
        </div>
      </section>
    </div>
  )
}
