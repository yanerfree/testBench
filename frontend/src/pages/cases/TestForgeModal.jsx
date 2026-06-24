import { useState, useRef } from 'react'
import { Modal, Form, Input, AutoComplete, Button, message, Typography, Space, Steps } from 'antd'
import { RobotOutlined, CopyOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { api } from '../../utils/request'
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
  const [legacyMode, setLegacyMode] = useState(false)
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [legacyJson, setLegacyJson] = useState(null)

  const handleGenerate = async () => {
    let values
    try { values = await form.validateFields() } catch { return }

    const body = {
      target: {
        module: values.module,
        submodule: values.submodule || null,
      },
      interfaceInfo: values.interfaceInfo,
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
      const parsed = JSON.parse(jsonStr)
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

  const renderFooter = () => {
    if (step === STEP_INPUT && !legacyMode) {
      return [
        <Button key="legacy" onClick={() => setLegacyMode(true)} style={{ float: 'left' }}>
          导出 Task JSON
        </Button>,
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="submit" type="primary" onClick={handleGenerate}>
          AI 生成用例
        </Button>,
      ]
    }
    if (step === STEP_INPUT && legacyMode) {
      if (legacyJson) {
        return [
          <Button key="copy" icon={<CopyOutlined />} onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(legacyJson, null, 2))
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
      title={<Space><RobotOutlined /> AI 生成测试</Space>}
      open={open}
      onCancel={handleClose}
      width={820}
      footer={renderFooter()}
      destroyOnClose
    >
      {step === STEP_INPUT && !legacyJson && (
        <>
          <Steps
            current={0}
            size="small"
            items={[{ title: '输入信息' }, { title: 'AI 生成' }, { title: '预览导入' }]}
            style={{ marginBottom: 20 }}
          />
          <Form form={form} layout="vertical">
            <Form.Item label="目标模块" name="module" rules={[{ required: true, message: '请选择或输入目标模块' }]}>
              <AutoComplete
                placeholder="选择已有模块或输入新模块名"
                options={moduleOptions}
                allowClear
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item label="子模块" name="submodule">
              <Input placeholder="可选，如 mshost、ashost" />
            </Form.Item>
            <Form.Item
              label="接口信息"
              name="interfaceInfo"
              rules={[{ required: true, message: '请粘贴 curl 命令或接口描述' }]}
              extra="粘贴 curl 命令、接口文档、或用自然语言描述接口"
            >
              <TextArea rows={8} placeholder={'粘贴 curl 命令，例如：\n\ncurl \'http://10.10.2.104/api/apim/apim/connector/rfc/test\' \\\n  -H \'Content-Type: application/json\' \\\n  --data-raw \'{"connectType":"MSHOST",...}\''} />
            </Form.Item>
            <Form.Item label="业务规则" name="businessRules" extra="每行一条规则">
              <TextArea rows={5} placeholder={'每行一条，例如：\nname 和 registerName 在同环境唯一\n创建前必须通过连通性测试\n项目内创建仅本项目可用'} />
            </Form.Item>
          </Form>
        </>
      )}

      {step === STEP_INPUT && legacyJson && (
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Task 已生成并保存到 testforge/tasks/ 目录。在 Claude Code 中执行 /tf-forge 即可开始生成。
          </Text>
          <pre style={preStyle}>{JSON.stringify(legacyJson, null, 2)}</pre>
        </div>
      )}

      {step === STEP_GENERATE && (
        <>
          <Steps
            current={1}
            size="small"
            items={[{ title: '输入信息' }, { title: 'AI 生成' }, { title: '预览导入' }]}
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
            items={[{ title: '输入信息' }, { title: 'AI 生成' }, { title: '预览导入' }]}
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
  borderRadius: 8,
  maxHeight: 400,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.5,
}
