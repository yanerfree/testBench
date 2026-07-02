import { useState, useEffect, useRef } from 'react'
import { Modal, Form, Input, AutoComplete, Button, message, Typography, Space, Steps, Select, Checkbox, Tag, Card, Alert, Tabs, Divider } from 'antd'
import { RobotOutlined, CopyOutlined, ArrowLeftOutlined, ApiOutlined, FileTextOutlined, ThunderboltOutlined, BulbOutlined } from '@ant-design/icons'
import { api } from '../../utils/request'
import { copyToClipboard } from '../../utils/clipboard'
import AIStreamPanel from '../../components/AIStreamPanel'
import AICasePreview from '../../components/AICasePreview'

const { TextArea } = Input
const { Text } = Typography

const STEP_INPUT = 0
const STEP_GENERATE = 1
const STEP_PREVIEW = 2

export default function TestForgeModal({ projectId, branchId, folders, open, onClose, onImported }) {
  const [form] = Form.useForm()
  const [step, setStep] = useState(STEP_INPUT)
  const [requestBody, setRequestBody] = useState(null)
  const [generatedCases, setGeneratedCases] = useState([])
  const [rawContent, setRawContent] = useState('')
  const [apiNodes, setApiNodes] = useState([])
  const [selectedApis, setSelectedApis] = useState([])
  const [inputMode, setInputMode] = useState('select') // 'select' | 'manual'
  const [legacyMode, setLegacyMode] = useState(false)
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [legacyJson, setLegacyJson] = useState(null)

  useEffect(() => {
    if (!open || !projectId) return
    api.get(`/projects/${projectId}/api-nodes`).then(res => {
      const nodes = (res.data || []).filter(n => n.type === 'endpoint')
      setApiNodes(nodes)
      if (nodes.length === 0) setInputMode('manual')
    }).catch(() => { setInputMode('manual') })
  }, [open, projectId])

  const handleGenerate = async () => {
    let values
    try { values = await form.validateFields() } catch { return }

    let interfaceInfo = ''
    if (inputMode === 'select' && selectedApis.length > 0) {
      interfaceInfo = selectedApis.map(id => {
        const node = apiNodes.find(n => n.id === id)
        if (!node) return ''
        const parts = [`${node.method || 'GET'} ${node.url || ''} ${node.name || ''}`]
        if (node.headers) parts.push(`Headers: ${JSON.stringify(node.headers)}`)
        if (node.body) parts.push(`Body: ${JSON.stringify(node.body)}`)
        return parts.join('\n')
      }).filter(Boolean).join('\n\n---\n\n')
    } else {
      interfaceInfo = values.interfaceInfo
    }

    if (!interfaceInfo?.trim()) {
      message.warning('请选择接口或输入接口信息')
      return
    }

    const body = {
      target: { module: values.module, submodule: values.submodule || null },
      interfaceInfo,
      businessRules: values.businessRules
        ? values.businessRules.split('\n').map(s => s.trim()).filter(Boolean)
        : [],
    }
    setRequestBody(body)
    setStep(STEP_GENERATE)
  }

  const handleStreamDone = (content) => {
    setRawContent(content)
    try {
      let jsonStr = content.trim()
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) jsonStr = match[1].trim()

      // 处理被截断的 JSON
      let parsed
      try {
        parsed = JSON.parse(jsonStr)
      } catch {
        const lastBrace = jsonStr.lastIndexOf('}')
        if (lastBrace > 0) {
          const truncated = jsonStr.substring(0, lastBrace + 1).replace(/,\s*$/, '') + ']'
          parsed = JSON.parse(truncated)
        }
      }

      const cases = Array.isArray(parsed) ? parsed : (parsed.cases || parsed.data || [parsed])
      setGeneratedCases(cases)
      setStep(STEP_PREVIEW)
    } catch {
      message.warning('AI 输出格式解析失败，请复制原始内容手动处理')
    }
  }

  const handleImported = (result) => {
    message.success(`成功导入 ${result.imported} 条用例`)
    onImported?.()
    handleClose()
  }

  const handleClose = () => {
    setStep(STEP_INPUT)
    setRequestBody(null)
    setGeneratedCases([])
    setRawContent('')
    setSelectedApis([])
    setLegacyJson(null)
    setLegacyMode(false)
    form.resetFields()
    onClose()
  }

  const handleLegacy = async () => {
    let values
    try { values = await form.validateFields() } catch { return }
    setLegacyLoading(true)
    try {
      const res = await api.post(`/projects/${projectId}/branches/${branchId}/testforge/task`, {
        target: { module: values.module, submodule: values.submodule || null },
        interfaceInfo: values.interfaceInfo,
        businessRules: values.businessRules
          ? values.businessRules.split('\n').map(s => s.trim()).filter(Boolean)
          : [],
      })
      setLegacyJson(res.data)
      message.success('Task 已生成')
    } catch {
      message.error('生成失败')
    } finally {
      setLegacyLoading(false)
    }
  }

  const moduleOptions = (folders || []).map(f => ({
    label: f.name,
    value: f.name.toLowerCase().replace(/\s+/g, '-'),
  }))

  const aiUrl = `/projects/${projectId}/branches/${branchId}/ai/generate-cases`

  const apiOptions = apiNodes.map(n => ({
    label: `${n.method || 'GET'} ${n.url || ''} (${n.name || ''})`,
    value: n.id,
  }))

  const renderFooter = () => {
    if (step === STEP_INPUT && !legacyMode) {
      return [
        <Button key="legacy" onClick={() => setLegacyMode(true)} style={{ float: 'left' }}>
          MCP / CLI 模式
        </Button>,
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="submit" type="primary" icon={<ThunderboltOutlined />} onClick={handleGenerate}>
          开始生成用例
        </Button>,
      ]
    }
    if (step === STEP_INPUT && legacyMode) {
      if (legacyJson) {
        return [
          <Button key="copy" icon={<CopyOutlined />} onClick={() => {
            copyToClipboard(JSON.stringify(legacyJson, null, 2))
            message.success('已复制')
          }}>复制 JSON</Button>,
          <Button key="back" onClick={() => { setLegacyJson(null); setLegacyMode(false) }}>返回</Button>,
        ]
      }
      return [
        <Button key="back" onClick={() => setLegacyMode(false)}>返回 AI 模式</Button>,
        <Button key="gen" type="primary" loading={legacyLoading} onClick={handleLegacy}>
          生成 Task JSON
        </Button>,
      ]
    }
    if (step === STEP_GENERATE) {
      return [<Button key="cancel" onClick={handleClose}>取消</Button>]
    }
    if (step === STEP_PREVIEW) {
      return [
        <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => setStep(STEP_GENERATE)}>
          返回重新生成
        </Button>,
        <Button key="close" onClick={handleClose}>关闭</Button>,
      ]
    }
    return null
  }

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined />
          <span>AI 用例生成</span>
          <Tag color="blue">基于接口定义，自动生成多维度测试用例</Tag>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      width={880}
      footer={renderFooter()}
      destroyOnClose
    >
      {step === STEP_INPUT && !legacyJson && !legacyMode && (
        <>
          <Steps
            current={0}
            size="small"
            items={[
              { title: '选择接口', icon: <ApiOutlined /> },
              { title: 'AI 生成', icon: <RobotOutlined /> },
              { title: '预览导入', icon: <FileTextOutlined /> },
            ]}
            style={{ marginBottom: 20 }}
          />

          <Alert
            type="info"
            showIcon
            icon={<BulbOutlined />}
            closable
            message="AI 会从正向流程、参数验证、业务规则、边界值、异常场景、安全 6 个维度自动生成测试用例，去重后可一键导入"
            style={{ marginBottom: 16 }}
          />

          <Form form={form} layout="vertical">
            {/* 接口信息：选择模式 vs 手动模式 */}
            <Form.Item label={
              <Space>
                <span>接口信息</span>
                <Tag
                  color={inputMode === 'select' ? 'green' : 'default'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setInputMode('select')}
                >
                  从项目选择
                </Tag>
                <Tag
                  color={inputMode === 'manual' ? 'green' : 'default'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setInputMode('manual')}
                >
                  手动输入
                </Tag>
              </Space>
            }>
              {inputMode === 'select' ? (
                <div>
                  {apiNodes.length > 0 ? (
                    <Select
                      mode="multiple"
                      placeholder="选择一个或多个 API 接口，AI 会读取其定义来生成用例"
                      options={apiOptions}
                      value={selectedApis}
                      onChange={setSelectedApis}
                      style={{ width: '100%' }}
                      optionFilterProp="label"
                      maxTagCount={5}
                    />
                  ) : (
                    <Alert
                      type="warning"
                      message="项目尚未录入 API 接口"
                      description="请先在「API 接口」页面添加接口，或切换到「手动输入」模式"
                      showIcon
                    />
                  )}
                  {selectedApis.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        已选 {selectedApis.length} 个接口，AI 将为每个接口生成覆盖六维度的测试用例
                      </Text>
                    </div>
                  )}
                </div>
              ) : null}
            </Form.Item>

            {inputMode === 'manual' && (
              <Form.Item
                name="interfaceInfo"
                label="接口信息（手动输入）"
                rules={[{ required: true, message: '请输入接口信息' }]}
              >
                <TextArea
                  rows={6}
                  placeholder={'粘贴 curl 命令、接口文档、或用自然语言描述：\n\nPOST /api/users 创建用户\n请求: {username: string, email: string}\n响应: 201 {id, username, email}'}
                />
              </Form.Item>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item
                label="目标模块"
                name="module"
                rules={[{ required: true, message: '请选择或输入模块名' }]}
                tooltip="生成的用例会归入此模块文件夹"
              >
                <AutoComplete
                  placeholder="选择已有模块或输入新模块名"
                  options={moduleOptions}
                  allowClear
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
              <Form.Item label="子模块" name="submodule" tooltip="可选，进一步细分">
                <Input placeholder="可选" />
              </Form.Item>
            </div>

            <Form.Item
              label="业务规则"
              name="businessRules"
              tooltip="每行一条规则，AI 会针对每条规则生成对应的测试用例"
            >
              <TextArea rows={4} placeholder={'每行一条，例如：\nname 和 registerName 在同环境唯一\n创建前必须通过连通性测试\n密码错误 3 次锁定账户'} />
            </Form.Item>
          </Form>
        </>
      )}

      {step === STEP_INPUT && legacyMode && !legacyJson && (
        <div>
          <Alert
            type="info"
            showIcon
            message="MCP / CLI 模式"
            description={
              <div style={{ fontSize: 12, lineHeight: 2 }}>
                此模式生成 Task JSON 文件，可通过以下方式使用：<br/>
                <b>方式一：</b>在 Claude Code 终端执行 <code>/tf-forge</code>，AI 通过 MCP 协议读取接口定义并生成用例<br/>
                <b>方式二：</b>其他 MCP 客户端连接 <code>{`http://${window.location.hostname}:8000/mcp/`}</code> 调用 testBench 工具
              </div>
            }
            style={{ marginBottom: 16 }}
          />
          <Form form={form} layout="vertical">
            <Form.Item label="目标模块" name="module" rules={[{ required: true }]}>
              <AutoComplete placeholder="模块名" options={moduleOptions} allowClear
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} />
            </Form.Item>
            <Form.Item label="子模块" name="submodule"><Input placeholder="可选" /></Form.Item>
            <Form.Item label="接口信息" name="interfaceInfo" rules={[{ required: true }]}>
              <TextArea rows={6} placeholder="粘贴接口信息" />
            </Form.Item>
            <Form.Item label="业务规则" name="businessRules">
              <TextArea rows={4} placeholder="每行一条" />
            </Form.Item>
          </Form>
        </div>
      )}

      {step === STEP_INPUT && legacyJson && (
        <div>
          <Alert
            type="success"
            showIcon
            message="Task 已生成"
            description="在 Claude Code 中执行 /tf-forge 即可开始生成。Task 文件已保存到 testforge/tasks/ 目录。"
            style={{ marginBottom: 12 }}
          />
          <pre style={preStyle}>{JSON.stringify(legacyJson, null, 2)}</pre>
        </div>
      )}

      {step === STEP_GENERATE && (
        <>
          <Steps
            current={1}
            size="small"
            items={[
              { title: '选择接口', icon: <ApiOutlined /> },
              { title: 'AI 生成', icon: <RobotOutlined /> },
              { title: '预览导入', icon: <FileTextOutlined /> },
            ]}
            style={{ marginBottom: 20 }}
          />
          <AIStreamPanel
            url={aiUrl}
            body={requestBody}
            autoStart
            onDone={handleStreamDone}
          />
        </>
      )}

      {step === STEP_PREVIEW && (
        <>
          <Steps
            current={2}
            size="small"
            items={[
              { title: '选择接口', icon: <ApiOutlined /> },
              { title: 'AI 生成', icon: <RobotOutlined /> },
              { title: '预览导入', icon: <FileTextOutlined /> },
            ]}
            style={{ marginBottom: 20 }}
          />
          <AICasePreview
            cases={generatedCases}
            projectId={projectId}
            branchId={branchId}
            onImported={handleImported}
          />
        </>
      )}
    </Modal>
  )
}

const preStyle = {
  background: '#1e1e1e',
  color: '#d4d4d4',
  padding: 16,
  borderRadius: 12,
  maxHeight: 400,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.5,
}
