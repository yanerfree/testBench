import { useState, useEffect, useCallback, useRef } from 'react'
import { Table, Tag, Button, Input, Space, Typography, Drawer, Popover, Radio, message, Tooltip } from 'antd'
import { CheckOutlined, CloseOutlined, EditOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { api } from '../../../utils/request'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const REJECT_CATEGORIES = [
  { value: 'vague_expectation', label: '预期含糊' },
  { value: 'unspecific_data', label: '数据不具体' },
  { value: 'duplicate', label: '场景重复' },
  { value: 'misunderstood_requirement', label: '需求理解错' },
  { value: 'other', label: '其他' },
]

const SCORE_COLOR = (s) => s >= 85 ? 'green' : s >= 70 ? 'blue' : 'orange'

export default function Stage5Review({ projectId, branchId, taskId }) {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [selectedCase, setSelectedCase] = useState(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectCategory, setRejectCategory] = useState('vague_expectation')
  const [rejectText, setRejectText] = useState('')
  const tableRef = useRef(null)

  const basePath = `/projects/${projectId}/branches/${branchId}`

  const fetchCases = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`${basePath}/cases?source=ai&pageSize=100`)
      const items = res.data?.items || res.data || []
      setCases(items.filter(c => {
        if (filter === 'all') return true
        return c.reviewStatus === filter
      }))
    } catch { /* */ }
    finally { setLoading(false) }
  }, [basePath, filter])

  useEffect(() => { fetchCases() }, [fetchCases])

  // 键盘流
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const idx = cases.findIndex(c => c.id === selectedId)
      if (e.key === 'j' && idx < cases.length - 1) { setSelectedId(cases[idx + 1]?.id); e.preventDefault() }
      if (e.key === 'k' && idx > 0) { setSelectedId(cases[idx - 1]?.id); e.preventDefault() }
      if (e.key === 'a' && selectedId) { handleApprove(selectedId); e.preventDefault() }
      if (e.key === 'r' && selectedId) { setRejectOpen(true); e.preventDefault() }
      if (e.key === '?') { message.info('j/k 上下移 · a 通过 · r 拒绝 · e 编辑'); e.preventDefault() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [cases, selectedId])

  useEffect(() => {
    const found = cases.find(c => c.id === selectedId)
    setSelectedCase(found || null)
  }, [selectedId, cases])

  const handleApprove = async (id) => {
    try {
      await api.put(`${basePath}/cases/${id}`, { reviewStatus: 'approved' })
      message.success('已通过')
      fetchCases()
      // 自动移到下一条
      const idx = cases.findIndex(c => c.id === id)
      if (idx < cases.length - 1) setSelectedId(cases[idx + 1]?.id)
    } catch { /* */ }
  }

  const handleReject = async () => {
    if (!selectedId) return
    try {
      await api.put(`${basePath}/cases/${selectedId}`, {
        reviewStatus: 'rejected',
        reviewReason: { category: rejectCategory, text: rejectText },
      })
      message.success('已拒绝')
      setRejectOpen(false)
      setRejectText('')
      fetchCases()
      const idx = cases.findIndex(c => c.id === selectedId)
      if (idx < cases.length - 1) setSelectedId(cases[idx + 1]?.id)
    } catch { /* */ }
  }

  const reviewedCount = cases.filter(c => c.reviewStatus === 'approved' || c.reviewStatus === 'rejected').length

  const columns = [
    {
      title: '评分', dataIndex: 'qualityScore', key: 'score', width: 60,
      render: (s) => {
        if (!s || s.total == null) return <Text type="secondary">—</Text>
        return <Tag color={SCORE_COLOR(s.total)}>{s.total}</Tag>
      },
      sorter: (a, b) => (a.qualityScore?.total || 0) - (b.qualityScore?.total || 0),
      defaultSortOrder: 'ascend',
    },
    {
      title: '标题', dataIndex: 'title', key: 'title',
      ellipsis: true,
      render: (t) => <Text style={{ fontSize: 13 }}>{t}</Text>,
    },
    {
      title: '审核', dataIndex: 'reviewStatus', key: 'review', width: 80,
      render: (s) => {
        if (s === 'approved') return <Tag color="success">已通过</Tag>
        if (s === 'rejected') return <Tag color="error">已拒绝</Tag>
        return <Tag color="processing">待审核</Tag>
      },
    },
  ]

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
      {/* 左栏：用例列表 */}
      <div style={{ width: 420, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text strong>评审 {reviewedCount}/{cases.length}</Text>
          <Space size={4}>
            {['all', 'pending_review', 'approved', 'rejected'].map(f => (
              <Tag key={f} color={filter === f ? 'blue' : 'default'} style={{ cursor: 'pointer' }}
                onClick={() => setFilter(f)}>
                {f === 'all' ? '全部' : f === 'pending_review' ? '待审' : f === 'approved' ? '已审' : '已拒'}
              </Tag>
            ))}
          </Space>
        </div>
        <Table
          ref={tableRef}
          dataSource={cases}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          onRow={(record) => ({
            onClick: () => setSelectedId(record.id),
            style: {
              cursor: 'pointer',
              background: record.id === selectedId ? 'rgba(124,172,248,0.08)' : undefined,
            },
          })}
          scroll={{ y: 400 }}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: '#bfc4cd' }}>
          j/k 上下 · a 通过 · r 拒绝 · ? 帮助
        </div>
      </div>

      {/* 右栏：详情预览 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedCase ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <Text strong style={{ fontSize: 15 }}>{selectedCase.caseCode || selectedCase.id?.slice(0, 8)}</Text>
                <div><Text type="secondary">{selectedCase.title}</Text></div>
              </div>
              <Space>
                <Button icon={<CheckOutlined />} type="primary" size="small"
                  onClick={() => handleApprove(selectedCase.id)}>通过 (a)</Button>
                <Popover
                  open={rejectOpen}
                  onOpenChange={setRejectOpen}
                  trigger="click"
                  placement="bottomRight"
                  content={(
                    <div style={{ width: 280 }}>
                      <Text strong style={{ fontSize: 12 }}>拒绝理由</Text>
                      <Radio.Group value={rejectCategory} onChange={e => setRejectCategory(e.target.value)}
                        style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                        {REJECT_CATEGORIES.map(c => (
                          <Radio key={c.value} value={c.value} style={{ fontSize: 12 }}>{c.label}</Radio>
                        ))}
                      </Radio.Group>
                      <TextArea rows={2} placeholder="补充说明（可选）" value={rejectText}
                        onChange={e => setRejectText(e.target.value)} style={{ marginTop: 8, fontSize: 12 }} />
                      <Button type="primary" danger size="small" block style={{ marginTop: 8 }}
                        onClick={handleReject}>确认拒绝</Button>
                    </div>
                  )}
                >
                  <Button icon={<CloseOutlined />} danger size="small">拒绝 (r)</Button>
                </Popover>
              </Space>
            </div>

            {/* 用例详情 */}
            {selectedCase.qualityScore?.warnings?.length > 0 && (
              <div style={{ marginBottom: 12, padding: 8, background: '#fffbe6', borderRadius: 6, fontSize: 12 }}>
                {selectedCase.qualityScore.warnings.map((w, i) => (
                  <div key={i} style={{ color: '#d48806' }}>⚠ {w.message || w.rule}</div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>前置条件</Text>
              <div style={{ fontSize: 13 }}>{selectedCase.preconditions || '—'}</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>步骤</Text>
              {(selectedCase.steps || []).map((s, i) => (
                <div key={i} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <strong>{i + 1}.</strong> {s.action || s.step}
                  {s.expected && <span style={{ color: '#52c41a', marginLeft: 8 }}>→ {s.expected}</span>}
                </div>
              ))}
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>预期结果</Text>
              <div style={{ fontSize: 13 }}>{selectedCase.expectedResult || selectedCase.expected_result || '—'}</div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '100px 0', color: '#bfc4cd' }}>
            选择左侧用例查看详情
          </div>
        )}
      </div>
    </div>
  )
}
