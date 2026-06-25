import { useState, useEffect, useCallback } from 'react'
import { Switch, Card, Tag, Space, Typography, Alert, Button, message, Drawer, Input, Radio, Table } from 'antd'
import {
  ApiOutlined, CheckCircleOutlined, CloseCircleOutlined,
  EyeOutlined, PlayCircleOutlined, LoadingOutlined, SettingOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text } = Typography
const { TextArea } = Input

export default function McpMock() {
  const [enabled, setEnabled] = useState(false)
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [editTool, setEditTool] = useState(null)
  const [editMode, setEditMode] = useState('success')
  const [editError, setEditError] = useState('')
  const [editCustom, setEditCustom] = useState('')
  const [callTool, setCallTool] = useState(null)
  const [callArgs, setCallArgs] = useState('{}')
  const [callResult, setCallResult] = useState(null)
  const [calling, setCalling] = useState(false)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/mcp-mock/config')
      setEnabled(res.data.enabled)
      setTools(res.data.tools || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const handleToggle = async (checked) => {
    try {
      await api.put('/mcp-mock/config', { enabled: checked })
      setEnabled(checked)
      message.success(checked ? 'MCP Mock 已开启' : 'MCP Mock 已关闭')
    } catch { /* */ }
  }

  const openEdit = (tool) => {
    setEditTool(tool.name)
    setEditMode(tool.mode)
    setEditError(tool.errorMessage || 'Mock error: tool call failed')
    setEditCustom('')
  }

  const handleSaveToolConfig = async () => {
    if (!editTool) return
    const body = { mode: editMode, error_message: editError }
    if (editMode === 'custom' && editCustom.trim()) {
      try { body.custom_data = JSON.parse(editCustom) } catch { message.error('自定义 JSON 格式错误'); return }
    }
    try {
      await api.put(`/mcp-mock/tools/${editTool}`, body)
      message.success(`${editTool} 配置已保存`)
      setEditTool(null)
      fetchConfig()
    } catch { /* */ }
  }

  const openCall = (toolName) => {
    setCallTool(toolName)
    setCallResult(null)
    setCallArgs(PARAM_HINTS[toolName] ? JSON.stringify(PARAM_HINTS[toolName], null, 2) : '{}')
  }

  const handleCall = async () => {
    if (!callTool) return
    setCalling(true)
    try {
      let args = {}
      try { args = JSON.parse(callArgs) } catch { message.error('参数 JSON 格式错误'); setCalling(false); return }
      const res = await api.post('/mcp-mock/call', { tool: callTool, arguments: args })
      setCallResult(res)
    } catch (e) {
      setCallResult({ error: e.message })
    } finally { setCalling(false) }
  }

  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`

  const modeTag = (mode) => {
    if (mode === 'success') return <Tag color="success">成功响应</Tag>
    if (mode === 'error') return <Tag color="error">失败响应</Tag>
    return <Tag color="blue">自定义</Tag>
  }

  const columns = [
    { title: '工具名称', dataIndex: 'name', width: 200, render: (n) => <Text code>{n}</Text> },
    { title: '说明', dataIndex: 'description' },
    {
      title: '响应模式',
      dataIndex: 'mode',
      width: 110,
      render: (m) => modeTag(m),
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<SettingOutlined />} onClick={() => openEdit(record)}>配置</Button>
          <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => openCall(record.name)}>调用</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>
          <ApiOutlined style={{ marginRight: 8 }} />
          MCP Mock
        </h2>
        <span style={{ fontSize: 13, color: '#86909c' }}>
          配置 MCP 工具的模拟响应。开启后外部 MCP 客户端调用工具时，按你的配置返回成功或失败。
        </span>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size="large">
            <div>
              <Text strong style={{ fontSize: 15 }}>MCP Mock 服务</Text>
              <div>
                {enabled
                  ? <Tag color="success" icon={<CheckCircleOutlined />}>已开启 — 工具按配置返回模拟响应</Tag>
                  : <Tag icon={<CloseCircleOutlined />}>已关闭 — 工具查询真实数据库</Tag>
                }
              </div>
            </div>
          </Space>
          <Switch checked={enabled} onChange={handleToggle} checkedChildren="Mock 开" unCheckedChildren="Mock 关" style={{ transform: 'scale(1.2)' }} />
        </div>
      </Card>

      <Card size="small" style={{ marginBottom: 16, background: '#f6f7f9' }}>
        <div style={{ fontSize: 13 }}>
          <Text strong>MCP Server 地址：</Text>
          <Text code copyable style={{ marginLeft: 8 }}>{mcpUrl}</Text>
          <Tag style={{ marginLeft: 8 }} color={enabled ? 'orange' : 'green'}>{enabled ? 'Mock 模式' : '正常模式'}</Tag>
          <br/>
          <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
            将此地址给到 MCP 客户端（Claude Code 等），开启 Mock 后客户端调用工具会收到你配置的响应。
            每个工具可独立设置"成功响应"、"失败响应"或"自定义数据"。
          </Text>
        </div>
      </Card>

      <Table rowKey="name" columns={columns} dataSource={tools} pagination={false} size="small" />

      {/* 配置抽屉 */}
      <Drawer
        title={<Space><SettingOutlined /> 配置响应 <Text code>{editTool}</Text></Space>}
        open={!!editTool}
        onClose={() => setEditTool(null)}
        width={520}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => setEditTool(null)} style={{ marginRight: 8 }}>取消</Button>
            <Button type="primary" onClick={handleSaveToolConfig}>保存配置</Button>
          </div>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>响应模式：</Text>
          <Radio.Group value={editMode} onChange={e => setEditMode(e.target.value)} style={{ marginLeft: 12 }}>
            <Radio.Button value="success">成功响应</Radio.Button>
            <Radio.Button value="error">失败响应</Radio.Button>
            <Radio.Button value="custom">自定义</Radio.Button>
          </Radio.Group>
        </div>

        {editMode === 'success' && (
          <Alert type="success" showIcon message="工具将返回预设的成功数据" description="使用系统内置的模拟数据，模拟正常调用结果" />
        )}

        {editMode === 'error' && (
          <div>
            <Alert type="error" showIcon message="工具将返回错误响应" style={{ marginBottom: 12 }} />
            <Text strong>错误信息：</Text>
            <Input value={editError} onChange={e => setEditError(e.target.value)} style={{ marginTop: 8 }} placeholder="Mock error message" />
          </div>
        )}

        {editMode === 'custom' && (
          <div>
            <Alert type="info" showIcon message="工具将返回你自定义的 JSON 数据" style={{ marginBottom: 12 }} />
            <Text strong>自定义响应 JSON：</Text>
            <TextArea rows={12} value={editCustom} onChange={e => setEditCustom(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 8 }}
              placeholder='{"key": "value", ...}' />
          </div>
        )}
      </Drawer>

      {/* 调用抽屉 */}
      <Drawer
        title={
          <Space>
            <PlayCircleOutlined />
            <span>调用工具</span>
            <Text code>{callTool}</Text>
            {enabled ? <Tag color="orange">Mock</Tag> : <Tag color="green">真实</Tag>}
          </Space>
        }
        open={!!callTool}
        onClose={() => { setCallTool(null); setCallResult(null) }}
        width={600}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong>请求参数 (JSON)：</Text>
          <TextArea rows={5} value={callArgs} onChange={e => setCallArgs(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13, marginTop: 8 }} />
        </div>
        <Button type="primary" icon={calling ? <LoadingOutlined /> : <PlayCircleOutlined />}
          loading={calling} onClick={handleCall} block size="large">
          发送调用
        </Button>
        {callResult && (
          <div style={{ marginTop: 16 }}>
            <Space style={{ marginBottom: 8 }}>
              <Text strong>返回结果：</Text>
              {callResult.source && <Tag color={callResult.source === 'mock' ? 'orange' : 'green'}>{callResult.source === 'mock' ? 'Mock' : '真实'}</Tag>}
              {callResult.mode && <Tag>{callResult.mode}</Tag>}
            </Space>
            <pre style={preStyle}>{JSON.stringify(callResult.data || callResult.error || callResult, null, 2)}</pre>
          </div>
        )}
      </Drawer>
    </div>
  )
}

const PARAM_HINTS = {
  tb_list_cases: { branch_id: "填入分支 UUID" },
  tb_get_case: { case_id: "填入用例 UUID" },
  tb_create_case: { branch_id: "分支UUID", title: "标题", module: "模块" },
  tb_get_folder_tree: { branch_id: "填入分支 UUID" },
  tb_list_api_tree: { project_id: "填入项目 UUID" },
  tb_get_api_node: { node_id: "填入 API 节点 UUID" },
  tb_list_environments: {},
  tb_get_merged_variables: { env_id: "填入环境 UUID" },
}

const preStyle = {
  background: '#1e1e1e', color: '#d4d4d4', padding: 16,
  borderRadius: 8, overflow: 'auto', fontSize: 12, lineHeight: 1.6,
  maxHeight: 'calc(100vh - 300px)',
}
