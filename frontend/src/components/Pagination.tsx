export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className='pagination'>
      <div className='pagination-info'>
        <span>共 {total} 条</span>
        <span>第 {page} / {totalPages} 页</span>
      </div>
      <div className='pagination-actions'>
        {onPageSizeChange && (
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            <option value={10}>10 / 页</option>
            <option value={20}>20 / 页</option>
            <option value={50}>50 / 页</option>
          </select>
        )}
        <button className='btn ghost' onClick={() => onPageChange(1)} disabled={!canPrev}>首页</button>
        <button className='btn ghost' onClick={() => onPageChange(page - 1)} disabled={!canPrev}>上一页</button>
        <button className='btn ghost' onClick={() => onPageChange(page + 1)} disabled={!canNext}>下一页</button>
        <button className='btn ghost' onClick={() => onPageChange(totalPages)} disabled={!canNext}>末页</button>
      </div>
    </div>
  )
}
