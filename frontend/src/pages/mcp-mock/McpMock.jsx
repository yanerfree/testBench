import { useState, useEffect, useCallback, Fragment } from 'react'
import {
  Switch, Tag, Space, Typography, Button, message, Drawer, Input, Radio,
  Pagination, Popconfirm
} from 'antd'
import {
  ApiOutlined, PlayCircleOutlined, LoadingOutlined, EditOutlined,
  ReloadOutlined, ClearOutlined, CopyOutlined
} from '@ant-design/icons'
import { api } from '../../utils/request'
import { copyToClipboard } from '../../utils/clipboard'

const { Text } = Typography
const { TextArea } = Input
const MONO = "'SF Mono', Monaco, Menlo, Consolas, monospace"

const MODE_LABEL = { success: '成功', error: '失败', custom: '自定义', real: '真实' }
const MODE_COLOR = { success: '#0ea5a0', error: '#e8453c', custom: '#4e8af0' }

export default function McpMock() {
  const [enabled, setEnabled] = useState(false)
  const [tools, setTools] = useState([])
  const [editTool, setEditTool] = useState(null)
  const [editCustom, setEditCustom] = useState('')
  const [editIsError, setEditIsError] = useState(false)
  const [callTool, setCallTool] = useState(null)
  const [callArgs, setCallArgs] = useState('{}')
  const [callResult, setCallResult] = useState(null)
  const [calling, setCalling] = useState(false)
  const [activeTab, setActiveTab] = useState('config')
  const [logs, setLogs] = useState([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [expandedLogId, setExpandedLogId] = useState(null)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/mcp-mock/config')
      setEnabled(res.data.enabled)
      setTools(res.data.tools || [])
    } catch {}
  }, [])

  useEffect(() => { fetchConfig(); fetchLogs() }, [fetchConfig])

  const handleToggle = async (checked) => {
    try {
      await api.put('/mcp-mock/config', { enabled: checked })
      setEnabled(checked)
      message.success(checked ? 'MCP Mock 已开启' : 'MCP Mock 已关闭')
    } catch {}
  }

  const handleModeSwitch = async (toolName, mode) => {
    if (mode === 'custom') { setEditTool(toolName); setEditCustom(''); setEditIsError(false); return }
    try {
      await api.put(`/mcp-mock/tools/${toolName}`, { mode })
      message.success(`${toolName} → ${MODE_LABEL[mode]}`)
      fetchConfig()
    } catch {}
  }

  const handleSaveCustom = async () => {
    if (!editTool) return
    let customData = null
    if (editCustom.trim()) {
      try { customData = JSON.parse(editCustom) } catch { message.error('JSON 格式错误'); return }
    }
    try {
      await api.put(`/mcp-mock/tools/${editTool}`, { mode: 'custom', custom_data: customData, custom_is_error: editIsError })
      message.success('自定义配置已保存')
      setEditTool(null)
      fetchConfig()
    } catch {}
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
    } catch (e) { setCallResult({ error: e.message }) } finally { setCalling(false) }
  }

  const fetchLogs = async (page) => {
    try {
      const p = page || logPage
      const r = await api.get(`/mcp-mock/logs?limit=50&offset=${(p - 1) * 50}`)
      const d = r.data || r
      setLogs(d.data || [])
      setLogsTotal(d.total ?? 0)
    } catch {}
  }

  const handleClearLogs = async () => {
    try { await api.delete('/mcp-mock/logs'); message.success('日志已清空'); setLogs([]); setLogsTotal(0); setLogPage(1) } catch {}
  }

  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', background: '#f8f9fb' }}>

      {/* ━━━ 顶栏 ━━━ */}
      <div style={{
        padding: '10px 20px', background: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ApiOutlined style={{ fontSize: 18, color: '#7c5cbf' }} />
            <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: 0.5 }}>MCP Mock</span>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '2px 10px', borderRadius: 12,
            background: enabled ? '#e0f7f6' : '#f5f5f5',
            border: `1px solid ${enabled ? 'rgba(14,165,160,0.3)' : '#d9d9d9'}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: enabled ? '#0ea5a0' : '#bfbfbf' }} />
            <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: enabled ? '#389e0d' : '#999' }}>
              {enabled ? 'LIVE' : 'STOPPED'}
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{tools.length} 个工具</span>
        </div>
        <Space size={12}>
          <Button size="small" icon={<CopyOutlined />} onClick={() => {
            copyToClipboard(mcpUrl).then(() => message.success('已复制 MCP 地址'))
          }}>复制地址</Button>
          <Switch checked={enabled} onChange={handleToggle} checkedChildren="启用" unCheckedChildren="停用" />
        </Space>
      </div>

      {/* ━━━ 主体 ━━━ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(255,255,255,0.3)' }}>

        {/* Tab 栏 */}
        <div style={{ borderBottom: '1px solid rgba(0,0,0,0.04)', paddingLeft: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {[
              { key: 'config', label: `工具配置 (${tools.length})` },
              { key: 'logs', label: <>调用日志 <Tag style={{ margin: '0 0 0 4px', fontSize: 11, borderRadius: 10, lineHeight: '18px', padding: '0 6px' }}>{logsTotal}</Tag></> },
            ].map(t => (
              <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
                padding: '10px 16px', cursor: 'pointer', fontSize: 14, position: 'relative',
                color: activeTab === t.key ? '#7c5cbf' : '#595959',
                fontWeight: activeTab === t.key ? 600 : 400,
              }}>
                {t.label}
                {activeTab === t.key && <div style={{
                  position: 'absolute', bottom: 0, left: 16, right: 16, height: 2,
                  background: 'rgba(124,92,191,0.12)', color: '#7c5cbf', borderRadius: 4,
                }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Tab 内容 */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {activeTab === 'config' ? (
            /* ─── 工具配置 Tab ─── */
            <div style={{ height: '100%', overflow: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                    {['工具名称', '说明', '响应模式', ''].map((h, i) => (
                      <th key={h || 'op'} style={{
                        padding: '8px 16px', textAlign: 'left',
                        fontWeight: 500, fontSize: 12, color: '#8c8c8c', borderBottom: '1px solid rgba(0,0,0,0.04)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tools.map(t => (
                    <tr key={t.name} style={{ borderBottom: '1px solid #fafafa' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <Text code style={{ fontSize: 12 }}>{t.name}</Text>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#595959' }}>{t.description}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <Radio.Group size="small" value={t.mode}
                          onChange={e => handleModeSwitch(t.name, e.target.value)}>
                          <Radio value="success"><span style={{ color: '#0ea5a0' }}>成功</span></Radio>
                          <Radio value="error"><span style={{ color: '#e8453c' }}>失败</span></Radio>
                          <Radio value="custom"><span style={{ color: '#4e8af0' }}>自定义</span></Radio>
                        </Radio.Group>
                        {t.mode === 'custom' && (
                          <Button type="link" size="small" icon={<EditOutlined />} style={{ padding: 0, fontSize: 12 }}
                            onClick={() => { setEditTool(t.name); setEditCustom(''); setEditIsError(false) }}>编辑</Button>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <Button size="small" type="link" icon={<PlayCircleOutlined />}
                          onClick={() => openCall(t.name)}>调用</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* ─── 调用日志 Tab ─── */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                padding: '8px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)', flexShrink: 0,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>共 {logsTotal} 条</span>
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
                    <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                      {['时间', '工具', '来源', '模式', '状态', '耗时', ''].map((h, i) => (
                        <th key={h || 'op'} style={{
                          padding: '6px 10px', textAlign: i >= 5 ? 'right' : 'left',
                          fontWeight: 500, fontSize: 11, color: '#8c8c8c', borderBottom: '1px solid rgba(0,0,0,0.04)',
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
                          <td style={{ padding: '5px 10px', fontSize: 11, color: '#8c8c8c' }}>{MODE_LABEL[l.mode] || l.mode}</td>
                          <td style={{ padding: '5px 10px' }}>
                            <Tag color={l.isError ? 'red' : 'green'} style={{ margin: 0, fontSize: 10 }}>{l.isError ? '失败' : '成功'}</Tag>
                          </td>
                          <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{l.elapsedMs}ms</td>
                          <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                            <Button size="small" type="text" icon={<PlayCircleOutlined />}
                              onClick={e => { e.stopPropagation(); openCall(l.tool) }} />
                          </td>
                        </tr>
                        {expandedLogId === l.id && (
                          <tr>
                            <td colSpan={7} style={{ padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                              <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, fontWeight: 500 }}>请求参数</div>
                                  <pre style={{
                                    maxHeight: 120, overflow: 'auto', margin: 0, padding: 8, borderRadius: 12,
                                    background: 'rgba(255,255,255,0.3)', border: '1px solid rgba(0,0,0,0.04)', fontSize: 11, fontFamily: MONO,
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                  }}>{JSON.stringify(l.arguments, null, 2)}</pre>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, fontWeight: 500 }}>响应结果</div>
                                  <pre style={{
                                    maxHeight: 120, overflow: 'auto', margin: 0, padding: 8, borderRadius: 12,
                                    background: 'rgba(255,255,255,0.3)', border: '1px solid rgba(0,0,0,0.04)', fontSize: 11, fontFamily: MONO,
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
          )}
        </div>
      </div>

      {/* 自定义编辑抽屉 */}
      <Drawer title={<Space><EditOutlined /> 自定义响应 <Text code>{editTool}</Text></Space>}
        open={!!editTool} onClose={() => setEditTool(null)} width={520}
        footer={<div style={{ textAlign: 'right' }}>
          <Button onClick={() => setEditTool(null)} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" onClick={handleSaveCustom}>保存</Button>
        </div>}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>MCP 响应状态：</Text>
          <Radio.Group value={editIsError} onChange={e => setEditIsError(e.target.value)} style={{ marginLeft: 12 }}>
            <Radio value={false}><Tag color="success">isError: false</Tag></Radio>
            <Radio value={true}><Tag color="error">isError: true</Tag></Radio>
          </Radio.Group>
        </div>
        <div>
          <Text strong>响应体 JSON：</Text>
          <div style={{ fontSize: 12, color: '#86909c', marginBottom: 8 }}>留空则使用系统默认模拟数据</div>
          <TextArea rows={14} value={editCustom} onChange={e => setEditCustom(e.target.value)}
            style={{ fontFamily: MONO, fontSize: 12 }} placeholder='{"cases": [...], "total": 5}' />
        </div>
      </Drawer>

      {/* 调用抽屉 */}
      <Drawer
        title={<Space><PlayCircleOutlined /> 调用 <Text code>{callTool}</Text>
          {enabled ? <Tag color="orange">Mock</Tag> : <Tag color="green">真实</Tag>}
        </Space>}
        open={!!callTool} onClose={() => { setCallTool(null); setCallResult(null) }} width={600}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong>参数 (JSON)：</Text>
          <TextArea rows={5} value={callArgs} onChange={e => setCallArgs(e.target.value)}
            style={{ fontFamily: MONO, fontSize: 13, marginTop: 8 }} />
        </div>
        <Button type="primary" icon={calling ? <LoadingOutlined /> : <PlayCircleOutlined />}
          loading={calling} onClick={handleCall} block size="large">发送</Button>
        {callResult && (
          <div style={{ marginTop: 16 }}>
            <Space style={{ marginBottom: 8 }}>
              <Text strong>结果：</Text>
              {callResult.source && <Tag color={callResult.source === 'mock' ? 'orange' : 'green'}>{callResult.source === 'mock' ? 'Mock' : '真实'}</Tag>}
            </Space>
            <pre style={{
              background: '#1e1e2e', color: '#cdd6f4', padding: 16, borderRadius: 12,
              overflow: 'auto', fontSize: 12, lineHeight: 1.6, maxHeight: 'calc(100vh - 350px)',
              fontFamily: MONO, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>{JSON.stringify(callResult.data || callResult.error || callResult, null, 2)}</pre>
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
