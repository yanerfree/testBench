import { useState, useEffect, useCallback, useRef } from 'react'
import { Tabs, Table, Tag, Button, Input, Space, Typography, message, Alert } from 'antd'
import { CheckOutlined, PlusOutlined, DeleteOutlined, EditOutlined, FastForwardOutlined } from '@ant-design/icons'
import { api } from '../../../utils/request'

const { Text } = Typography

const DIMENSION_COLORS = {
  positive: '#0ea5a0', negative: 'red', boundary: 'orange',
  permission: 'purple', data: 'cyan', state: 'blue',
}
const DIMENSION_LABELS = {
  positive: '正向', negative: '异常', boundary: '边界',
  permission: '权限', data: '数据', state: '状态',
}

export default function Stage3ScenarioModel({ projectId, branchId, taskId, onConfirm }) {
  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(false)
  const [editingCell, setEditingCell] = useState(null)
  const [editValue, setEditValue] = useState('')
  const pollRef = useRef(null)

  const basePath = `/projects/${projectId}/branches/${branchId}/scenario-gen/tasks/${taskId}`

  const fetchModel = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`${basePath}/scenario-model`)
      setModel(res.data)
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch { /* 可能还没生成 */ }
    finally { setLoading(false) }
  }, [basePath])

  useEffect(() => { fetchModel() }, [fetchModel])

  useEffect(() => {
    if (!model && !pollRef.current) {
      pollRef.current = setInterval(fetchModel, 3000)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [model, fetchModel])

  const saveField = async (field, value) => {
    try {
      const res = await api.put(`${basePath}/scenario-model`, { [field]: value })
      setModel(res.data)
    } catch { message.error('保存失败') }
  }

  const handleConfirm = async (skip = false) => {
    try {
      const res = await api.post(`${basePath}/confirm-model${skip ? '?skip=true' : ''}`)
      message.success(skip ? '已跳过确认，开始生成' : `已确认，即将生成 ${res.data.testPointCount} 条用例`)
      onConfirm?.(res.data)
    } catch { /* request.js */ }
  }

  if (!model) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#8c919e' }}>
        <p>场景模型生成中，请稍候...</p>
        <Button onClick={fetchModel} loading={loading}>刷新</Button>
        <p style={{ fontSize: 12, marginTop: 8 }}>每 3 秒自动检查</p>
      </div>
    )
  }

  const testPointCount = model.testPoints?.length || 0

  const flowColumns = [
    { title: '序号', dataIndex: 'seq', key: 'seq', width: 60 },
    { title: '操作', dataIndex: 'action', key: 'action' },
    { title: '角色', dataIndex: 'actor', key: 'actor', width: 100 },
    { title: '说明', dataIndex: 'note', key: 'note', width: 200 },
  ]

  const stateColumns = [
    { title: '源状态', dataIndex: 'from', key: 'from' },
    { title: '目标状态', dataIndex: 'to', key: 'to' },
    { title: '触发动作', dataIndex: 'trigger', key: 'trigger' },
    { title: '需求点', dataIndex: 'requirement_point', key: 'rp', width: 80 },
  ]

  const roleColumns = [
    { title: '角色', dataIndex: 'role', key: 'role' },
    { title: '操作', dataIndex: 'action', key: 'action' },
    { title: '允许', dataIndex: 'allowed', key: 'allowed', width: 80,
      render: v => v ? <Tag color="cyan">允许</Tag> : <Tag color="error">禁止</Tag>,
    },
  ]

  const testPointColumns = [
    { title: '需求点', dataIndex: 'requirement_point_code', key: 'rp', width: 80,
      render: (code) => <Text code style={{ fontSize: 12 }}>{code}</Text>,
    },
    { title: '测试点', dataIndex: 'title', key: 'title' },
    { title: '维度', dataIndex: 'dimension', key: 'dim', width: 80,
      render: (d) => <Tag color={DIMENSION_COLORS[d] || 'default'}>{DIMENSION_LABELS[d] || d}</Tag>,
    },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 60,
      render: (p) => <Tag color={p === 'P0' ? 'red' : p === 'P1' ? 'orange' : 'blue'}>{p}</Tag>,
    },
    { title: '说明', dataIndex: 'note', key: 'note', width: 200,
      ellipsis: true,
    },
  ]

  const edited = model.editedFields || {}
  const editedTestPoints = new Set(edited.test_points || edited.testPoints || [])

  const tabItems = [
    {
      key: 'flows',
      label: `业务流程 ${model.flows?.length || 0}`,
      children: <Table dataSource={model.flows} columns={flowColumns} rowKey="seq" pagination={false} size="small" />,
    },
    {
      key: 'states',
      label: `状态转换 ${model.stateTransitions?.length || 0}`,
      children: <Table dataSource={model.stateTransitions} columns={stateColumns} rowKey={(_, i) => i} pagination={false} size="small" />,
    },
    {
      key: 'roles',
      label: `角色权限 ${model.roleMatrix?.length || 0}`,
      children: <Table dataSource={model.roleMatrix} columns={roleColumns} rowKey={(_, i) => i} pagination={false} size="small" />,
    },
    {
      key: 'testpoints',
      label: `测试点 ${testPointCount}`,
      children: (
        <Table
          dataSource={model.testPoints}
          columns={testPointColumns}
          rowKey="ref"
          pagination={false}
          size="small"
          rowClassName={(record) => editedTestPoints.has(record.ref) ? 'edited-row' : ''}
        />
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <style>{`.edited-row td:first-child::before { content: "✎ "; color: #7cacf8; }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 15 }}>场景模型</Text>
        <Button type="link" size="small" icon={<FastForwardOutlined />}
          onClick={() => handleConfirm(true)}>
          跳过确认直接生成
        </Button>
      </div>

      <Tabs items={tabItems} defaultActiveKey="testpoints" size="small" />

      <div style={{ marginTop: 20, textAlign: 'right' }}>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={() => handleConfirm(false)}
          disabled={testPointCount === 0}
          size="large"
        >
          确认模型，开始生成 {testPointCount} 条用例 →
        </Button>
      </div>
    </div>
  )
}
