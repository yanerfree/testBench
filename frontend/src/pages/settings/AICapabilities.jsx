import { useState, useEffect } from 'react'
import { Card, Tag, Space, Typography, Divider, Table, Badge, Tooltip } from 'antd'
import {
  RobotOutlined, ApiOutlined, ThunderboltOutlined, FileTextOutlined,
  BugOutlined, SearchOutlined, CodeOutlined, FileSearchOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ToolOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text, Title, Paragraph } = Typography

const SKILLS = [
  {
    name: 'tb-case-generate',
    title: 'AI 用例生成',
    icon: <FileTextOutlined />,
    status: 'available',
    description: '从 API 接口定义和业务规则，自动生成多维度测试用例（正向/参数验证/业务规则/边界值/异常/安全）',
    usage: '用例管理页 → 工具栏「AI 生成用例」按钮',
    output: '测试用例（手动步骤），自动入库到用例管理',
  },
  {
    name: 'tb-script-generate',
    title: 'AI 脚本生成',
    icon: <CodeOutlined />,
    status: 'available',
    description: '根据已有测试用例，自动生成 pytest + httpx 自动化测试脚本',
    usage: '用例管理页 → 勾选用例 → 工具栏「AI 生成脚本」按钮',
    output: 'pytest 测试脚本代码，可直接复制使用',
  },
  {
    name: 'tb-quality-review',
    title: '质量评审',
    icon: <SearchOutlined />,
    status: 'planned',
    description: 'AI 评审用例质量，从完整性、准确性、有效性、可执行性 4 个维度打分，给出改进建议',
    usage: '用例管理页 → 选择模块 → AI 评审',
    output: '质量评分（0-100）+ 问题列表 + 覆盖矩阵',
  },
  {
    name: 'tb-explore',
    title: '探索测试',
    icon: <BugOutlined />,
    status: 'planned',
    description: 'AI 辅助探索测试：自动生成测试章程 → 实时引导测试 → 记录发现 → 生成专业报告',
    usage: '项目菜单 → 探索测试（即将上线）',
    output: '探索测试报告（Bug/风险/改进建议 + 覆盖分析）',
  },
  {
    name: 'tb-diagnose',
    title: '失败诊断',
    icon: <FileSearchOutlined />,
    status: 'planned',
    description: 'AI 分析测试失败原因，3 分类仲裁（脚本Bug/系统Bug/环境问题），提供可行动的修复建议',
    usage: '测试报告页 → 失败用例旁「AI 诊断」按钮（即将上线）',
    output: '诊断结论 + 置信度 + 修复建议 + 关联病历',
  },
  {
    name: 'tb-doc-generate',
    title: '文档生成',
    icon: <FileTextOutlined />,
    status: 'planned',
    description: '根据用例或截图，自动生成操作手册、验收文档、培训教材',
    usage: '项目菜单 → 文档管理（即将上线）',
    output: 'Markdown / HTML 操作手册',
  },
]

const MCP_TOOLS = [
  { name: 'tb_list_cases', description: '列出分支下的测试用例，支持分页和筛选', category: '用例' },
  { name: 'tb_get_case', description: '获取单条测试用例的完整详情', category: '用例' },
  { name: 'tb_create_case', description: '创建测试用例，自动生成编号和目录', category: '用例' },
  { name: 'tb_get_folder_tree', description: '获取用例文件夹树形结构', category: '用例' },
  { name: 'tb_list_api_tree', description: '获取项目所有 API 接口树', category: 'API' },
  { name: 'tb_get_api_node', description: '获取 API 节点详情（method/url/body）', category: 'API' },
  { name: 'tb_list_environments', description: '列出所有测试环境', category: '环境' },
  { name: 'tb_get_merged_variables', description: '获取合并后的环境变量', category: '环境' },
]

export default function AICapabilities() {
  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`

  const statusTag = (status) => {
    if (status === 'available') return <Tag color="success" icon={<CheckCircleOutlined />}>可用</Tag>
    return <Tag color="default" icon={<ClockCircleOutlined />}>即将上线</Tag>
  }

  const mcpColumns = [
    { title: '工具名称', dataIndex: 'name', width: 220, render: (n) => <Text code>{n}</Text> },
    { title: '分类', dataIndex: 'category', width: 80, render: (c) => <Tag>{c}</Tag> },
    { title: '说明', dataIndex: 'description' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          AI 能力总览
        </h2>
        <span style={{ fontSize: 13, color: '#86909c' }}>
          testBench 平台内置的所有 AI 能力、Skill 定义和 MCP 工具一览。
        </span>
      </div>

      {/* Skill 列表 */}
      <Divider orientation="left" style={{ margin: '8px 0 12px' }}>
        <Space><ThunderboltOutlined /> Skill 能力（AI 做什么）</Space>
      </Divider>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {SKILLS.map(skill => (
          <Card
            key={skill.name}
            size="small"
            style={{ opacity: skill.status === 'planned' ? 0.7 : 1 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <Space>
                {skill.icon}
                <Text strong style={{ fontSize: 15 }}>{skill.title}</Text>
              </Space>
              {statusTag(skill.status)}
            </div>
            <Paragraph type="secondary" style={{ fontSize: 13, margin: '0 0 8px' }}>
              {skill.description}
            </Paragraph>
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <div><Text type="secondary">入口：</Text>{skill.usage}</div>
              <div><Text type="secondary">输出：</Text>{skill.output}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* MCP 工具 */}
      <Divider orientation="left" style={{ margin: '8px 0 12px' }}>
        <Space><ApiOutlined /> MCP 工具（AI 读写什么数据）</Space>
      </Divider>

      <Card size="small" style={{ marginBottom: 12, background: '#f6f7f9' }}>
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <b>MCP Server 地址：</b><Text code>{mcpUrl}</Text>
          <br/>
          <b>用途：</b>Skill 执行时通过这些工具读取项目数据（API 接口、已有用例、环境变量）和写入结果（创建用例）。
          Claude Code 等外部 MCP 客户端也可连接此地址使用。
        </div>
      </Card>

      <Table
        rowKey="name"
        columns={mcpColumns}
        dataSource={MCP_TOOLS}
        pagination={false}
        size="small"
      />

      {/* 双引擎说明 */}
      <Divider orientation="left" style={{ margin: '16px 0 12px' }}>
        <Space><ToolOutlined /> 两种使用方式</Space>
      </Divider>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card size="small">
          <Text strong style={{ fontSize: 15 }}>Web 引擎（浏览器）</Text>
          <Tag color="green" style={{ marginLeft: 8 }}>推荐</Tag>
          <div style={{ fontSize: 13, lineHeight: 2, marginTop: 8 }}>
            <div>直接在平台页面操作，零安装</div>
            <div>入口：用例管理页工具栏的 AI 按钮</div>
            <div>特点：实时进度 · 预览导入 · 可暂停</div>
          </div>
        </Card>
        <Card size="small">
          <Text strong style={{ fontSize: 15 }}>Claude Code 引擎（CLI）</Text>
          <Tag style={{ marginLeft: 8 }}>高级</Tag>
          <div style={{ fontSize: 13, lineHeight: 2, marginTop: 8 }}>
            <div>在终端通过 MCP 协议调用平台工具</div>
            <div>入口：Claude Code → <Text code>/tf-forge</Text></div>
            <div>特点：更强 LLM · 读本地代码 · 灵活</div>
          </div>
        </Card>
      </div>
    </div>
  )
}
