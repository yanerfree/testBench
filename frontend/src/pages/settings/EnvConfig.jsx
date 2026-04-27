import { useState, useEffect, useCallback } from 'react'
import { Button, Input, Table, Tabs, Modal, Form, message, Popconfirm, Tag, Tooltip, Spin } from 'antd'
import {
  PlusOutlined, DeleteOutlined, CopyOutlined, EditOutlined,
  GlobalOutlined, CloudServerOutlined, EyeOutlined, EyeInvisibleOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

export default function EnvConfig() {
  const [activeTab, setActiveTab] = useState('environments')

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>环境配置</h2>
        <span style={{ fontSize: 13, color: '#86909c' }}>
          管理全局变量和环境变量，执行时优先级：环境变量 &gt; 全局变量 &gt; 脚本配置
        </span>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'environments', label: <span><CloudServerOutlined /> 环境管理</span>, children: <EnvironmentPanel /> },
          { key: 'global', label: <span><GlobalOutlined /> 全局变量</span>, children: <GlobalVariablePanel /> },
        ]}
      />
    </div>
  )
}

// ============ 环境管理面板 ============
function EnvironmentPanel() {
  const [envs, setEnvs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [envVars, setEnvVars] = useState([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()

  const selectedEnv = envs.find(e => e.id === selectedId)

  const fetchEnvs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/environments')
      const list = res.data || []
      setEnvs(list)
      if (list.length > 0 && !list.find(e => e.id === selectedId)) {
        setSelectedId(list[0].id)
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  const fetchEnvVars = useCallback(async () => {
    if (!selectedId) return
    try {
      const res = await api.get(`/environments/${selectedId}/variables`)
      setEnvVars(res.data || [])
    } catch { /* */ }
  }, [selectedId])

  useEffect(() => { fetchEnvs() }, [fetchEnvs])
  useEffect(() => { fetchEnvVars() }, [fetchEnvVars])

  const handleCreate = async () => {
    let values
    try { values = await form.validateFields() } catch { return }
    try {
      const res = await api.post('/environments', { name: values.name, description: values.description || null })
      message.success('环境创建成功')
      setCreateOpen(false)
      form.resetFields()
      fetchEnvs()
      setSelectedId(res.data.id)
    } catch { /* */ }
  }

  const handleClone = async () => {
    if (!selectedEnv) return
    try {
      const res = await api.post(`/environments/${selectedId}/clone`, { name: `${selectedEnv.name}-copy` })
      message.success('环境复制成功')
      fetchEnvs()
      setSelectedId(res.data.id)
    } catch { /* */ }
  }

  const handleDeleteEnv = async () => {
    try {
      await api.del(`/environments/${selectedId}`)
      message.success('环境已删除')
      setSelectedId(null)
      fetchEnvs()
    } catch { /* */ }
  }

  const handleSaveVars = async (vars) => {
    try {
      await api.put(`/environments/${selectedId}/variables`, vars.map(v => ({
        key: v.key, value: v.value, description: v.description || null,
      })))
      message.success('变量已保存')
      fetchEnvVars()
    } catch { /* */ }
  }

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
      {/* 左侧环境列表 */}
      <div style={{ width: 200, background: '#fff', borderRadius: 10, border: '1px solid #f2f3f5', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div> :
            envs.map(env => (
              <div key={env.id} onClick={() => setSelectedId(env.id)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  background: selectedId === env.id ? '#e6f7ff' : 'transparent',
                  borderLeft: selectedId === env.id ? '3px solid #00b96b' : '3px solid transparent',
                  borderBottom: '1px solid #f2f3f5',
                }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1d2129' }}>{env.name}</div>
                {env.description && <div style={{ fontSize: 11, color: '#86909c', marginTop: 2 }}>{env.description}</div>}
              </div>
            ))
          }
        </div>
        <div style={{ padding: 10, borderTop: '1px solid #f2f3f5' }}>
          <Button type="dashed" icon={<PlusOutlined />} block size="small" onClick={() => setCreateOpen(true)}>新增环境</Button>
        </div>
      </div>

      {/* 右侧环境详情 */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #f2f3f5', padding: '20px 24px' }}>
        {selectedEnv ? (<>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#1d2129' }}>{selectedEnv.name}</h3>
              <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>{selectedEnv.description || '暂无描述'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Tooltip title="复制环境"><Button size="small" icon={<CopyOutlined />} onClick={handleClone} /></Tooltip>
              <Popconfirm title="确定删除该环境？" onConfirm={handleDeleteEnv}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#86909c', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>环境变量</div>
          <VariableTable variables={envVars} onSave={handleSaveVars} />
        </>) : (
          <div style={{ textAlign: 'center', padding: 80, color: '#c9cdd4' }}>请从左侧选择环境</div>
        )}
      </div>

      <Modal title="新增环境" open={createOpen} onOk={handleCreate} onCancel={() => { setCreateOpen(false); form.resetFields() }} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="环境名称" rules={[{ required: true, message: '请输入环境名称' }]}>
            <Input placeholder="如 staging、production" />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input placeholder="环境用途说明" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ============ 全局变量面板 ============
function GlobalVariablePanel() {
  const [variables, setVariables] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchVars = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/global-variables')
      setVariables(res.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchVars() }, [fetchVars])

  const handleSave = async (vars) => {
    try {
      await api.put('/global-variables', vars.filter(v => v.key && v.value).map(v => ({
        key: v.key, value: v.value, description: v.description || null,
      })))
      message.success('全局变量已保存')
      fetchVars()
    } catch { /* request.js 已展示错误 */ }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f2f3f5', padding: '20px 24px', maxWidth: 800 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#1d2129' }}>全局变量</div>
        <div style={{ fontSize: 12, color: '#86909c', marginTop: 4 }}>
          全局变量在所有环境中共享，当环境变量存在同名 key 时，环境变量优先
        </div>
      </div>
      {loading ? <Spin /> : <VariableTable variables={variables} onSave={handleSave} />}
    </div>
  )
}

// ============ 变量表格（复用组件） ============
function VariableTable({ variables, onSave }) {
  const [editVars, setEditVars] = useState([])
  const [dirty, setDirty] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')

  useEffect(() => {
    setEditVars(variables.map(v => ({ key: v.key, value: v.value, description: v.description })))
    setDirty(false)
  }, [variables])

  const toggleReveal = (key) => {
    setRevealedKeys(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  const updateVar = (index, field, value) => {
    const updated = [...editVars]
    updated[index] = { ...updated[index], [field]: value }
    setEditVars(updated)
    setDirty(true)
  }

  const addVar = () => { setEditVars(prev => [...prev, { key: '', value: '' }]); setDirty(true) }
  const removeVar = (index) => { setEditVars(prev => prev.filter((_, i) => i !== index)); setDirty(true) }

  const handleSave = () => {
    const valid = editVars.filter(v => v.key && v.value)
    onSave?.(valid)
  }

  const openBulkEdit = () => {
    setBulkText(editVars.map(v => `${v.key},${v.value}`).join('\n'))
    setBulkOpen(true)
  }

  const handleBulkConfirm = () => {
    const lines = bulkText.split('\n').filter(l => l.trim())
    const parsed = []
    for (const line of lines) {
      const idx = line.indexOf(',')
      if (idx === -1) continue
      const key = line.substring(0, idx).trim()
      const value = line.substring(idx + 1).trim()
      if (key) parsed.push({ key, value })
    }
    setEditVars(parsed)
    setDirty(true)
    setBulkOpen(false)
  }

  const inputStyle = { fontSize: 12, padding: '2px 4px' }

  const columns = [
    { title: '变量名', dataIndex: 'key', width: '35%', render: (v, _, i) => <Input value={v} onChange={e => updateVar(i, 'key', e.target.value)} placeholder="KEY" variant="borderless" size="small" style={inputStyle} /> },
    { title: '值', dataIndex: 'value', width: '50%', render: (v, _, i) => <Input value={v} onChange={e => updateVar(i, 'value', e.target.value)} placeholder="VALUE" variant="borderless" size="small" style={inputStyle} /> },
    { title: '', width: 50, align: 'center', render: (_, __, i) => <Popconfirm title="删除此变量？" onConfirm={() => removeVar(i)}><Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#c9cdd4' }} /></Popconfirm> },
  ]

  return (<>
    <Table dataSource={editVars} columns={columns} rowKey={(r, i) => r.id || r.key || `row-${i}`} size="small" pagination={false} style={{ marginBottom: 12 }} />
    <div style={{ display: 'flex', gap: 8 }}>
      <Button type="dashed" icon={<PlusOutlined />} onClick={addVar} size="small">添加变量</Button>
      <Button icon={<UnorderedListOutlined />} onClick={openBulkEdit} size="small">批量编辑</Button>
      {dirty && <Button type="primary" size="small" onClick={handleSave}>保存</Button>}
    </div>

    <Modal title="批量编辑" open={bulkOpen} onOk={handleBulkConfirm} onCancel={() => setBulkOpen(false)} okText="确定" cancelText="取消" width={560}>
      <div style={{ fontSize: 13, color: '#86909c', marginBottom: 10 }}>格式: <span style={{ color: '#4e5969', fontFamily: 'monospace' }}>变量名,值</span></div>
      <Input.TextArea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={10}
        placeholder={'BASE_URL,https://staging.example.com\nDB_HOST,10.0.1.100'}
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: 13 }} />
    </Modal>
  </>)
}
