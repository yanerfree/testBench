import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Card, Radio, Button, Tag, Space, message, Empty, Spin, Typography, Divider,
  Modal, Form, Input, Select, InputNumber, Popconfirm,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, StarFilled, ThunderboltOutlined,
  SwapOutlined, RobotOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text } = Typography

const PROVIDERS = [
  { value: 'openai_compatible', label: '公司 AI 网关 / OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic (直连)' },
  { value: 'ollama', label: 'Ollama (本地)' },
]

export default function ProjectAIConfig() {
  const { projectId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [customModalOpen, setCustomModalOpen] = useState(false)
  const [form] = Form.useForm()

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/ai-config`)
      setData(res.data)
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const handleSelectSystem = async (providerConfigId) => {
    setSelecting(true)
    try {
      await api.post(`/projects/${projectId}/ai-config/select/${providerConfigId}`)
      message.success('已切换到此 AI 服务')
      fetchConfig()
    } catch { /* */ } finally { setSelecting(false) }
  }

  const handleCreateCustom = async () => {
    try {
      const values = await form.validateFields()
      await api.post(`/projects/${projectId}/ai-config/custom`, {
        name: values.name,
        provider: values.provider,
        base_url: values.baseUrl,
        api_key: values.apiKey || undefined,
        auth_token: values.authToken || undefined,
        model: values.model,
        temperature: values.temperature,
        max_tokens: values.maxTokens,
        timeout_seconds: values.timeoutSeconds,
      })
      message.success('项目专属配置已创建并激活')
      setCustomModalOpen(false)
      form.resetFields()
      fetchConfig()
    } catch { /* */ }
  }

  const handleTestCustom = async () => {
    try {
      const values = await form.validateFields(['provider', 'baseUrl', 'model', 'apiKey', 'authToken'])
      message.loading({ content: '正在测试连接...', key: 'test-custom' })
      const res = await api.post('/ai-providers/test-connection', {
        provider: values.provider,
        base_url: values.baseUrl,
        model: values.model,
        api_key: values.apiKey || undefined,
        auth_token: values.authToken || undefined,
      })
      const d = res.data
      if (d.success) {
        message.success({ content: `${d.message}  ·  ${d.latencyMs}ms`, key: 'test-custom' })
      } else {
        message.error({ content: d.message, key: 'test-custom' })
      }
    } catch { /* */ }
  }

  const handleDeleteCustom = async (configId) => {
    try {
      await api.del(`/projects/${projectId}/ai-config/custom/${configId}`)
      message.success('已删除项目配置')
      fetchConfig()
    } catch { /* */ }
  }

  const openCustomModal = () => {
    form.resetFields()
    form.setFieldsValue({
      provider: 'openai_compatible',
      temperature: 0.3,
      maxTokens: 4096,
      timeoutSeconds: 120,
    })
    setCustomModalOpen(true)
  }

  if (loading && !data) return <Spin style={{ display: 'block', margin: '80px auto' }} />

  const systemConfigs = data?.systemConfigs || []
  const projectConfigs = (data?.projectConfigs || []).filter(c => !c.providerConfigId)
  const activeProviderConfigId = data?.activeProviderConfigId
  const activeConfigId = data?.activeConfigId

  // 找当前激活的配置名
  const activeName = (() => {
    if (activeProviderConfigId) {
      return systemConfigs.find(c => c.id === activeProviderConfigId)?.name
    }
    if (activeConfigId) {
      const pc = projectConfigs.find(c => c.id === activeConfigId)
      return pc?.name
    }
    return null
  })()
  const activeModel = (() => {
    if (activeProviderConfigId) {
      return systemConfigs.find(c => c.id === activeProviderConfigId)?.model
    }
    if (activeConfigId) {
      return projectConfigs.find(c => c.id === activeConfigId)?.model
    }
    return null
  })()

  const statusIcon = (config) => {
    if (!config.status) return <Tag>未测试</Tag>
    if (config.status === 'ok') return <Tag color="success" icon={<CheckCircleOutlined />}>正常</Tag>
    return <Tag color="error" icon={<CloseCircleOutlined />}>异常</Tag>
  }

  const hasNoConfigs = systemConfigs.length === 0 && projectConfigs.length === 0
  const hasActiveConfig = !!(activeProviderConfigId || activeConfigId)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          AI 配置
        </h2>
        <span style={{ fontSize: 13, color: '#86909c' }}>
          选择或创建本项目使用的 AI 服务。系统配置由管理员统一管理，项目也可自建专属配置。
        </span>
      </div>

      {/* 当前状态横幅 */}
      {hasActiveConfig ? (
        <Card size="small" style={{ borderColor: '#52c41a', background: '#f6ffed', marginBottom: 16 }}>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            <Text strong>当前使用：</Text>
            <Text>{activeName || '未知'}</Text>
            <Tag>{activeModel || ''}</Tag>
          </Space>
        </Card>
      ) : (
        <Card size="small" style={{ borderColor: '#faad14', background: '#fffbe6', marginBottom: 16 }}>
          <Space>
            <span style={{ fontSize: 16 }}>&#9888;&#65039;</span>
            <Text>尚未选择 AI 服务。请从下方选择一个系统配置，或创建项目专属配置。</Text>
          </Space>
        </Card>
      )}

      {/* 系统配置区域 */}
      {systemConfigs.length > 0 && (
        <>
          <Divider orientation="left" style={{ margin: '4px 0 12px' }}>系统配置（管理员提供）</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {systemConfigs.map((config) => {
              const isActive = config.id === activeProviderConfigId
              return (
                <Card
                  key={config.id}
                  size="small"
                  style={{ borderColor: isActive ? '#52c41a' : undefined }}
                  hoverable={!isActive}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size="middle">
                      <Radio checked={isActive} />
                      <div>
                        <Space size={4}>
                          <Text strong style={{ fontSize: 15 }}>{config.name}</Text>
                          {config.isSystemDefault && (
                            <Tag color="gold" icon={<StarFilled />} style={{ fontSize: 11 }}>推荐</Tag>
                          )}
                          {isActive && <Tag color="green">当前使用</Tag>}
                        </Space>
                        <div style={{ marginTop: 4 }}>
                          <Space size={12}>
                            <Text type="secondary">模型: <Tag style={{ marginLeft: 2 }}>{config.model}</Tag></Text>
                            {statusIcon(config)}
                          </Space>
                        </div>
                      </div>
                    </Space>
                    {!isActive && (
                      <Button
                        type="primary"
                        ghost
                        icon={<SwapOutlined />}
                        loading={selecting}
                        onClick={() => handleSelectSystem(config.id)}
                      >
                        使用此配置
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* 项目自建配置区域 */}
      <Divider orientation="left" style={{ margin: '4px 0 12px' }}>项目专属配置</Divider>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projectConfigs.map((config) => {
          const isActive = config.id === activeConfigId && !activeProviderConfigId
          return (
            <Card key={config.id} size="small" style={{ borderColor: isActive ? '#52c41a' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size="middle">
                  <Radio checked={isActive} />
                  <div>
                    <Space size={4}>
                      <Text strong>{config.name}</Text>
                      <Tag color="blue">项目自建</Tag>
                      {isActive && <Tag color="green">当前使用</Tag>}
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">
                        模型: <Tag style={{ marginLeft: 2 }}>{config.model || '未设置'}</Tag>
                      </Text>
                    </div>
                  </div>
                </Space>
                <Space>
                  <Popconfirm title="确认删除此配置？" onConfirm={() => handleDeleteCustom(config.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          )
        })}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={openCustomModal}
          style={{ height: 48 }}
        >
          添加项目专属 AI 配置
        </Button>
      </div>

      {hasNoConfigs && (
        <Card style={{ marginTop: 16 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                暂无可用的 AI 配置<br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  请联系管理员添加系统配置，或点击上方按钮自建项目配置
                </Text>
              </span>
            }
          />
        </Card>
      )}

      {/* 自建配置弹窗 */}
      <Modal
        title="添加项目专属 AI 配置"
        open={customModalOpen}
        onCancel={() => setCustomModalOpen(false)}
        width={520}
        footer={[
          <Button key="test" icon={<ThunderboltOutlined />} onClick={handleTestCustom}>
            测试连接
          </Button>,
          <Button key="cancel" onClick={() => setCustomModalOpen(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleCreateCustom}>
            创建并激活
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input placeholder="例如: 项目专用-DeepSeek" />
          </Form.Item>
          <Form.Item name="provider" label="服务商类型" rules={[{ required: true }]}>
            <Select options={PROVIDERS} />
          </Form.Item>
          <Form.Item name="baseUrl" label="API 地址" rules={[{ required: true, message: '请输入 API 地址' }]}>
            <Input placeholder="http://..." />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item name="authToken" label="网关 Token (Bearer)">
            <Input.Password placeholder="gw-..." />
          </Form.Item>
          <Form.Item name="model" label="模型名称" rules={[{ required: true, message: '请输入模型' }]}>
            <Input placeholder="deepseek-chat" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="temperature" label="温度">
              <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="maxTokens" label="最大 Token">
              <InputNumber min={100} max={128000} step={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="timeoutSeconds" label="超时 (秒)">
              <InputNumber min={10} max={600} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
