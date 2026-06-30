import { useState, useEffect, useCallback, Fragment } from 'react'
import { Switch, Tag, Space, Typography, Button, message, Drawer, Input, Radio, Table, Pagination, Popconfirm } from 'antd'
import {
  ApiOutlined, PlayCircleOutlined, LoadingOutlined, EditOutlined,
  ReloadOutlined, ClearOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text } = Typography
const { TextArea } = Input
const MONO = "'SF Mono', Monaco, Menlo, Consolas, monospace"

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
  const [logs, setLogs] = useState([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [expandedLogId, setExpandedLogId] = useState(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/mcp-mock/config')
      setEnabled(res.data.enabled)
      setTools(res.data.tools || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchConfig(); fetchLogs() }, [fetchConfig])

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
      fetchLogs()
    } catch (e) {
      setCallResult({ error: e.message })
    } finally { setCalling(false) }
  }

  const fetchLogs = async (page) => {
    try {
      const p = page || logPage
      const params = new URLSearchParams({ limit: '50', offset: String((p - 1) * 50) })
      const r = await api.get(`/mcp-mock/logs?${params}`)
      const d = r.data || r
      setLogs(d.data || [])
      setLogsTotal(d.total ?? 0)
    } catch {}
  }

  const handleClearLogs = async () => {
    try { await api.delete('/mcp-mock/logs'); message.success('日志已清空'); setLogs([]); setLogsTotal(0); setLogPage(1) } catch {}
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', background: '#f0f2f5' }}>

      {/* ━━━ 顶栏 ━━━ */}
      <div style={{
        padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ApiOutlined style={{ fontSize: 18, color: '#722ed1' }} />
            <span style={{ fontWeight: 600, fontSize: 16 }}>MCP Mock</span>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '2px 10px', borderRadius: 12,
            background: enabled ? '#f6ffed' : '#f5f5f5',
            border: `1px solid ${enabled ? '#b7eb8f' : '#d9d9d9'}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: enabled ? '#52c41a' : '#bfbfbf' }} />
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: enabled ? '#389e0d' : '#999' }}>
              {enabled ? 'MOCK 模式' : '正常模式'}
            </span>
          </div>
          <Text code copyable style={{ fontSize: 12 }}>{mcpUrl}</Text>
        </div>
        <Switch checked={enabled} onChange={handleToggle} checkedChildren="Mock 开" unCheckedChildren="Mock 关" />
      </div>

      {/* ━━━ 主体 — 上下分区 ━━━ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#fff', margin: '0' }}>

        {/* 上：工具配置表格 */}
        <div style={{ flexShrink: 0, borderBottom: '1px solid #f0f0f0' }}>
          <Table rowKey="name" columns={columns} dataSource={tools} pagination={false} size="small"
            style={{ margin: '0' }} />
        </div>

        {/* 下：调用日志 — 占满剩余高度 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>调用日志 <Tag style={{ marginLeft: 4 }}>{logsTotal}</Tag></span>
            <Space size={4}>
              <Button icon={<ReloadOutlined />} size="small" type="text" onClick={() => fetchLogs()} />
              <Popconfirm title="确认清空？" onConfirm={handleClearLogs}>
                <Button icon={<ClearOutlined />} size="small" type="text" danger />
              </Popconfirm>
            </Space>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['时间', '工具', '来源', '模式', '状态', '耗时', ''].map((h, i) => (
                    <th key={h || 'op'} style={{
                      padding: '6px 10px', textAlign: i >= 5 ? 'right' : 'left',
                      fontWeight: 500, fontSize: 11, color: '#8c8c8c', borderBottom: '1px solid #f0f0f0',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <Fragment key={l.id}>
                    <tr onClick={() => setExpandedLogId(expandedLogId === l.id ? null : l.id)} style={{
                      cursor: 'pointer', borderBottom: '1px solid #fafafa',
                      background: expandedLogId === l.id ? '#e6f4ff' : 'transparent',
                    }}>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontSize: 11, color: '#8c8c8c' }}>
                        {new Date(l.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                      </td>
                      <td style={{ padding: '5px 10px' }}>
                        <Text code style={{ fontSize: 11 }}>{l.tool}</Text>
                      </td>
                      <td style={{ padding: '5px 10px' }}>
                        <Tag color={l.source === 'mock' ? 'orange' : 'green'} style={{ margin: 0, fontSize: 10 }}>{l.source}</Tag>
                      </td>
                      <td style={{ padding: '5px 10px', fontSize: 11, color: '#8c8c8c' }}>{l.mode}</td>
                      <td style={{ padding: '5px 10px' }}>
                        <Tag color={l.isError ? 'red' : 'green'} style={{ margin: 0, fontSize: 10 }}>{l.isError ? '失败' : '成功'}</Tag>
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{l.elapsedMs}ms</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                        <Button size="small" type="text" icon={<PlayCircleOutlined />} onClick={e => { e.stopPropagation(); openCall(l.tool) }} />
                      </td>
                    </tr>
                    {expandedLogId === l.id && (
                      <tr>
                        <td colSpan={7} style={{ padding: '10px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                          <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, fontWeight: 500 }}>请求参数</div>
                              <pre style={{
                                maxHeight: 120, overflow: 'auto', margin: 0, padding: 8, borderRadius: 4,
                                background: '#fff', border: '1px solid #f0f0f0', fontSize: 11, fontFamily: MONO,
                                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                              }}>{JSON.stringify(l.arguments, null, 2)}</pre>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, fontWeight: 500 }}>响应结果</div>
                              <pre style={{
                                maxHeight: 120, overflow: 'auto', margin: 0, padding: 8, borderRadius: 4,
                                background: '#fff', border: '1px solid #f0f0f0', fontSize: 11, fontFamily: MONO,
                                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                              }}>{(() => { try { return JSON.stringify(JSON.parse(l.response), null, 2) } catch { return l.response } })()}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#bfbfbf', fontSize: 12 }}>暂无调用日志</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {logsTotal > 50 && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', flexShrink: 0, textAlign: 'right' }}>
              <Pagination size="small" current={logPage} pageSize={50} total={logsTotal}
                showTotal={t => `共 ${t} 条`} showSizeChanger={false}
                onChange={p => { setLogPage(p); setExpandedLogId(null); fetchLogs(p) }} />
            </div>
          )}
        </div>
      </div>

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
