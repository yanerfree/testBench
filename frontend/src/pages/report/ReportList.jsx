import { useState, useEffect, useCallback } from 'react'
import { Button, Space, Spin, Empty, Input, Pagination, Modal, message } from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

function fmt(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}

function rateColor(v) {
  if (v >= 95) return '#00b96b'
  if (v >= 80) return '#faad14'
  return '#ff4d4f'
}

const th = { fontSize: 12, color: '#86909c', fontWeight: 500, whiteSpace: 'nowrap' }

export default function ReportList() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const fetchReports = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/reports?page=${page}&pageSize=${pageSize}`)
      setReports(res.data || [])
      setTotal(res.pagination?.total || 0)
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, page, pageSize])

  useEffect(() => { fetchReports() }, [fetchReports])

  const handleExport = async (e, reportId) => {
    e.stopPropagation()
    try {
      const blob = await api.download(`/projects/${projectId}/reports/${reportId}/export/excel`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${reportId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      message.error('导出失败')
    }
  }

  const handleDelete = (e, reportId, planName) => {
    e.stopPropagation()
    Modal.confirm({
      title: '确认删除',
      content: `确定删除「${planName}」的执行报告？删除后不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.del(`/projects/${projectId}/reports/${reportId}`)
          message.success('删除成功')
          fetchReports()
        } catch (err) {
          message.error(err?.response?.data?.error?.message || err?.message || '删除失败')
        }
      },
    })
  }

  const filtered = keyword
    ? reports.filter(r => r.planName.toLowerCase().includes(keyword.toLowerCase()))
    : reports

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#1d2129' }}>测试报告</h2>
        <Space size={8}>
          <Input
            prefix={<SearchOutlined style={{ color: '#c9cdd4' }} />}
            placeholder="搜索报告名称"
            value={keyword} onChange={e => setKeyword(e.target.value)}
            allowClear style={{ width: 200 }} size="small"
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchReports} loading={loading}>刷新</Button>
        </Space>
      </div>

      {loading ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div> :
        filtered.length === 0 ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无报告" /></div> : <>
        {/* Table */}
        <div style={{ background: '#fff', border: '1px solid #e5e6eb', borderRadius: 8, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: 36, background: '#f7f8fa', borderBottom: '1px solid #e5e6eb', flexShrink: 0 }}>
            <div style={{ flex: 3, ...th }}>关联计划</div>
            <div style={{ width: 70, textAlign: 'center', ...th }}>类型</div>
            <div style={{ width: 90, textAlign: 'center', ...th }}>环境</div>
            <div style={{ width: 80, textAlign: 'center', ...th }}>状态</div>
            <div style={{ width: 150, textAlign: 'center', ...th }}>结果</div>
            <div style={{ width: 70, textAlign: 'center', ...th }}>通过率</div>
            <div style={{ width: 70, textAlign: 'right', ...th }}>耗时</div>
            <div style={{ width: 130, textAlign: 'center', ...th }}>操作</div>
          </div>
          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filtered.map(r => {
              const isCompleted = !!r.completedAt
              return (
                <div key={r.id}
                  onClick={() => navigate(`/projects/${projectId}/reports/${r.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '0 16px', height: 44,
                    borderBottom: '1px solid #f2f3f5', cursor: 'pointer', transition: 'background .12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Plan name + time */}
                  <div style={{ flex: 3, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, color: '#1d2129', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.planName}
                    </span>
                    <span style={{ fontSize: 11, color: '#c9cdd4', flexShrink: 0 }}>
                      {r.executedAt ? new Date(r.executedAt).toLocaleString('zh-CN') : '-'}
                    </span>
                  </div>

                  {/* Type */}
                  <div style={{ width: 70, textAlign: 'center' }}>
                    <span style={{ fontSize: 12, color: '#86909c' }}>
                      {r.planType === 'automated' ? '自动化' : '手动'}
                    </span>
                  </div>

                  {/* Environment */}
                  <div style={{ width: 90, textAlign: 'center' }}>
                    {r.environmentName ? (
                      <span style={{ fontSize: 12, color: '#86909c' }}>
                        {r.environmentName}
                      </span>
                    ) : <span style={{ fontSize: 11, color: '#c9cdd4' }}>-</span>}
                  </div>

                  {/* Status */}
                  <div style={{ width: 80, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, padding: '2px 8px', borderRadius: 10,
                      background: isCompleted ? '#00b96b' : '#1890ff',
                      color: '#fff',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                      {isCompleted ? '已完成' : '执行中'}
                    </span>
                  </div>

                  {/* Results */}
                  <div style={{ width: 150, textAlign: 'center', fontSize: 12, fontFamily: 'monospace' }}>
                    <span style={{ color: '#00b96b' }}>{r.passed}</span>
                    <span style={{ color: '#c9cdd4' }}> / </span>
                    <span style={{ color: '#ff4d4f' }}>{r.failed + r.error}</span>
                    <span style={{ color: '#c9cdd4' }}> / </span>
                    <span style={{ color: '#4e5969' }}>{r.totalScenarios}</span>
                    <span style={{ fontSize: 10, color: '#c9cdd4', marginLeft: 4 }}>通过/失败/总计</span>
                  </div>

                  {/* Pass rate */}
                  <div style={{ width: 70, textAlign: 'center' }}>
                    {r.passRate != null ? (
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: rateColor(r.passRate) }}>
                        {r.passRate}%
                      </span>
                    ) : <span style={{ fontSize: 11, color: '#c9cdd4' }}>-</span>}
                  </div>

                  {/* Duration */}
                  <div style={{ width: 70, textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: '#86909c' }}>
                    {fmt(r.totalDurationMs)}
                  </div>

                  {/* Actions */}
                  <div style={{ width: 130, display: 'flex', justifyContent: 'center', gap: 2 }}>
                    <Button type="text" size="small" style={{ fontSize: 12, color: '#1890ff' }}
                      onClick={e => handleExport(e, r.id)}>导出</Button>
                    <Button type="text" size="small" danger style={{ fontSize: 12 }}
                      onClick={e => handleDelete(e, r.id, r.planName)}>删除</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 2px', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#86909c' }}>共 {total} 条</span>
          <Pagination current={page} total={total} pageSize={pageSize} size="small"
            showSizeChanger showQuickJumper
            pageSizeOptions={[10, 20, 50, 100]}
            onChange={(p, ps) => { if (ps !== pageSize) { setPageSize(ps); setPage(1) } else { setPage(p) } }} />
        </div>
        </>
      }
    </div>
  )
}
