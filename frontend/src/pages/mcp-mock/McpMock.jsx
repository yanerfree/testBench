import { useState, useEffect, useCallback } from 'react'
import { Switch, Card, Table, Tag, Space, Typography, Alert, Button, message, Drawer } from 'antd'
import {
  ApiOutlined, CheckCircleOutlined, CloseCircleOutlined,
  EyeOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text, Paragraph } = Typography

export default function McpMock() {
  const [enabled, setEnabled] = useState(false)
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(false)
  const [previewTool, setPreviewTool] = useState(null)
  const [previewData, setPreviewData] = useState(null)

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
      message.success(checked ? 'MCP Mock 已开启，工具将返回模拟数据' : 'MCP Mock 已关闭，工具将查询真实数据库')
    } catch { /* */ }
  }

  const handlePreview = async (toolName) => {
    try {
      const res = await api.get(`/mcp-mock/preview/${toolName}`)
      setPreviewData(res.data)
      setPreviewTool(toolName)
    } catch { /* */ }
  }

  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`

  const columns = [
    {
      title: '工具名称',
      dataIndex: 'name',
      render: (n) => <Text code>{n}</Text>,
    },
    {
      title: '说明',
      dataIndex: 'description',
    },
    {
      title: '模拟数据',
      width: 120,
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record.name)}>
          预览
        </Button>
      ),
    },
  ]

  const toolData = [
    { name: 'tb_list_cases', description: '列出测试用例 → 返回 2 条模拟用例' },
    { name: 'tb_get_case', description: '获取用例详情 → 返回模拟用例' },
    { name: 'tb_create_case', description: '创建用例 → 返回模拟结果（不写库）' },
    { name: 'tb_get_folder_tree', description: '获取文件夹树 → 返回 2 层模拟目录' },
    { name: 'tb_list_api_tree', description: '获取 API 接口树 → 返回 3 个模拟节点' },
    { name: 'tb_get_api_node', description: '获取 API 详情 → 返回模拟端点' },
    { name: 'tb_list_environments', description: '列出环境 → 返回 dev/staging/prod' },
    { name: 'tb_get_merged_variables', description: '获取变量 → 返回 BASE_URL 等模拟值' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>
          <ApiOutlined style={{ marginRight: 8 }} />
          MCP Mock
        </h2>
        <span style={{ fontSize: 13, color: '#86909c' }}>
          开启后 MCP 工具返回预设的模拟数据，不查询真实数据库。适合演示、培训和 Skill 调试。
        </span>
      </div>

      {/* 开关 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size="large">
            <div>
              <Text strong style={{ fontSize: 15 }}>MCP Mock 服务</Text>
              <div>
                {enabled
                  ? <Tag color="success" icon={<CheckCircleOutlined />}>已开启 — 工具返回模拟数据</Tag>
                  : <Tag icon={<CloseCircleOutlined />}>已关闭 — 工具查询真实数据库</Tag>
                }
              </div>
            </div>
          </Space>
          <Switch
            checked={enabled}
            onChange={handleToggle}
            checkedChildren="Mock 开"
            unCheckedChildren="Mock 关"
            style={{ transform: 'scale(1.2)' }}
          />
        </div>
      </Card>

      <Alert
        type="info"
        showIcon
        closable
        message="MCP Mock 的作用"
        description={
          <div style={{ fontSize: 12, lineHeight: 2 }}>
            <b>什么时候用：</b>演示平台功能时不想暴露真实数据、培训新用户时提供统一示例数据、调试 Skill prompt 效果时减少 DB 依赖<br/>
            <b>影响范围：</b>开启后所有 MCP 工具（通过 MCP 协议和 Web 引擎调用的）都返回下方预设数据<br/>
            <b>不影响：</b>平台本身的用例管理、API 接口等页面功能不受影响，只影响 AI Skill 执行时读取的上下文
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      {/* MCP 地址 */}
      <Card size="small" style={{ marginBottom: 16, background: '#f6f7f9' }}>
        <Text strong>MCP Server 地址：</Text>
        <Text code copyable style={{ marginLeft: 8 }}>{mcpUrl}</Text>
        <Text type="secondary" style={{ marginLeft: 12 }}>
          {enabled ? '(Mock 模式)' : '(正常模式)'}
        </Text>
      </Card>

      {/* 工具列表 */}
      <Table
        rowKey="name"
        columns={columns}
        dataSource={toolData}
        pagination={false}
        size="small"
      />

      {/* 预览抽屉 */}
      <Drawer
        title={<Space><ApiOutlined /><Text code>{previewTool}</Text> 模拟数据</Space>}
        open={!!previewTool}
        onClose={() => { setPreviewTool(null); setPreviewData(null) }}
        width={520}
      >
        {previewData && (
          <pre style={{
            background: '#1e1e1e', color: '#d4d4d4', padding: 16,
            borderRadius: 8, overflow: 'auto', fontSize: 12, lineHeight: 1.6,
            maxHeight: 'calc(100vh - 120px)',
          }}>
            {JSON.stringify(previewData, null, 2)}
          </pre>
        )}
      </Drawer>
    </div>
  )
}
