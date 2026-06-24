import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Card, Radio, Button, Tag, Space, message, Empty, Spin, Badge, Typography, Divider,
  Descriptions,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, StarFilled, ThunderboltOutlined,
  LoadingOutlined, SwapOutlined, RobotOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text, Title } = Typography

export default function ProjectAIConfig() {
  const { projectId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState(false)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/ai-config`)
      setData(res.data)
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const handleSelect = async (providerConfigId) => {
    setSelecting(true)
    try {
      await api.post(`/projects/${projectId}/ai-config/select/${providerConfigId}`)
      message.success('AI 服务已切换')
      fetchConfig()
    } catch { /* */ } finally { setSelecting(false) }
  }

  if (loading && !data) return <Spin style={{ display: 'block', margin: '80px auto' }} />

  const systemConfigs = data?.systemConfigs || []
  const activeId = data?.activeProviderConfigId

  const statusIcon = (config) => {
    if (!config.status) return <Tag>未测试</Tag>
    if (config.status === 'ok') return <Tag color="success" icon={<CheckCircleOutlined />}>正常</Tag>
    return <Tag color="error" icon={<CloseCircleOutlined />}>异常</Tag>
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          AI 配置
        </h2>
        <span style={{ fontSize: 13, color: '#86909c' }}>
          选择本项目使用的 AI 服务。管理员可在"系统设置 → AI 服务配置"中添加更多选项。
        </span>
      </div>

      {systemConfigs.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                暂无可用的 AI 服务配置<br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  请联系管理员在"系统设置 → AI 服务配置"中添加 AI 服务
                </Text>
              </span>
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeId && (
            <Card size="small" style={{ borderColor: '#52c41a', background: '#f6ffed' }}>
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                <Text strong>当前使用：</Text>
                <Text>{systemConfigs.find(c => c.id === activeId)?.name || '未知'}</Text>
                <Tag>{systemConfigs.find(c => c.id === activeId)?.model || ''}</Tag>
              </Space>
            </Card>
          )}

          <Divider orientation="left" style={{ margin: '4px 0' }}>可用的 AI 服务</Divider>

          {systemConfigs.map((config) => {
            const isActive = config.id === activeId
            return (
              <Card
                key={config.id}
                size="small"
                style={{
                  borderColor: isActive ? '#52c41a' : undefined,
                  cursor: isActive ? 'default' : 'pointer',
                }}
                hoverable={!isActive}
                onClick={() => !isActive && !selecting && handleSelect(config.id)}
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
                      icon={<SwapOutlined />}
                      loading={selecting}
                      onClick={(e) => { e.stopPropagation(); handleSelect(config.id) }}
                    >
                      切换到此配置
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}

          {!activeId && (
            <Card size="small" style={{ borderColor: '#faad14', background: '#fffbe6' }}>
              <Space>
                <span style={{ fontSize: 16 }}>💡</span>
                <Text>尚未选择 AI 服务，点击上方任一配置即可启用 AI 功能</Text>
              </Space>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
