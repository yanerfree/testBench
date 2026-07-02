import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Tag, Space, Typography, Modal, Form, Input, Select, Tabs,
  message, Popconfirm, Spin, Tree, Empty, Tooltip,
} from 'antd'
import {
  PlusOutlined, ThunderboltOutlined, DeleteOutlined, RobotOutlined,
  LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlayCircleOutlined, FolderOutlined, CaretRightOutlined, SendOutlined,
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
  const [selectedScenario, setSelectedScenario] = useState(null)
  const [selectedStep, setSelectedStep] = useState(null)
  const [genOpen, setGenOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState([])
  const [form] = Form.useForm()
  const [running, setRunning] = useState(false)
  const [runResponse, setRunResponse] = useState(null)

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

  const loadScenario = async (id) => {
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`)
      setSelectedScenario(res.data)
      setSelectedStep(null)
      setRunResponse(null)
    } catch { /* */ }
  }

  const handleDelete = async (id) => {
    await api.del(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`).catch(() => {})
    message.success('已删除')
    if (selectedScenario?.id === id) { setSelectedScenario(null); setSelectedStep(null) }
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
          if (data.type === 'scenario_created') setGenProgress(prev => [...prev, `📋 ${data.code} ${data.title} (${data.stepCount}步)`])
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

  const handleRunStep = async () => {
    if (!selectedStep) return
    setRunning(true); setRunResponse(null)
    try {
      const res = await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/run-step/${selectedStep.id}`)
      setRunResponse(res.data)
    } catch (e) {
      setRunResponse({ error: e.message || '执行失败' })
    } finally { setRunning(false) }
  }

  // 构建目录树
  const treeData = scenarios.map(s => ({
    key: s.id,
    title: (
      <span style={{ fontSize: 13 }}>
        <Tag color={PRIORITY_COLORS[s.priority]} style={{ fontSize: 10, padding: '0 4px', marginRight: 4 }}>{s.priority}</Tag>
        {s.title}
      </span>
    ),
    icon: <FolderOutlined />,
  }))

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* 左栏：目录树 */}
      <div style={{ width: 280, minWidth: 280, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>测试场景</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setGenOpen(true); form.resetFields() }}>
              生成
            </Button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> :
            scenarios.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无场景" style={{ marginTop: 60 }} />
            ) : (
              <Tree
                treeData={treeData}
                showIcon
                selectedKeys={selectedScenario ? [selectedScenario.id] : []}
                onSelect={(keys) => { if (keys[0]) loadScenario(keys[0]) }}
                style={{ background: 'transparent' }}
              />
            )
          }
        </div>
      </div>

      {/* 中栏：步骤列表 */}
      <div style={{ width: 320, minWidth: 320, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
        {selectedScenario ? (
          <>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedScenario.code}</span>
                <Space size={4}>
                  <Tooltip title="运行全部">
                    <Button size="small" type="text" icon={<PlayCircleOutlined style={{ color: '#52c41a' }} />} />
                  </Tooltip>
                  <Popconfirm title="确认删除？" onConfirm={() => handleDelete(selectedScenario.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>{selectedScenario.title}</Text>
              <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
                已选 {selectedScenario.steps?.length || 0} 项
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(selectedScenario.steps || []).map((step, i) => {
                const isSelected = selectedStep?.id === step.id
                const showGroup = step.groupName && (i === 0 || selectedScenario.steps[i-1]?.groupName !== step.groupName)
                return (
                  <div key={step.id}>
                    {showGroup && (
                      <div style={{ padding: '4px 12px', fontSize: 11, color: '#8c8c8c', background: '#f6f7f9' }}>
                        <CaretRightOutlined style={{ marginRight: 4 }} /> Group  {step.groupName}
                      </div>
                    )}
                    <div
                      onClick={() => { setSelectedStep(step); setRunResponse(null) }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer',
                        background: isSelected ? '#e6f4ff' : 'transparent',
                        borderLeft: isSelected ? '3px solid #1677ff' : '3px solid transparent',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      {step.lastStatus === 'pass' ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} /> :
                       step.lastStatus === 'fail' ? <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} /> :
                       <span style={{ width: 12, height: 12, borderRadius: 6, border: '1.5px solid #d9d9d9', display: 'inline-block', flexShrink: 0 }} />}
                      <Tag color={METHOD_COLORS[step.method]} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                        {step.method}
                      </Tag>
                      <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.name}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div style={{ padding: '8px 12px' }}>
                <Button type="dashed" size="small" icon={<PlusOutlined />} block style={{ fontSize: 12 }}>添加步骤</Button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bfbfbf' }}>
            <div style={{ textAlign: 'center' }}>
              <ThunderboltOutlined style={{ fontSize: 32, marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>选择场景</div>
            </div>
          </div>
        )}
      </div>

      {/* 右栏：请求编辑器 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedStep ? (
          <>
            {/* 顶部：步骤名 + 运行按钮 */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                {selectedStep.lastStatus === 'pass' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
                 selectedStep.lastStatus === 'fail' ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> : null}
                <span style={{ fontWeight: 500, fontSize: 14 }}>{selectedStep.name}</span>
              </Space>
              <Button
                type="primary"
                icon={running ? <LoadingOutlined /> : <SendOutlined />}
                loading={running}
                onClick={handleRunStep}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
              >
                运行
              </Button>
            </div>

            {/* URL 栏 */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tag color={METHOD_COLORS[selectedStep.method]} style={{ fontSize: 12, padding: '2px 8px', margin: 0 }}>
                {selectedStep.method}
              </Tag>
              <Input
                value={selectedStep.url}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>

            {/* Tab 栏：Body / Headers / 断言 / 变量 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
              <Tabs
                defaultActiveKey="body"
                size="small"
                items={[
                  {
                    key: 'body',
                    label: `Body${selectedStep.body ? ' ●' : ''}`,
                    children: selectedStep.body ? (
                      <pre style={{
                        background: '#161b22', color: '#e6edf3', padding: 12, borderRadius: 6,
                        fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, overflow: 'auto',
                        minHeight: 120, maxHeight: 300,
                      }}>
                        {JSON.stringify(selectedStep.body, null, 2)}
                      </pre>
                    ) : <Text type="secondary" style={{ fontSize: 12 }}>无请求体</Text>,
                  },
                  {
                    key: 'headers',
                    label: `Headers${selectedStep.headers && Object.keys(selectedStep.headers).length ? ` ${Object.keys(selectedStep.headers).length}` : ''}`,
                    children: selectedStep.headers && Object.keys(selectedStep.headers).length > 0 ? (
                      <div style={{ fontSize: 12 }}>
                        {Object.entries(selectedStep.headers).map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                            <span style={{ fontWeight: 500, minWidth: 140, color: '#333' }}>{k}</span>
                            <span style={{ color: '#595959', fontFamily: 'monospace' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    ) : <Text type="secondary" style={{ fontSize: 12 }}>无自定义 Headers</Text>,
                  },
                  {
                    key: 'assertions',
                    label: `断言${selectedStep.assertions?.length ? ` ${selectedStep.assertions.length}` : ''}`,
                    children: selectedStep.assertions?.length > 0 ? (
                      <div style={{ fontSize: 12 }}>
                        {selectedStep.assertions.map((a, j) => (
                          <div key={j} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f5f5', alignItems: 'center' }}>
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            <span>{a.type}</span>
                            {a.field && <Tag style={{ fontSize: 11 }}>{a.field}</Tag>}
                            <span style={{ color: '#1677ff' }}>{a.operator}</span>
                            <code style={{ background: '#eff1f3', padding: '1px 6px', borderRadius: 3 }}>{JSON.stringify(a.value)}</code>
                          </div>
                        ))}
                      </div>
                    ) : <Text type="secondary" style={{ fontSize: 12 }}>无断言</Text>,
                  },
                  {
                    key: 'variables',
                    label: '变量提取',
                    children: selectedStep.variablesExtract && Object.keys(selectedStep.variablesExtract).length > 0 ? (
                      <div style={{ fontSize: 12 }}>
                        {Object.entries(selectedStep.variablesExtract).map(([k, v]) => (
                          <div key={k} style={{ padding: '4px 0' }}>
                            <code style={{ color: '#d46b08' }}>${`{${k}}`}</code>
                            <span style={{ margin: '0 8px', color: '#8c8c8c' }}>←</span>
                            <code>{v}</code>
                          </div>
                        ))}
                      </div>
                    ) : <Text type="secondary" style={{ fontSize: 12 }}>无变量提取</Text>,
                  },
                  {
                    key: 'response',
                    label: `响应${runResponse ? ' ●' : ''}`,
                    children: runResponse ? (
                      <div>
                        {runResponse.error ? (
                          <div style={{ color: '#ff4d4f', fontSize: 13 }}>{runResponse.error}</div>
                        ) : (
                          <>
                            <div style={{ marginBottom: 8 }}>
                              <Tag color={runResponse.statusCode < 400 ? 'success' : 'error'}>{runResponse.statusCode}</Tag>
                              <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>{runResponse.duration}ms</span>
                            </div>
                            <pre style={{
                              background: '#161b22', color: '#e6edf3', padding: 12, borderRadius: 6,
                              fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5, overflow: 'auto', maxHeight: 400,
                            }}>
                              {JSON.stringify(runResponse.body, null, 2)}
                            </pre>
                          </>
                        )}
                      </div>
                    ) : <Text type="secondary" style={{ fontSize: 12 }}>点击「运行」查看响应</Text>,
                  },
                ]}
              />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bfbfbf' }}>
            <div style={{ textAlign: 'center' }}>
              <SendOutlined style={{ fontSize: 40, marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>选择步骤查看请求详情</div>
            </div>
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
            <Form.Item name="apiInfo" label="接口定义" rules={[{ required: true, message: '请输入' }]}>
              <TextArea rows={8} placeholder={"粘贴接口定义，例如：\n\n### POST /api/users — 创建用户\n参数:\n- username (string, required, 3-100位)\n- password (string, required, ≥6位)\n- role (string, required, enum: admin/user)\n需要认证：Bearer Token"} />
            </Form.Item>
            <Form.Item name="envVars" label="环境变量 (JSON)">
              <TextArea rows={3} placeholder={'{"BASE_URL": "http://localhost:8000", "ADMIN_USER": "admin"}'} />
            </Form.Item>
          </Form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <LoadingOutlined style={{ fontSize: 24 }} />
              <div style={{ marginTop: 8, fontWeight: 500 }}>正在生成...</div>
            </div>
            <div style={{ padding: '8px 12px', background: '#f6f7f9', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
              {genProgress.map((p, i) => <div key={i} style={{ fontSize: 12, color: '#595959', padding: '2px 0' }}>{p}</div>)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
