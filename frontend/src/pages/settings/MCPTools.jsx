import { useState, useEffect } from 'react'
import { Card, Tag, Space, Typography, Table, Button, message, Input, Modal, Popconfirm, Tabs, Badge } from 'antd'
import {
  ApiOutlined, CopyOutlined, ThunderboltOutlined,
  KeyOutlined, PlusOutlined, DeleteOutlined, CheckCircleOutlined,
  RobotOutlined, LinkOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'
import { copyToClipboard } from '../../utils/clipboard'

const { Text } = Typography

const MCP_TOOLS = [
  { name: 'tb_create_scenario_task', description: '从需求文档自动生成手工测试用例', category: 'AI 生成', params: 'project_id, branch_id, title, content_markdown' },
  { name: 'tb_get_scenario_task', description: '查询生成任务状态与进度', category: 'AI 生成', params: 'task_id' },
  { name: 'tb_query_coverage_matrix', description: '查询需求覆盖矩阵', category: 'AI 生成', params: 'task_id, branch_id' },
  { name: 'tb_get_generation_stats', description: '查询生成质量统计', category: 'AI 生成', params: 'branch_id' },
  { name: 'tb_list_projects', description: '列出所有项目', category: '项目', params: '无' },
  { name: 'tb_list_branches', description: '列出项目分支', category: '项目', params: 'project_id' },
  { name: 'tb_list_cases', description: '列出测试用例', category: '用例', params: 'branch_id, keyword, ...' },
  { name: 'tb_get_case', description: '获取用例详情', category: '用例', params: 'case_id' },
  { name: 'tb_create_case', description: '创建测试用例', category: '用例', params: 'branch_id, title, steps, ...' },
  { name: 'tb_get_folder_tree', description: '获取用例文件夹树', category: '用例', params: 'branch_id' },
  { name: 'tb_list_api_tree', description: '获取 API 接口树', category: 'API', params: 'project_id' },
  { name: 'tb_get_api_node', description: '获取接口详情', category: 'API', params: 'node_id' },
  { name: 'tb_list_environments', description: '列出测试环境', category: '环境', params: '无' },
  { name: 'tb_get_merged_variables', description: '获取环境变量', category: '环境', params: 'env_id' },
  { name: 'tb_generate_api_test', description: '从接口生成测试场景', category: '接口测试', params: 'branch_id, api_info' },
  { name: 'tb_list_api_tests', description: '列出接口测试场景', category: '接口测试', params: 'branch_id' },
  { name: 'tb_get_api_test', description: '获取场景详情', category: '接口测试', params: 'scenario_id' },
  { name: 'tb_run_api_test', description: '执行接口测试', category: '接口测试', params: 'scenario_ids' },
  { name: 'tb_get_report_summary', description: '获取报告摘要', category: '报告', params: 'plan_id' },
  { name: 'tb_get_failed_scenarios', description: '获取失败用例', category: '报告', params: 'plan_id' },
]

const CAT_COLORS = { 'AI 生成': 'magenta', '项目': 'geekblue', '用例': 'blue', 'API': 'cyan', '环境': 'orange', '接口测试': 'cyan', '报告': 'purple' }

const cardStyle = { borderRadius: 12, border: '1px solid rgba(0,0,0,0.04)', boxShadow: 'none' }
const sectionTitle = { fontSize: 14, fontWeight: 600, color: '#2e3138', marginBottom: 4 }

export default function MCPTools() {
  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`
  const [apiKeys, setApiKeys] = useState([])
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyResult, setNewKeyResult] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchKeys() }, [])
  const fetchKeys = async () => { try { setApiKeys((await api.get('/mcp-keys')).data || []) } catch {} }
  const createKey = async () => {
    setCreating(true)
    try { setNewKeyResult((await api.post('/mcp-keys', { name: newKeyName || 'default' })).data); setNewKeyName(''); fetchKeys() }
    catch (e) { message.error(e.message || '创建失败') } finally { setCreating(false) }
  }
  const revokeKey = async (id) => { try { await api.delete(`/mcp-keys/${id}`); message.success('已吊销'); fetchKeys() } catch { message.error('吊销失败') } }
  const copy = (text) => copyToClipboard(text).then(() => message.success('已复制'))

  const onlineCount = apiKeys.filter(k => k.lastUsedAt && Date.now() - new Date(k.lastUsedAt).getTime() < 30 * 60 * 1000).length
  const mcpConfig = JSON.stringify({ mcpServers: { testbench: { type: "streamable-http", url: mcpUrl, headers: { Authorization: "Bearer <你的API Key>" } } } }, null, 2)

  return (
    <div style={{ maxWidth: 960 }}>
      {/* ── 页头 ── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px', color: '#1d2129' }}>
          <LinkOutlined style={{ marginRight: 8, color: '#0ea5a0' }} />MCP 工具中心
        </h2>
        <Text type="secondary" style={{ fontSize: 13 }}>管理 Claude Code 与平台的连接，查看可用的 AI 工具</Text>
      </div>

      {/* ── 服务地址（独立突出） ── */}
      <Card size="small" style={{ ...cardStyle, marginBottom: 16, borderLeft: '3px solid #0ea5a0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, color: '#8c919e', marginBottom: 2 }}>MCP 服务地址</div>
            <span style={{ fontSize: 16, fontFamily: "'SF Mono', Monaco, Consolas, monospace", fontWeight: 500, color: '#2e3138', letterSpacing: 0.3 }}>
              {mcpUrl}
            </span>
          </div>
          <Space size={16}>
            <Button size="small" icon={<CopyOutlined />} onClick={() => copy(mcpUrl)}>复制地址</Button>
            <Space split={<span style={{ color: '#e0e0e3' }}>|</span>}>
              <Text type="secondary" style={{ fontSize: 12 }}>{onlineCount}/{apiKeys.length} 在线</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{MCP_TOOLS.length} 个工具</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>StreamableHTTP</Text>
            </Space>
          </Space>
        </div>
      </Card>

      {/* ── 主体 Tab ── */}
      <Tabs defaultActiveKey="connections" items={[
        {
          key: 'connections',
          label: <span><KeyOutlined /> 连接管理 {onlineCount > 0 && <Badge count={onlineCount} size="small" style={{ marginLeft: 4 }} />}</span>,
          children: (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>每个 Claude Code 用独立 API Key 连接。创建后按「配置指南」完成配置。</Text>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateModalOpen(true); setNewKeyResult(null); setNewKeyName('') }}>创建 Key</Button>
              </div>

              {apiKeys.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {apiKeys.map(k => {
                    const lastUsed = k.lastUsedAt ? new Date(k.lastUsedAt) : null
                    const isOnline = lastUsed && (Date.now() - lastUsed.getTime() < 30 * 60 * 1000)
                    const isRecent = lastUsed && (Date.now() - lastUsed.getTime() < 24 * 60 * 60 * 1000)
                    return (
                      <Card key={k.id} size="small" style={{
                        ...cardStyle,
                        borderLeft: `3px solid ${isOnline ? '#0ea5a0' : isRecent ? '#faad14' : '#e8e8e8'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 12,
                              background: isOnline ? 'rgba(14,165,160,0.08)' : isRecent ? 'rgba(250,173,20,0.08)' : 'rgba(0,0,0,0.03)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <RobotOutlined style={{ fontSize: 18, color: isOnline ? '#0ea5a0' : isRecent ? '#faad14' : '#bfc4cd' }} />
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#2e3138' }}>{k.name}</span>
                                <Text code style={{ fontSize: 11, color: '#8c919e' }}>{k.prefix}...</Text>
                                {isOnline && <Tag color="cyan" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', margin: 0 }}>在线</Tag>}
                                {!isOnline && isRecent && <Tag color="warning" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', margin: 0 }}>最近活跃</Tag>}
                              </div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {lastUsed ? `最近调用 ${lastUsed.toLocaleString('zh-CN')}` : '尚未使用'}
                              </Text>
                            </div>
                          </div>
                          <Popconfirm title="吊销后该连接立即失效" onConfirm={() => revokeKey(k.id)} okText="吊销" cancelText="取消" okButtonProps={{ danger: true }}>
                            <Button size="small" danger type="text" icon={<DeleteOutlined />}>吊销</Button>
                          </Popconfirm>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#bfc4cd' }}>
                  <RobotOutlined style={{ fontSize: 36, marginBottom: 12 }} />
                  <div style={{ fontSize: 14 }}>还没有连接</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>点击「创建 Key」添加 Claude Code 连接</div>
                </div>
              )}
            </div>
          ),
        },
        {
          key: 'tools',
          label: <span><ThunderboltOutlined /> 工具列表 ({MCP_TOOLS.length})</span>,
          children: (
            <Table rowKey="name" dataSource={MCP_TOOLS} pagination={false} size="small"
              columns={[
                { title: '工具', dataIndex: 'name', width: 220, render: n => <Text code style={{ fontSize: 11 }}>{n}</Text> },
                { title: '分类', dataIndex: 'category', width: 80, render: c => <Tag color={CAT_COLORS[c]} style={{ fontSize: 11 }}>{c}</Tag> },
                { title: '说明', dataIndex: 'description', render: d => <span style={{ fontSize: 13 }}>{d}</span> },
                { title: '参数', dataIndex: 'params', width: 240, render: p => <Text type="secondary" style={{ fontSize: 11 }}>{p}</Text> },
              ]}
            />
          ),
        },
        {
          key: 'guide',
          label: <span><ApiOutlined /> 配置指南</span>,
          children: (
            <div style={{ maxWidth: 680 }}>
              {[
                { num: '1', title: '创建 API Key', desc: '在「连接管理」Tab 点击「创建 Key」，复制保存密钥。' },
                { num: '2', title: '添加 .mcp.json 配置', desc: '将以下内容合并到项目根目录的 .mcp.json 文件：', code: mcpConfig },
                { num: '3', title: '在 Claude Code 中使用', desc: '重启 Claude Code，然后直接用自然语言：', examples: [
                  { hint: '从需求文档生成手工测试用例', cmd: '帮我为这份需求生成测试用例：用户可以登录系统...' },
                  { hint: '查看生成进度', cmd: '查看最近的测试用例生成任务' },
                ] },
              ].map((step) => (
                <div key={step.num} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #0ea5a0, #7cacf8)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 600,
                    }}>{step.num}</div>
                    <span style={sectionTitle}>{step.title}</span>
                  </div>
                  <div style={{ marginLeft: 38 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>{step.desc}</Text>
                    {step.code && (
                      <div style={{ position: 'relative', marginTop: 8 }}>
                        <pre style={{
                          background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)',
                          borderRadius: 12, padding: '14px 18px', fontSize: 12,
                          fontFamily: "'SF Mono', Monaco, monospace", overflow: 'auto', lineHeight: 1.6,
                        }}>{step.code}</pre>
                        <Button size="small" icon={<CopyOutlined />} style={{ position: 'absolute', top: 10, right: 10 }}
                          onClick={() => copy(step.code)}>复制</Button>
                      </div>
                    )}
                    {step.examples && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {step.examples.map((ex, i) => (
                          <Card key={i} size="small" style={{ ...cardStyle, borderLeft: '3px solid #7cacf8' }}>
                            <div style={{ fontSize: 11, color: '#8c919e', marginBottom: 2 }}>{ex.hint}</div>
                            <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{ex.cmd}</div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ),
        },
      ]} />

      {/* 创建 Key 弹窗 */}
      <Modal title="创建连接" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} width={460}
        footer={newKeyResult ? [
          <Button key="close" type="primary" onClick={() => setCreateModalOpen(false)}>我已保存，关闭</Button>
        ] : [
          <Button key="cancel" onClick={() => setCreateModalOpen(false)}>取消</Button>,
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={createKey} loading={creating}>创建</Button>,
        ]}>
        {!newKeyResult ? (
          <div>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
              给这个连接取个名字，方便识别是谁的 Claude Code。
            </Text>
            <Input placeholder="如：小李的开发机、CI 流水线" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} onPressEnter={createKey} size="large" />
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', padding: '20px 0 16px', marginBottom: 16, background: 'rgba(14,165,160,0.04)', borderRadius: 12 }}>
              <CheckCircleOutlined style={{ fontSize: 28, color: '#0ea5a0', marginBottom: 8 }} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>创建成功</div>
              <Text type="secondary" style={{ fontSize: 12 }}>请立即复制密钥，关闭后不再显示</Text>
            </div>
            <Card size="small" style={cardStyle}>
              <Text code copyable style={{ fontSize: 13, wordBreak: 'break-all' }}>{newKeyResult.key}</Text>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  )
}
