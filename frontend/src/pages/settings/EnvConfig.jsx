import { useState } from 'react'
import { Button, Input, Table, Tabs, Modal, Form, message, Popconfirm, Tag, Tooltip } from 'antd'
import {
  PlusOutlined, DeleteOutlined, CopyOutlined, EditOutlined,
  GlobalOutlined, CloudServerOutlined, EyeOutlined, EyeInvisibleOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { mockEnvironments, mockGlobalVariables } from '../../mock/data'

export default function EnvConfig() {
  const [activeTab, setActiveTab] = useState('environments')

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#2e3138' }}>环境配置</h2>
        <span style={{ fontSize: 13, color: '#8c919e' }}>
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
  const [envs, setEnvs] = useState(mockEnvironments)
  const [selectedId, setSelectedId] = useState(mockEnvironments[0]?.id)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()

  const selectedEnv = envs.find(e => e.id === selectedId)

  const handleCreate = () => {
    form.validateFields().then(values => {
      const newEnv = {
        id: `env-${Date.now()}`,
        name: values.name,
        description: values.description || '',
        variables: [],
      }
      setEnvs(prev => [...prev, newEnv])
      setSelectedId(newEnv.id)
      setCreateOpen(false)
      form.resetFields()
      message.success('环境创建成功')
    })
  }

  const handleClone = (env) => {
    const cloned = {
      id: `env-${Date.now()}`,
      name: `${env.name}-copy`,
      description: `${env.description}（副本）`,
      variables: env.variables.map(v => ({ ...v })),
    }
    setEnvs(prev => [...prev, cloned])
    setSelectedId(cloned.id)
    message.success('环境复制成功')
  }

  const handleDeleteEnv = (id) => {
    setEnvs(prev => prev.filter(e => e.id !== id))
    if (selectedId === id) {
      setSelectedId(envs.find(e => e.id !== id)?.id)
    }
    message.success('环境已删除')
  }

  const updateEnvVars = (envId, newVars) => {
    setEnvs(prev => prev.map(e => e.id === envId ? { ...e, variables: newVars } : e))
  }

  const updateEnvField = (envId, field, value) => {
    setEnvs(prev => prev.map(e => e.id === envId ? { ...e, [field]: value } : e))
  }

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
      {/* 左侧环境列表 */}
      <div style={{
        width: 200, background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {envs.map(env => (
            <div
              key={env.id}
              onClick={() => setSelectedId(env.id)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                background: selectedId === env.id ? '#f0f4ff' : 'transparent',
                borderLeft: selectedId === env.id ? '3px solid #6b7ef5' : '3px solid transparent',
                borderBottom: '1px solid #f8f8fa',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: '#2e3138' }}>{env.name}</div>
              <div style={{ fontSize: 11, color: '#8c919e', marginTop: 2 }}>{env.description}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid #f0f0f3' }}>
          <Button type="dashed" icon={<PlusOutlined />} block size="small" onClick={() => setCreateOpen(true)}>
            新增环境
          </Button>
        </div>
      </div>

      {/* 右侧环境详情 */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3', padding: '20px 24px' }}>
        {selectedEnv ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#2e3138' }}>{selectedEnv.name}</h3>
                <Input
                  value={selectedEnv.description}
                  onChange={e => updateEnvField(selectedEnv.id, 'description', e.target.value)}
                  placeholder="环境描述"
                  variant="borderless"
                  style={{ fontSize: 12, color: '#8c919e', padding: 0, marginTop: 2 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Tooltip title="复制环境">
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleClone(selectedEnv)} />
                </Tooltip>
                <Popconfirm title="确定删除该环境？" onConfirm={() => handleDeleteEnv(selectedEnv.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#8c919e', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>环境变量</div>
            <VariableTable
              variables={selectedEnv.variables}
              onChange={vars => updateEnvVars(selectedEnv.id, vars)}
            />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 80, color: '#bfc4cd' }}>请从左侧选择环境</div>
        )}
      </div>

      {/* 创建环境弹窗 */}
      <Modal
        title="新增环境"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="环境名称" rules={[{ required: true, message: '请输入环境名称' }, { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅支持字母、数字、下划线、短横线' }]}>
            <Input placeholder="如 staging、production" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="环境用途说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

// ============ 全局变量面板 ============
function GlobalVariablePanel() {
  const [variables, setVariables] = useState(mockGlobalVariables)

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3', padding: '20px 24px', maxWidth: 800 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#2e3138' }}>全局变量</div>
        <div style={{ fontSize: 12, color: '#8c919e', marginTop: 4 }}>
          全局变量在所有环境中共享，当环境变量存在同名 key 时，环境变量优先
        </div>
      </div>
      <VariableTable variables={variables} onChange={setVariables} />
    </div>
  )
}

// ============ 变量表格（复用组件） ============
function VariableTable({ variables, onChange }) {
  const [revealedKeys, setRevealedKeys] = useState(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const toggleReveal = (key) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const updateVar = (index, field, value) => {
    const updated = [...variables]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  const addVar = () => {
    onChange([...variables, { key: '', value: '' }])
  }

  const removeVar = (index) => {
    onChange(variables.filter((_, i) => i !== index))
  }

  // 批量编辑：打开时将当前变量序列化为 CSV
  const openBulkEdit = () => {
    const csv = variables.map(v => `${v.key},${v.value}`).join('\n')
    setBulkText(csv)
    setBulkOpen(true)
  }

  // 批量编辑：确认时解析 CSV 写回
  const handleBulkConfirm = () => {
    const lines = bulkText.split('\n').filter(l => l.trim())
    const parsed = []
    const errors = []
    lines.forEach((line, i) => {
      // 按第一个逗号拆分，value 中可能包含逗号
      const idx = line.indexOf(',')
      if (idx === -1) {
        errors.push(`第 ${i + 1} 行格式错误: 缺少逗号分隔符`)
        return
      }
      const key = line.substring(0, idx).trim()
      const value = line.substring(idx + 1).trim()
      if (!key) {
        errors.push(`第 ${i + 1} 行: 变量名不能为空`)
        return
      }
      parsed.push({ key, value })
    })
    if (errors.length > 0) {
      message.error(errors[0])
      return
    }
    onChange(parsed)
    setBulkOpen(false)
    message.success(`已导入 ${parsed.length} 条变量`)
  }

  const inputStyle = { fontSize: 12, padding: '2px 4px' }

  const columns = [
    {
      title: '变量名', dataIndex: 'key', width: '35%',
      render: (v, _, i) => (
        <Input
          value={v}
          onChange={e => updateVar(i, 'key', e.target.value)}
          placeholder="KEY"
          variant="borderless"
          size="small"
          style={inputStyle}
        />
      ),
    },
    {
      title: '值', dataIndex: 'value', width: '50%',
      render: (v, record, i) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Input
            value={v}
            onChange={e => updateVar(i, 'value', e.target.value)}
            placeholder="VALUE"
            variant="borderless"
            size="small"
            type={record.sensitive && !revealedKeys.has(record.key) ? 'password' : 'text'}
            style={inputStyle}
          />
          {record.sensitive && (
            <Button
              type="text" size="small"
              icon={revealedKeys.has(record.key) ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => toggleReveal(record.key)}
              style={{ color: '#bfc4cd' }}
            />
          )}
        </div>
      ),
    },
    {
      title: '', width: 50, align: 'center',
      render: (_, __, i) => (
        <Popconfirm title="删除此变量？" onConfirm={() => removeVar(i)}>
          <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#bfc4cd' }} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      <Table
        dataSource={variables}
        columns={columns}
        rowKey={(_, i) => i}
        size="small"
        pagination={false}
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addVar} size="small">
          添加变量
        </Button>
        <Button icon={<UnorderedListOutlined />} onClick={openBulkEdit} size="small">
          批量编辑
        </Button>
      </div>

      {/* 批量编辑弹窗 */}
      <Modal
        title="批量编辑"
        open={bulkOpen}
        onOk={handleBulkConfirm}
        onCancel={() => setBulkOpen(false)}
        okText="确定"
        cancelText="取消"
        width={560}
      >
        <div style={{ fontSize: 13, color: '#8c919e', marginBottom: 10 }}>
          格式: <span style={{ color: '#555a65', fontFamily: 'monospace' }}>变量名,值</span>
        </div>
        <Input.TextArea
          value={bulkText}
          onChange={e => setBulkText(e.target.value)}
          rows={10}
          placeholder={'BASE_URL,https://staging.example.com\nDB_HOST,10.0.1.100\nAPI_KEY,sk-xxxx'}
          style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: 13 }}
        />
        <div style={{ fontSize: 12, color: '#6b7ef5', marginTop: 8 }}>
          数据格式遵循 CSV 规范，字段之间以英文逗号（,）分隔，多条记录以换行分隔
        </div>
      </Modal>
    </>
  )
}
