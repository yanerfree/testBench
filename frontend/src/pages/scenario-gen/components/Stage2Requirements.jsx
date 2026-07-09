import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Tag, Input, Alert, Card, Space, Drawer, Typography, Popconfirm, message } from 'antd'
import { PlusOutlined, SearchOutlined, CheckOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { api } from '../../../utils/request'

const { Text, Paragraph } = Typography

const ANCHOR_TAG = {
  anchored: { color: 'success', label: '已锚定' },
  fuzzy: { color: 'warning', label: '模糊匹配' },
  unanchored: { color: 'default', label: '未定位' },
}

export default function Stage2Requirements({ projectId, branchId, taskId, docContent, healthCheck, onConfirm }) {
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedQuote, setSelectedQuote] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const basePath = `/projects/${projectId}/branches/${branchId}/scenario-gen/tasks/${taskId}`

  const fetchPoints = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`${basePath}/requirement-points`)
      setPoints(res.data || [])
    } catch { /* request.js */ }
    finally { setLoading(false) }
  }, [basePath])

  useEffect(() => { fetchPoints() }, [fetchPoints])

  const handleDelete = async (id) => {
    try {
      await api.delete(`${basePath}/requirement-points/${id}`)
      message.success('已删除')
      fetchPoints()
    } catch { /* */ }
  }

  const handleSaveEdit = async (id) => {
    if (!editTitle.trim()) return
    try {
      await api.put(`${basePath}/requirement-points/${id}`, { title: editTitle })
      setEditingId(null)
      fetchPoints()
    } catch { /* */ }
  }

  const handleAddPoint = async () => {
    try {
      await api.post(`${basePath}/requirement-points`, { title: '新需求点（请编辑）' })
      fetchPoints()
    } catch { /* */ }
  }

  const handleConfirm = async () => {
    const activeCount = points.filter(p => p.status === 'active').length
    if (activeCount === 0) { message.warning('至少需要一个有效需求点'); return }
    try {
      const res = await api.post(`${basePath}/confirm-requirements`)
      message.success('需求点已确认，即将生成场景模型')
      onConfirm?.(res.data)
    } catch { /* */ }
  }

  const showQuote = (point) => {
    setSelectedQuote(point)
    setDrawerOpen(true)
  }

  const score = healthCheck?.score
  const issues = healthCheck?.issues || []
  const belowThreshold = healthCheck?.below_threshold

  const columns = [
    { title: '编号', dataIndex: 'code', key: 'code', width: 70,
      render: (code) => <Text code style={{ fontSize: 12 }}>{code}</Text>,
    },
    { title: '需求点', dataIndex: 'title', key: 'title',
      render: (title, record) => {
        if (editingId === record.id) {
          return (
            <Input size="small" value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onPressEnter={() => handleSaveEdit(record.id)}
              onBlur={() => handleSaveEdit(record.id)}
              autoFocus
            />
          )
        }
        return (
          <span style={{ cursor: 'pointer' }} onClick={() => { setEditingId(record.id); setEditTitle(title) }}>
            {title} <EditOutlined style={{ fontSize: 11, color: '#bfc4cd', marginLeft: 4 }} />
          </span>
        )
      },
    },
    { title: '锚定', dataIndex: 'anchorStatus', key: 'anchor', width: 100,
      render: (s) => {
        const info = ANCHOR_TAG[s] || ANCHOR_TAG.unanchored
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    { title: '原文', key: 'quote', width: 80,
      render: (_, record) => record.quoteText ? (
        <Button type="link" size="small" icon={<SearchOutlined />} onClick={() => showQuote(record)}>
          查看
        </Button>
      ) : <Text type="secondary">—</Text>,
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s) => s === 'not_applicable'
        ? <Tag color="default">不适用</Tag>
        : <Tag color="blue">有效</Tag>,
    },
    { title: '操作', key: 'actions', width: 60,
      render: (_, record) => (
        <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* 质量检测卡 */}
      {score !== null && score !== undefined && (
        <Card size="small" style={{
          marginBottom: 16,
          borderColor: belowThreshold ? '#faad14' : '#52c41a',
          background: belowThreshold ? 'rgba(250,173,20,0.04)' : 'rgba(82,196,26,0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong>健康分 {score}</Text>
              {belowThreshold ? <Tag color="warning">建议改善</Tag> : <Tag color="success">通过</Tag>}
              {issues.length > 0 && <Text type="secondary">发现 {issues.length} 个问题</Text>}
            </Space>
          </div>
          {issues.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {issues.slice(0, 5).map((issue, i) => (
                <div key={i} style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  <Tag color={issue.severity === 'critical' ? 'error' : issue.severity === 'major' ? 'warning' : 'default'}
                    style={{ fontSize: 11 }}>{issue.category}</Tag>
                  {issue.description}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 需求点表格 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong>需求点清单（{points.filter(p => p.status === 'active').length} 个有效）</Text>
        <Button size="small" icon={<PlusOutlined />} onClick={handleAddPoint}>手工新建</Button>
      </div>

      <Table
        dataSource={points}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
      />

      <div style={{ marginTop: 20, textAlign: 'right' }}>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleConfirm}
          disabled={points.filter(p => p.status === 'active').length === 0}
        >
          {belowThreshold
            ? `仍要继续（已知 ${issues.length} 个问题）`
            : `确认需求点，生成场景模型 →`
          }
        </Button>
      </div>

      {/* 原文引用抽屉 */}
      <Drawer
        title={selectedQuote ? `${selectedQuote.code} — 原文引用` : '原文引用'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
      >
        {selectedQuote && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Tag color={ANCHOR_TAG[selectedQuote.anchorStatus]?.color}>
                {ANCHOR_TAG[selectedQuote.anchorStatus]?.label}
              </Tag>
              {selectedQuote.anchorStatus === 'unanchored' && (
                <Text type="secondary" style={{ fontSize: 12 }}>未能定位原文（引用仅供参考）</Text>
              )}
            </div>
            {selectedQuote.quoteText && (
              <Card size="small" style={{
                background: selectedQuote.anchorStatus === 'fuzzy' ? '#fffbe6' : '#f6ffed',
                borderStyle: selectedQuote.anchorStatus === 'fuzzy' ? 'dashed' : 'solid',
                borderColor: selectedQuote.anchorStatus === 'fuzzy' ? '#faad14' : '#b7eb8f',
              }}>
                <Paragraph style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                  {selectedQuote.quoteText}
                </Paragraph>
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
