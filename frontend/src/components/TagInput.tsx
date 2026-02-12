import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import './TagInput.css'

export default function TagInput({
  value,
  suggestions,
  onChange,
  placeholder = '输入标签，回车添加',
}: {
  value: string[]
  suggestions: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const normalized = useMemo(() => (value || []).map((t) => t.trim()).filter(Boolean), [value])
  const normalizedLower = useMemo(() => new Set(normalized.map((t) => t.toLowerCase())), [normalized])

  const addTag = (tag: string) => {
    const cleaned = tag.trim()
    if (!cleaned) return
    if (normalizedLower.has(cleaned.toLowerCase())) return
    onChange([...normalized, cleaned])
  }

  const addTagsFromText = (raw: string) => {
    const parts = raw.split(/\n|,|，/).map((t) => t.trim()).filter(Boolean)
    if (parts.length === 0) return
    let next = [...normalized]
    const nextLower = new Set(next.map((t) => t.toLowerCase()))
    parts.forEach((tag) => {
      const lower = tag.toLowerCase()
      if (!nextLower.has(lower)) {
        nextLower.add(lower)
        next.push(tag)
      }
    })
    onChange(next)
    setText('')
  }

  const removeTag = (tag: string) => {
    const lower = tag.toLowerCase()
    onChange(normalized.filter((t) => t.toLowerCase() !== lower))
  }

  const filtered = useMemo(() => {
    const keyword = text.trim().toLowerCase()
    return (suggestions || [])
      .filter((item) => item && !normalizedLower.has(item.toLowerCase()))
      .filter((item) => (keyword ? item.toLowerCase().includes(keyword) : true))
  }, [text, suggestions, normalizedLower])

  const canCreate = useMemo(() => {
    const cleaned = text.trim()
    if (!cleaned) return false
    const lower = cleaned.toLowerCase()
    if (normalizedLower.has(lower)) return false
    return !(suggestions || []).some((item) => item.toLowerCase() === lower)
  }, [text, suggestions, normalizedLower])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTagsFromText(text)
      setOpen(true)
    } else if (event.key === 'Backspace' && text.length === 0 && normalized.length > 0) {
      removeTag(normalized[normalized.length - 1])
    }
  }

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className='tag-select' ref={wrapperRef}>
      <div
        className='tag-field'
        onClick={() => {
          inputRef.current?.focus()
          setOpen(true)
        }}
      >
        {normalized.map((tag) => (
          <span key={tag} className='tag-chip'>
            {tag}
            <button type='button' className='tag-remove' onClick={() => removeTag(tag)}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      </div>
      {open && (filtered.length > 0 || canCreate) && (
        <div className='tag-dropdown'>
          {canCreate && (
            <button
              type='button'
              className='tag-option create'
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(text)
                setText('')
                setOpen(true)
              }}
            >
              创建标签：{text.trim()}
            </button>
          )}
          {filtered.map((item) => (
            <button
              key={item}
              type='button'
              className='tag-option'
              onMouseDown={(e) => {
                e.preventDefault()
                addTag(item)
                setText('')
                setOpen(true)
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
