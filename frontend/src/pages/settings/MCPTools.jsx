import { useState, useEffect } from 'react'
import { Card, Tag, Space, Typography, Table, Button, message, Input, Modal, Popconfirm, Alert } from 'antd'
import {
  ApiOutlined, ToolOutlined, LinkOutlined, CopyOutlined, ThunderboltOutlined,
  KeyOutlined, PlusOutlined, DeleteOutlined, QuestionCircleOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text } = Typography

const MCP_TOOLS = [
  { name: 'tb_list_cases', description: '列出分支下的测试用例，支持分页和筛选', category: '用例', params: 'branch_id, page, page_size, keyword, folder_id, priority, case_type' },
  { name: 'tb_get_case', description: '获取单条测试用例的完整详情', category: '用例', params: 'case_id' },
  { name: 'tb_create_case', description: '创建测试用例，自动生成编号和目录', category: '用例', params: 'branch_id, title, module, case_type, priority, steps, ...' },
  { name: 'tb_get_folder_tree', description: '获取用例文件夹树形结构，含各层用例数', category: '用例', params: 'branch_id' },
  { name: 'tb_list_api_tree', description: '获取项目所有 API 接口的树形结构', category: 'API', params: 'project_id' },
  { name: 'tb_get_api_node', description: '获取 API 节点详情（method/url/headers/body）', category: 'API', params: 'node_id' },
  { name: 'tb_list_environments', description: '列出所有测试环境', category: '环境', params: '无' },
  { name: 'tb_get_merged_variables', description: '获取合并后的环境变量（全局+环境）', category: '环境', params: 'env_id' },
  { name: 'tb_generate_api_test', description: '根据接口定义 AI 生成接口测试场景', category: '接口测试', params: 'branch_id, api_info, folder_name' },
  { name: 'tb_list_api_tests', description: '列出接口测试场景', category: '接口测试', params: 'branch_id, folder_id, status' },
  { name: 'tb_get_api_test', description: '获取场景详情（含步骤/断言/变量）', category: '接口测试', params: 'scenario_id' },
  { name: 'tb_run_api_test', description: '执行接口测试场景并返回结果', category: '接口测试', params: 'scenario_ids' },
  { name: 'tb_get_report_summary', description: '获取测试报告摘要', category: '报告', params: 'plan_id, report_id' },
  { name: 'tb_get_failed_scenarios', description: '获取报告中失败的用例', category: '报告', params: 'plan_id, report_id' },
]

const CATEGORY_COLORS = {
  '用例': 'blue', 'API': 'green', '环境': 'orange', '接口测试': 'cyan', '报告': 'purple',
}

