import { useState, useEffect } from 'react'
import { Card, Tag, Space, Typography, Table, Button, message, Input, Modal, Popconfirm, Tabs, Badge, Statistic, Row, Col } from 'antd'
import {
  ApiOutlined, CopyOutlined, ThunderboltOutlined,
  KeyOutlined, PlusOutlined, DeleteOutlined, CheckCircleOutlined,
  ClockCircleOutlined, MinusCircleOutlined, RobotOutlined,
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

const CAT_COLORS = { 'AI 生成': 'magenta', '项目': 'geekblue', '用例': 'blue', 'API': 'green', '环境': 'orange', '接口测试': 'cyan', '报告': 'purple' }

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
    <div style={{ maxWidth: 1100 }}>
      {/* ── 页头 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: '#1d2129' }}>MCP 工具中心</h2>
          <Text type="secondary" style={{ fontSize: 13 }}>管理 Claude Code 连接，查看可用工具</Text>
        </div>
        <Space>
          <Badge count={onlineCount} size="small" offset={[-4, 4]} color="#52c41a">
            <Tag style={{ padding: '4px 12px', fontSize: 13 }}>{apiKeys.length} 个连接</Tag>
          </Badge>
          <Tag color="blue" style={{ padding: '4px 12px', fontSize: 13 }}>{MCP_TOOLS.length} 个工具</Tag>
        </Space>
      </div>

      {/* ── 概览卡片 ── */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="服务地址" value={mcpUrl} valueStyle={{ fontSize: 12, fontFamily: 'monospace' }}
              suffix={<CopyOutlined style={{ cursor: 'pointer', color: '#0ea5a0' }} onClick={() => copy(mcpUrl)} />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="在线连接" value={onlineCount} valueStyle={{ color: onlineCount > 0 ? '#52c41a' : '#bfc4cd' }}
              prefix={<CheckCircleOutlined />} suffix={`/ ${apiKeys.length}`} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="可用工具" value={MCP_TOOLS.length} valueStyle={{ color: '#0ea5a0' }}
              prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="协议" value="StreamableHTTP" valueStyle={{ fontSize: 13 }} />
          </Card>
        </Col>
      </Row>

      {/* ── 主体 Tab ── */}
      <Tabs defaultActiveKey="connections" items={[
        {
          key: 'connections',
          label: <span><KeyOutlined /> 连接管理 <Badge count={onlineCount} size="small" style={{ marginLeft: 4 }} /></span>,
          children: (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>每个 Claude Code 实例用独立的 API Key 连接。创建 Key 后按「配置指南」Tab 完成配置。</Text>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setCreateModalOpen(true); setNewKeyResult(null); setNewKeyName('') }}>创建 Key</Button>
              </div>

              {apiKeys.length > 0 ? apiKeys.map(k => {
                const lastUsed = k.lastUsedAt ? new Date(k.lastUsedAt) : null
                const isOnline = lastUsed && (Date.now() - lastUsed.getTime() < 30 * 60 * 1000)
                const isRecent = lastUsed && (Date.now() - lastUsed.getTime() < 24 * 60 * 60 * 1000)
                return (
                  <div key={k.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', marginBottom: 8, borderRadius: 10,
                    background: isOnline ? 'linear-gradient(135deg, rgba(82,196,26,0.04), rgba(82,196,26,0.01))' : 'rgba(0,0,0,0.015)',
                    border: `1px solid ${isOnline ? 'rgba(82,196,26,0.2)' : 'rgba(0,0,0,0.04)'}`,
                  }}>
                    <Space size={16}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#52c41a' : isRecent ? '#faad14' : '#d9d9d9' }} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text strong style={{ fontSize: 14 }}>{k.name}</Text>
                          <Text code style={{ fontSize: 11, color: '#8c919e' }}>{k.prefix}...</Text>
                          {isOnline && <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px' }}>在线</Tag>}
                          {!isOnline && isRecent && <Tag color="warning" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px' }}>最近活跃</Tag>}
                        </div>
                        {lastUsed && (
                          <Text type="secondary" style={{ fontSize: 11 }}>最近调用 {lastUsed.toLocaleString('zh-CN')}</Text>
                        )}
                        {!lastUsed && <Text type="secondary" style={{ fontSize: 11 }}>尚未使用</Text>}
                      </div>
                    </Space>
                    <Popconfirm title="吊销后该连接立即失效" onConfirm={() => revokeKey(k.id)} okText="吊销" cancelText="取消" okButtonProps={{ danger: true }}>
                      <Button size="small" danger type="text" icon={<DeleteOutlined />}>吊销</Button>
                    </Popconfirm>
                  </div>
                )
              }) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfc4cd' }}>
                  <KeyOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                  <div>还没有连接，点击「创建 Key」开始</div>
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
          label: <span><RobotOutlined /> 配置指南</span>,
          children: (
            <div style={{ maxWidth: 700 }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0ea5a0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>1</div>
                  <Text strong style={{ fontSize: 14 }}>创建 API Key</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 13, marginLeft: 32, display: 'block' }}>
                  在「连接管理」Tab 点击「创建 Key」，复制保存生成的密钥。
                </Text>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0ea5a0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>2</div>
                  <Text strong style={{ fontSize: 14 }}>配置 .mcp.json</Text>
                </div>
                <div style={{ marginLeft: 32, position: 'relative' }}>
                  <pre style={{ background: '#f6f8fa', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: '12px 16px', fontSize: 12, fontFamily: "'SF Mono', Monaco, monospace", overflow: 'auto' }}>
                    {mcpConfig}
                  </pre>
                  <Button size="small" icon={<CopyOutlined />} style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => copy(mcpConfig)}>复制</Button>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0ea5a0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>3</div>
                  <Text strong style={{ fontSize: 14 }}>在 Claude Code 中使用</Text>
                </div>
                <div style={{ marginLeft: 32, padding: '12px 16px', background: '#f6f8fa', borderRadius: 8, fontSize: 13, lineHeight: 2.2, fontFamily: 'monospace' }}>
                  <div style={{ color: '#86909c' }}>// 从需求文档生成手工测试用例</div>
                  <div>帮我为这份需求生成测试用例：用户可以登录系统...</div>
                  <div style={{ color: '#86909c', marginTop: 8 }}>// 查看生成结果</div>
                  <div>查看最近的测试用例生成任务进度</div>
                </div>
              </div>
            </div>
          ),
        },
      ]} />

      {/* 创建 Key 弹窗 */}
      <Modal title="创建 API Key" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} width={480}
        footer={newKeyResult ? [
          <Button key="close" type="primary" onClick={() => setCreateModalOpen(false)}>我已保存，关闭</Button>
        ] : [
          <Button key="cancel" onClick={() => setCreateModalOpen(false)}>取消</Button>,
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={createKey} loading={creating}>创建</Button>,
        ]}>
        {!newKeyResult ? (
          <div>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16, lineHeight: 1.8 }}>
              给这个连接取个名字（比如"小李的开发机"、"CI 流水线"），方便在连接管理中识别。
            </Text>
            <Input placeholder="连接名称" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} onPressEnter={createKey} size="large" />
          </div>
        ) : (
          <div>
            <div style={{ padding: '16px', background: '#f6ffed', borderRadius: 10, border: '1px solid #b7eb8f', marginBottom: 16, textAlign: 'center' }}>
              <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>创建成功</div>
              <Text type="secondary" style={{ fontSize: 12 }}>请立即复制，关闭后不再显示</Text>
            </div>
            <div style={{ padding: '12px 16px', background: '#f6f8fa', borderRadius: 8 }}>
              <Text code copyable style={{ fontSize: 13, wordBreak: 'break-all' }}>{newKeyResult.key}</Text>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
