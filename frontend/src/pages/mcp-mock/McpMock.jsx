import { useState, useEffect, useCallback } from 'react'
import { Switch, Card, Tag, Space, Typography, Button, message, Drawer, Input, Radio, Table } from 'antd'
import {
  ApiOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlayCircleOutlined, LoadingOutlined, EditOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text } = Typography
const { TextArea } = Input

export default function McpMock() {
  const [enabled, setEnabled] = useState(false)
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [editTool, setEditTool] = useState(null)
  const [editCustom, setEditCustom] = useState('')
  const [editIsError, setEditIsError] = useState(false)
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

  // 直接在行内切换成功/失败
  const handleModeSwitch = async (toolName, mode) => {
    try {
      await api.put(`/mcp-mock/tools/${toolName}`, { mode })
      message.success(`${toolName} → ${mode === 'success' ? '成功' : mode === 'error' ? '失败' : '自定义'}`)
      fetchConfig()
    } catch { /* */ }
  }

  // 打开自定义抽屉
  const openCustomEdit = (toolName) => {
    setEditTool(toolName)
    setEditCustom('')
    setEditIsError(false)
  }

  const handleSaveCustom = async () => {
    if (!editTool) return
    let customData = null
    if (editCustom.trim()) {
      try { customData = JSON.parse(editCustom) } catch { message.error('JSON 格式错误'); return }
    }
    try {
      await api.put(`/mcp-mock/tools/${editTool}`, {
        mode: 'custom',
        custom_data: customData,
        custom_is_error: editIsError,
      })
      message.success(`${editTool} 自定义配置已保存`)
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

  const columns = [
    { title: '工具名称', dataIndex: 'name', width: 200, render: (n) => <Text code>{n}</Text> },
    { title: '说明', dataIndex: 'description' },
    {
      title: '响应',
      width: 260,
      render: (_, record) => (
        <Radio.Group
          size="small"
          value={record.mode}
          buttonStyle="solid"
          onChange={(e) => {
            const val = e.target.value
            if (val === 'custom') {
              openCustomEdit(record.name)
            } else {
              handleModeSwitch(record.name, val)
            }
          }}
        >
          <Radio.Button value="success" style={record.mode === 'success' ? { background: '#52c41a', borderColor: '#52c41a', color: '#fff' } : {}}>
            成功
          </Radio.Button>
          <Radio.Button value="error" style={record.mode === 'error' ? { background: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff' } : {}}>
            失败
          </Radio.Button>
          <Radio.Button value="custom" style={record.mode === 'custom' ? { background: '#1677ff', borderColor: '#1677ff', color: '#fff' } : {}}>
            自定义
          </Radio.Button>
        </Radio.Group>
      ),
    },
    {
      title: '',
      width: 80,
      render: (_, record) => (
        <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => openCall(record.name)}>
          调用
        </Button>
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
          <div>
            <Text strong style={{ fontSize: 15 }}>MCP Mock 服务</Text>
            <div>
              {enabled
                ? <Tag color="success" icon={<CheckCircleOutlined />}>已开启 — 按下方配置返回响应</Tag>
                : <Tag icon={<CloseCircleOutlined />}>已关闭 — 查询真实数据库</Tag>
              }
            </div>
          </div>
          <Switch checked={enabled} onChange={handleToggle} checkedChildren="Mock 开" unCheckedChildren="Mock 关" style={{ transform: 'scale(1.2)' }} />
        </div>
      </Card>

      <Card size="small" style={{ marginBottom: 16, background: '#f6f7f9' }}>
        <div style={{ fontSize: 13 }}>
          <Text strong>MCP Server 地址：</Text>
          <Text code copyable style={{ marginLeft: 8 }}>{mcpUrl}</Text>
          <Tag style={{ marginLeft: 8 }} color={enabled ? 'orange' : 'green'}>{enabled ? 'Mock' : '正常'}</Tag>
          <div style={{ marginTop: 4, color: '#86909c' }}>
            每行直接切换<b>成功</b>/<b>失败</b>，需要自定义响应体时点<b>自定义</b>打开编辑。
            MCP 协议标准格式：成功 → <Text code>isError:false</Text>，失败 → <Text code>isError:true</Text>
          </div>
        </div>
      </Card>

      <Table rowKey="name" columns={columns} dataSource={tools} pagination={false} size="small" />

      {/* 自定义编辑抽屉 */}
      <Drawer
        title={<Space><EditOutlined /> 自定义响应 <Text code>{editTool}</Text></Space>}
        open={!!editTool}
        onClose={() => setEditTool(null)}
        width={520}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => setEditTool(null)} style={{ marginRight: 8 }}>取消</Button>
            <Button type="primary" onClick={handleSaveCustom}>保存</Button>
          </div>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>MCP 响应状态：</Text>
          <Radio.Group value={editIsError} onChange={e => setEditIsError(e.target.value)} style={{ marginLeft: 12 }}>
            <Radio value={false}><Tag color="success">isError: false（成功）</Tag></Radio>
            <Radio value={true}><Tag color="error">isError: true（失败）</Tag></Radio>
          </Radio.Group>
        </div>
        <div>
          <Text strong>响应体 JSON：</Text>
          <div style={{ fontSize: 12, color: '#86909c', marginBottom: 8 }}>留空则使用系统默认模拟数据</div>
          <TextArea rows={14} value={editCustom} onChange={e => setEditCustom(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
            placeholder='{"cases": [...], "total": 5}' />
        </div>
      </Drawer>

      {/* 调用抽屉 */}
      <Drawer
        title={
          <Space>
            <PlayCircleOutlined />
            <span>调用</span>
            <Text code>{callTool}</Text>
            {enabled ? <Tag color="orange">Mock</Tag> : <Tag color="green">真实</Tag>}
          </Space>
        }
        open={!!callTool}
        onClose={() => { setCallTool(null); setCallResult(null) }}
        width={600}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong>参数 (JSON)：</Text>
          <TextArea rows={5} value={callArgs} onChange={e => setCallArgs(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 13, marginTop: 8 }} />
        </div>
        <Button type="primary" icon={calling ? <LoadingOutlined /> : <PlayCircleOutlined />}
          loading={calling} onClick={handleCall} block size="large">
          发送
        </Button>
        {callResult && (
          <div style={{ marginTop: 16 }}>
            <Space style={{ marginBottom: 8 }}>
              <Text strong>结果：</Text>
              {callResult.source && <Tag color={callResult.source === 'mock' ? 'orange' : 'green'}>{callResult.source === 'mock' ? 'Mock' : '真实'}</Tag>}
            </Space>
            <pre style={preStyle}>{JSON.stringify(callResult.data || callResult.error || callResult, null, 2)}</pre>
          </div>
        )}
      </Drawer>
    </div>
  )
}

const PARAM_HINTS = {
  tb_list_cases: { branch_id: "分支 UUID" },
  tb_get_case: { case_id: "用例 UUID" },
  tb_create_case: { branch_id: "分支UUID", title: "标题", module: "模块" },
  tb_get_folder_tree: { branch_id: "分支 UUID" },
  tb_list_api_tree: { project_id: "项目 UUID" },
  tb_get_api_node: { node_id: "节点 UUID" },
  tb_list_environments: {},
  tb_get_merged_variables: { env_id: "环境 UUID" },
}

const preStyle = {
  background: '#1e1e1e', color: '#d4d4d4', padding: 16,
  borderRadius: 8, overflow: 'auto', fontSize: 12, lineHeight: 1.6,
  maxHeight: 'calc(100vh - 300px)',
}
