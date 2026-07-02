import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Tag, Space, Typography, Modal, Form, Input, Select,
  message, Popconfirm, Spin,
} from 'antd'
import {
  PlusOutlined, ThunderboltOutlined, DeleteOutlined, RobotOutlined,
  LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text } = Typography
const { TextArea } = Input

const METHOD_COLORS = { GET: '#1677ff', POST: '#52c41a', PUT: '#faad14', DELETE: '#ff4d4f', PATCH: '#722ed1' }
const PRIORITY_COLORS = { P0: 'red', P1: 'orange', P2: 'blue', P3: 'default' }

export default function ApiTest() {
  const { projectId } = useParams()
  const [branchId, setBranchId] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [expandedStep, setExpandedStep] = useState(null)
  const [genOpen, setGenOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState([])
  const [form] = Form.useForm()

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/branches`).then(res => {
      const b = (res.data || [])[0]
      if (b) setBranchId(b.id)
    }).catch(() => {})
  }, [projectId])

  const fetchScenarios = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests`)
      setScenarios(res.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, branchId])

  useEffect(() => { fetchScenarios() }, [fetchScenarios])

  const loadDetail = async (id) => {
    setSelectedId(id)
    setExpandedStep(null)
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`)
      setDetail(res.data)
    } catch { /* */ }
  }

  const handleDelete = async (id) => {
    await api.del(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`).catch(() => {})
    message.success('已删除')
    if (selectedId === id) { setSelectedId(null); setDetail(null) }
    fetchScenarios()
  }

  const handleGenerate = async () => {
    try {
      const v = await form.validateFields()
      setGenerating(true); setGenProgress([])
      api.stream(`/projects/${projectId}/branches/${branchId}/api-tests/generate`, {
        apiInfo: v.apiInfo,
        envVariables: v.envVars ? JSON.parse(v.envVars) : undefined,
      }, {
        onChunk: (data) => {
          if (data.type === 'step_start') setGenProgress(prev => [...prev, `⏳ ${data.title}`])
          if (data.type === 'step_done') setGenProgress(prev => [...prev, `✅ ${data.summary}`])
          if (data.type === 'scenario_created') setGenProgress(prev => [...prev, `📋 ${data.code} ${data.title} (${data.stepCount}步骤)`])
          if (data.type === 'error') { message.error(data.message); setGenerating(false) }
        },
        onDone: () => {
          message.success('测试场景已生成')
          setGenerating(false); setGenOpen(false); form.resetFields()
          fetchScenarios()
        },
        onError: (msg) => { message.error(msg); setGenerating(false) },
      })
    } catch { /* */ }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* 左侧：场景列表 */}
      <div style={{ width: 280, minWidth: 280, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>接口测试</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setGenOpen(true); form.resetFields() }}>
              生成
            </Button>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>选择接口自动生成测试场景</Text>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> :
            scenarios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: '#bfbfbf' }}>
                <ThunderboltOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                <div>暂无测试场景</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>点击「生成」创建</div>
              </div>
            ) : scenarios.map(s => (
              <div
                key={s.id}
                onClick={() => loadDetail(s.id)}
                style={{
                  padding: '10px 16px', cursor: 'pointer', borderLeft: selectedId === s.id ? '3px solid #1677ff' : '3px solid transparent',
                  background: selectedId === s.id ? '#e6f4ff' : 'transparent',
                }}
                onMouseEnter={e => { if (selectedId !== s.id) e.currentTarget.style.background = '#fafafa' }}
                onMouseLeave={e => { if (selectedId !== s.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{s.title}</div>
                <Space size={4}>
                  <Tag color={PRIORITY_COLORS[s.priority]} style={{ fontSize: 11 }}>{s.priority}</Tag>
                  <Tag style={{ fontSize: 11 }}>{s.code}</Tag>
                </Space>
              </div>
            ))
          }
        </div>
      </div>

      {/* 右侧：场景详情 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!detail ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#bfbfbf' }}>
            <ThunderboltOutlined style={{ fontSize: 48, marginBottom: 12 }} />
            <div>选择左侧场景查看详情</div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <Tag color={PRIORITY_COLORS[detail.priority]}>{detail.priority}</Tag>
                <span style={{ fontSize: 16, fontWeight: 600, marginLeft: 8 }}>{detail.title}</span>
                <div style={{ marginTop: 6, fontSize: 13, color: '#8c8c8c' }}>{detail.description}</div>
              </div>
              <Popconfirm title="确认删除此场景？" onConfirm={() => handleDelete(detail.id)}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </div>

            {/* 步骤列表 */}
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
              共 {detail.steps?.length || 0} 个请求
            </div>
            {(detail.steps || []).map((step, i) => {
              const isExpanded = expandedStep === step.id
              const showGroup = step.groupName && (i === 0 || detail.steps[i-1]?.groupName !== step.groupName)
              return (
                <div key={step.id}>
                  {showGroup && (
                    <div style={{ padding: '6px 12px', background: '#f6f7f9', borderRadius: 4, margin: '8px 0 4px', fontSize: 12, fontWeight: 500, color: '#595959' }}>
                      📁 {step.groupName}
                    </div>
                  )}
                  <div
                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderRadius: 4, marginBottom: 2,
                      background: isExpanded ? '#f0f5ff' : 'transparent',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#fafafa' }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                  >
                    {step.lastStatus === 'pass' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
                     step.lastStatus === 'fail' ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> :
                     <span style={{ width: 14, height: 14, borderRadius: 7, border: '2px solid #d9d9d9', display: 'inline-block' }} />}
                    <Tag color={METHOD_COLORS[step.method]} style={{ fontSize: 11, margin: 0, minWidth: 50, textAlign: 'center' }}>
                      {step.method}
                    </Tag>
                    <span style={{ fontSize: 13, flex: 1 }}>{step.name}</span>
                  </div>

                  {/* 展开的请求详情 */}
                  {isExpanded && (
                    <Card size="small" style={{ margin: '4px 0 8px 30px', background: '#fafafa' }}>
                      <div style={{ fontSize: 12, lineHeight: 2 }}>
                        <div><b>URL:</b> <code style={{ background: '#eff1f3', padding: '1px 6px', borderRadius: 3 }}>{step.url}</code></div>
                        {step.headers && Object.keys(step.headers).length > 0 && (
                          <div><b>Headers:</b> <code style={{ fontSize: 11 }}>{JSON.stringify(step.headers)}</code></div>
                        )}
                        {step.body && (
                          <div>
                            <b>Body:</b>
                            <pre style={{ background: '#161b22', color: '#e6edf3', padding: 8, borderRadius: 4, fontSize: 11, marginTop: 4, overflow: 'auto' }}>
                              {JSON.stringify(step.body, null, 2)}
                            </pre>
                          </div>
                        )}
                        {step.assertions && step.assertions.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <b>断言:</b>
                            {step.assertions.map((a, j) => (
                              <div key={j} style={{ marginLeft: 12, color: '#595959' }}>
                                ✓ {a.type} {a.field ? `(${a.field})` : ''} {a.operator} {JSON.stringify(a.value)}
                              </div>
                            ))}
                          </div>
                        )}
                        {step.variablesExtract && Object.keys(step.variablesExtract).length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <b>提取变量:</b> {Object.entries(step.variablesExtract).map(([k, v]) => `${k} ← ${v}`).join(', ')}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 生成弹窗 */}
      <Modal
        title="生成接口测试"
        open={genOpen}
        onCancel={() => { if (!generating) setGenOpen(false) }}
        width={600}
        footer={!generating ? [
          <Button key="cancel" onClick={() => setGenOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={handleGenerate}>开始生成</Button>,
        ] : null}
      >
        {!generating ? (
          <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item name="apiInfo" label="接口定义" rules={[{ required: true, message: '请输入接口信息' }]}>
              <TextArea rows={8} placeholder={"粘贴接口定义，例如：\n\n### POST /api/users — 创建用户\n参数:\n- username (string, required, 3-100位)\n- password (string, required, ≥6位)\n- role (string, required, enum: admin/user)\n需要认证：Bearer Token"} />
            </Form.Item>
            <Form.Item name="envVars" label="环境变量 (JSON)">
              <TextArea rows={3} placeholder={'{"BASE_URL": "http://localhost:8000", "ADMIN_USER": "admin", "ADMIN_PASS": "admin123"}'} />
            </Form.Item>
          </Form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <LoadingOutlined style={{ fontSize: 24 }} />
              <div style={{ marginTop: 8, fontWeight: 500 }}>正在生成测试场景...</div>
            </div>
            {genProgress.length > 0 && (
              <div style={{ padding: '8px 12px', background: '#f6f7f9', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                {genProgress.map((p, i) => <div key={i} style={{ fontSize: 12, color: '#595959', padding: '2px 0' }}>{p}</div>)}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
