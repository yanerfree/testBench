import { Card, Tag, Space, Typography, Table, Alert } from 'antd'
import {
  ApiOutlined, ToolOutlined, LinkOutlined,
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
]

export default function MCPTools() {
  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`

  const columns = [
    { title: '工具名称', dataIndex: 'name', width: 200, render: (n) => <Text code style={{ fontSize: 13 }}>{n}</Text> },
    { title: '分类', dataIndex: 'category', width: 70, render: (c) => <Tag>{c}</Tag> },
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
          MCP (Model Context Protocol) 是 AI 读写平台数据的标准接口。Skill 执行时通过这些工具操作数据。
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
        </div>
      </Card>

      {/* 什么是 MCP */}
      <Alert
        type="info"
        showIcon
        closable
        message="MCP 是什么？"
        description={
          <div style={{ fontSize: 12, lineHeight: 2 }}>
            <b>MCP (Model Context Protocol)</b> 是 Anthropic 制定的 AI 工具调用标准协议。
            testBench 通过 MCP Server 将平台数据（用例、API 接口、环境变量等）暴露给 AI，
            AI 可以<b>读取</b>数据作为上下文，也可以<b>写入</b>数据（如创建用例）。<br/>
            <b>Web 引擎</b>在后端直接调用这些工具函数（进程内，无网络开销）；
            <b>Claude Code</b> 等外部客户端通过 HTTP 协议远程调用。
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      {/* 工具列表 */}
      <Table
        rowKey="name"
        columns={columns}
        dataSource={MCP_TOOLS}
        pagination={false}
        size="small"
        style={{ marginBottom: 24 }}
      />

      {/* 使用方式 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card size="small" title="Web 引擎（自动调用）">
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>用例管理页面点击「AI 生成用例」时，后端自动调用 MCP 工具收集上下文：</div>
            <div><Text code>tb_list_api_tree</Text> → 读取项目 API 接口</div>
            <div><Text code>tb_list_cases</Text> → 读取已有用例（去重）</div>
            <div><Text code>tb_create_case</Text> → 写入生成的用例</div>
            <div style={{ marginTop: 4, color: '#86909c' }}>用户无需关心，Skill 执行器自动编排调用</div>
          </div>
        </Card>
        <Card size="small" title="Claude Code（外部调用）">
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>在终端连接 MCP Server 后可直接使用：</div>
            <div>1. Claude Code 配置 MCP Server 地址</div>
            <div>2. 执行 <Text code>/tf-forge</Text> 调用 Skill</div>
            <div>3. AI 通过 MCP 协议读写平台数据</div>
            <div style={{ marginTop: 4, color: '#86909c' }}>适合需要结合本地代码的高级场景</div>
          </div>
        </Card>
      </div>
    </div>
  )
}