export default function MCPTools() {
  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`
  const [apiKeys, setApiKeys] = useState([])
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyResult, setNewKeyResult] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchKeys() }, [])

  const fetchKeys = async () => {
    try {
      const res = await api.get('/mcp-keys')
      setApiKeys(res.data || [])
    } catch { /* */ }
  }

  const createKey = async () => {
    setCreating(true)
    try {
      const res = await api.post('/mcp-keys', { name: newKeyName || 'default' })
      setNewKeyResult(res.data)
      setNewKeyName('')
      fetchKeys()
    } catch (e) {
      message.error(e.message || '创建失败')
    } finally { setCreating(false) }
  }

  const revokeKey = async (id) => {
    try {
      await api.delete(`/mcp-keys/${id}`)
      message.success('已吊销')
      fetchKeys()
    } catch { message.error('吊销失败') }
  }

  const mcpConfig = JSON.stringify({
    mcpServers: {
      testbench: {
        url: mcpUrl,
        transport: "streamable-http",
        ...(apiKeys.length > 0 ? { headers: { Authorization: `Bearer <你的API Key>` } } : {}),
      }
    }
  }, null, 2)

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'))
  }

  const columns = [
    { title: '工具名称', dataIndex: 'name', width: 220, render: (n) => <Text code style={{ fontSize: 12 }}>{n}</Text> },
    { title: '分类', dataIndex: 'category', width: 80, render: (c) => <Tag color={CATEGORY_COLORS[c]}>{c}</Tag> },
    { title: '说明', dataIndex: 'description' },
    { title: '参数', dataIndex: 'params', width: 260, render: (p) => <Text type="secondary" style={{ fontSize: 12 }}>{p}</Text> },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>
          <ApiOutlined style={{ marginRight: 8 }} />
          MCP 工具
        </h2>
        <span style={{ fontSize: 13, color: '#86909c' }}>
          连接 Claude Code 或 AI 引擎到测试平台，自动读写用例、生成接口测试、执行测试和查看报告。
        </span>
      </div>

      {/* 用途说明 */}
      <Alert
        type="info"
        showIcon
        icon={<QuestionCircleOutlined />}
        style={{ marginBottom: 16 }}
        message="MCP 工具可以做什么？"
        description={
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <b>Claude Code 连接后，可以在终端直接：</b>
            <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
              <li>输入 "为 POST /api/users 生成接口测试" → AI 自动生成测试场景到平台</li>
              <li>输入 "运行用户管理的所有测试" → 执行并返回结果</li>
              <li>输入 "查看最近的测试报告" → 获取通过率和失败详情</li>
            </ul>
            <b>配置方法：</b>按下方三个步骤操作即可。
          </div>
        }
      />

      {/* 连接信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, lineHeight: 2.2 }}>
          <div>
            <Text strong><LinkOutlined /> MCP Server 地址：</Text>
            <Text code copyable style={{ marginLeft: 8, fontSize: 14 }}>{mcpUrl}</Text>
          </div>
          <div>
            <Text strong><ToolOutlined /> 协议：</Text>
            <Text style={{ marginLeft: 8 }}>StreamableHTTP（兼容 MCP 2025-03-26 规范）</Text>
          </div>
          <div>
            <Text strong><ThunderboltOutlined /> 工具数量：</Text>
            <Text style={{ marginLeft: 8 }}>{MCP_TOOLS.length} 个</Text>
          </div>
        </div>
      </Card>

      {/* API Key 管理 */}
      <Card size="small" title={<span><KeyOutlined /> API Key 管理</span>}
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setCreateModalOpen(true); setNewKeyResult(null); setNewKeyName('') }}>创建 Key</Button>}
        style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, marginBottom: apiKeys.length > 0 ? 12 : 0, color: '#86909c' }}>
          外部工具（如 Claude Code）通过 API Key 认证后才能调用 MCP 工具。每个 Key 只在创建时显示一次，请妥善保管。
        </div>
        {apiKeys.length > 0 ? (
          <div>
            {apiKeys.map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 8, marginBottom: 4 }}>
                <Space size={12}>
                  <Text code style={{ fontSize: 13 }}>{k.prefix}...</Text>
                  <Text>{k.name}</Text>
                  {k.lastUsedAt && <Text type="secondary" style={{ fontSize: 11 }}>最近使用: {new Date(k.lastUsedAt).toLocaleDateString()}</Text>}
                </Space>
                <Popconfirm title="确认吊销此 Key？吊销后使用该 Key 的连接将立即失效。" onConfirm={() => revokeKey(k.id)} okText="吊销" cancelText="取消" okButtonProps={{ danger: true }}>
                  <Button size="small" danger type="text" icon={<DeleteOutlined />}>吊销</Button>
                </Popconfirm>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0', color: '#c9cdd4', fontSize: 13 }}>
            暂无 API Key，点击右上角创建
          </div>
        )}
      </Card>

      {/* 创建 Key 弹窗 */}
      <Modal
        title="创建 API Key"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={newKeyResult ? [
          <Button key="close" type="primary" onClick={() => setCreateModalOpen(false)}>我已保存，关闭</Button>
        ] : [
          <Button key="cancel" onClick={() => setCreateModalOpen(false)}>取消</Button>,
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={createKey} loading={creating}>创建</Button>,
        ]}
        width={500}
      >
        {!newKeyResult ? (
          <div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#595959', lineHeight: 1.8 }}>
              API Key 用于外部工具（如 Claude Code）连接本平台的 MCP Server。<br/>
              创建后将 Key 填入 <Text code>.mcp.json</Text> 的 <Text code>Authorization</Text> 字段即可。
            </div>
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 500 }}>Key 名称（方便识别用途）</div>
            <Input
              placeholder="例如：我的开发机、CI 流水线、团队共享"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onPressEnter={createKey}
            />
          </div>
        ) : (
          <div>
            <Alert type="success" showIcon message="API Key 创建成功" style={{ marginBottom: 16 }}
              description="请立即复制保存。关闭此弹窗后密钥将不再显示。" />
            <div style={{ padding: '12px 16px', background: '#f6f8fa', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4 }}>API Key</div>
              <Text code copyable style={{ fontSize: 14, wordBreak: 'break-all' }}>{newKeyResult.key}</Text>
            </div>
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fffbe6', borderRadius: 6, fontSize: 12, color: '#ad6800' }}>
              将此 Key 填入 .mcp.json 配置的 headers.Authorization 字段：<br/>
              <Text code>"Authorization": "Bearer {newKeyResult.key?.substring(0, 12)}..."</Text>
            </div>
          </div>
        )}
      </Modal>

      {/* Claude Code 连接配置 */}
      <Card size="small" title={<span><ThunderboltOutlined /> Claude Code 连接配置</span>} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div style={{ marginBottom: 12 }}>
            <b>步骤 1：</b>将以下配置合并到项目根目录的 <Text code>.mcp.json</Text> 文件中：
          </div>
          <div style={{ position: 'relative' }}>
            <pre style={{
              background: '#f6f8fa', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8,
              padding: '12px 16px', fontSize: 12, fontFamily: "'SF Mono', Monaco, Consolas, monospace",
              overflow: 'auto', maxHeight: 200,
            }}>
              {mcpConfig}
            </pre>
            <Button size="small" icon={<CopyOutlined />} style={{ position: 'absolute', top: 8, right: 8 }}
              onClick={() => copyToClipboard(mcpConfig)}>
              复制
            </Button>
          </div>

          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <b>步骤 2：</b>安装接口测试 Skill（可选，增强生成能力）：
          </div>
          <pre style={{
            background: '#f6f8fa', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8,
            padding: '8px 16px', fontSize: 12, fontFamily: 'monospace',
          }}>
{`# 在项目目录下执行
mkdir -p .claude/skills/tb-api-case-generate
curl -o .claude/skills/tb-api-case-generate/SKILL.md \\
  ${window.location.origin}/api/skills/preset/tb-api-case-generate/download`}
          </pre>

          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <b>步骤 3：</b>在 Claude Code 中直接输入：
          </div>
          <div style={{ padding: '12px 16px', background: '#f6f8fa', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
            <div style={{ color: '#86909c', marginBottom: 4 }}>// 方式 1：根据项目代码自动分析</div>
            <div style={{ marginBottom: 8 }}>为项目中的用户管理 API 生成接口测试</div>
            <div style={{ color: '#86909c', marginBottom: 4 }}>// 方式 2：指定具体接口</div>
            <div style={{ marginBottom: 8 }}>为 POST /api/users 创建用户接口生成接口测试，覆盖正向、参数校验、权限测试</div>
            <div style={{ color: '#86909c', marginBottom: 4 }}>// 方式 3：批量生成</div>
            <div>分析项目所有 API 接口，为每个接口生成完整的接口测试场景</div>
          </div>
        </div>
      </Card>

      {/* 工具列表 */}
      <Table
        rowKey="name"
        columns={columns}
        dataSource={MCP_TOOLS}
        pagination={false}
        size="small"
        style={{ marginBottom: 24 }}
      />
    </div>
  )
}
