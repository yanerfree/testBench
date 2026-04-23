import { useState, useEffect, useCallback } from 'react'
import { Card, Tag, Space, Spin, Empty, Input, Radio, Button, Pagination } from 'antd'
import { SearchOutlined, ReloadOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

function fmt(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}

export default function ReportList() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  const fetchReports = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/reports?page=${page}&pageSize=20`)
      setReports(res.data || [])
      setTotal(res.pagination?.total || 0)
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, page])

  useEffect(() => { fetchReports() }, [fetchReports])

  const filtered = keyword
    ? reports.filter(r => r.planName.toLowerCase().includes(keyword.toLowerCase()))
    : reports

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>测试报告</h2>
        <Space>
          <Input prefix={<SearchOutlined style={{ color: '#c2c6cf' }} />} placeholder="搜索报告"
            value={keyword} onChange={e => setKeyword(e.target.value)} allowClear style={{ width: 240 }} size="small" />
          <Button icon={<ReloadOutlined />} onClick={fetchReports} loading={loading} size="small">刷新</Button>
        </Space>
      </div>

      {/* Table Header */}
      <div style={{ display: 'flex', padding: '10px 20px', background: '#f7f8fa', borderRadius: '8px 8px 0 0', border: '1px solid #f0f0f3', borderBottom: 'none', fontSize: 13, color: '#86909c', fontWeight: 500 }}>
        <div style={{ flex: 5 }}>报告信息</div>
        <div style={{ flex: 2, textAlign: 'center' }}>状态</div>
        <div style={{ flex: 4 }}>结果</div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div> :
        filtered.length === 0 ? <Empty description="暂无报告" style={{ marginTop: 60 }} /> :
        <div style={{ border: '1px solid #f0f0f3', borderRadius: '0 0 8px 8px', background: '#fff' }}>
          {filtered.map((r, i) => {
            const isCompleted = !!r.completedAt
            const statusLabel = isCompleted ? '已完成' : '执行中'
            const statusColor = isCompleted ? '#6ecf96' : '#7c8cf8'
            return (
              <div key={r.id}
                onClick={() => navigate(`/projects/${projectId}/reports/${r.planId}`)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '14px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #f5f5f7' : 'none',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                {/* 报告信息 */}
                <div style={{ flex: 5 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#2e3138', marginBottom: 4 }}>
                    {r.planName}
                  </div>
                  <Space size={12} style={{ fontSize: 12, color: '#8c919e' }}>
                    <span><ClockCircleOutlined style={{ marginRight: 3 }} />{r.executedAt ? new Date(r.executedAt).toLocaleString('zh-CN') : '-'}</span>
                    <Tag style={{ background: '#f5f5f7', color: '#8c919e', border: 'none', fontSize: 11 }}>{r.planType === 'automated' ? '自动化' : '手动'}</Tag>
                    <Tag style={{ background: '#f5f5f7', color: '#8c919e', border: 'none', fontSize: 11 }}>{r.testType?.toUpperCase()}</Tag>
                  </Space>
                </div>

                {/* 状态 */}
                <div style={{ flex: 2, textAlign: 'center' }}>
                  <Tag style={{ background: isCompleted ? '#eefbf3' : '#eef0fe', color: statusColor, border: 'none' }}>{statusLabel}</Tag>
                </div>

                {/* 结果 */}
                <div style={{ flex: 4 }}>
                  <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>
                      <span style={{ color: '#86909c' }}>总用例: </span>
                      <span style={{ fontWeight: 500 }}>{r.totalScenarios}</span>
                      <span style={{ color: '#86909c', marginLeft: 12 }}>成功: </span>
                      <span style={{ color: '#6ecf96', fontWeight: 500 }}>{r.passed}</span>
                    </div>
                    <div>
                      <span style={{ color: '#86909c' }}>失败: </span>
                      <span style={{ color: '#f08a8e', fontWeight: 500 }}>{r.failed + r.error}</span>
                      <span style={{ color: '#86909c', marginLeft: 12 }}>耗时: </span>
                      <span style={{ fontWeight: 500 }}>{fmt(r.totalDurationMs)}</span>
                      {r.passRate != null && <>
                        <span style={{ color: '#86909c', marginLeft: 12 }}>通过率: </span>
                        <span style={{ color: r.passRate >= 95 ? '#6ecf96' : r.passRate >= 80 ? '#f5b87a' : '#f08a8e', fontWeight: 500 }}>{r.passRate}%</span>
                      </>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      }
      {total > 20 && (
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <Pagination current={page} total={total} pageSize={20} size="small" showTotal={t => `共 ${t} 条`}
            onChange={p => setPage(p)} />
        </div>
      )}
      {total <= 20 && (
        <div style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: '#8c919e' }}>
          共 {total} 条
        </div>
      )}
    </div>
  )
}
