import { Card, Tag, Space, Typography, Table, Alert, Button, message } from 'antd'
import {
  ApiOutlined, ToolOutlined, LinkOutlined, CopyOutlined, ThunderboltOutlined,
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

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

  const mcpConfig = JSON.stringify({
    mcpServers: {
      testbench: {
        url: mcpUrl,
        transport: "streamable-http",
        headers: {
          Authorization: "Bearer <你的MCP_API_KEY>"
        }
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
          MCP (Model Context Protocol) 是 AI 读写平台数据的标准接口。支持 Web 引擎和 Claude Code 两种调用方式。
        </span>
      </div>

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
            <b>步骤 3：</b>启动 Claude Code，输入如：
          </div>
          <div style={{ padding: '8px 16px', background: '#f6f8fa', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>
            为 POST /api/users 创建用户接口生成接口测试
          </div>
          <div style={{ marginTop: 8, color: '#86909c', fontSize: 12 }}>
            Claude Code 会读取项目源码，通过 MCP 工具调用 <Text code>tb_generate_api_test</Text> 生成测试场景到平台。
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
