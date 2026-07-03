import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Table, Tag, Space, Typography, Modal, Form, Input, InputNumber,
  message, Empty, Steps, Badge, Drawer, Select, Alert,
} from 'antd'
import {
  PlusOutlined, BugOutlined, ExclamationCircleOutlined, BulbOutlined,
  CheckCircleOutlined, ClockCircleOutlined, RobotOutlined, LoadingOutlined,
  PlayCircleOutlined, StopOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const FINDING_TYPES = { bug: { label: 'Bug', color: 'error', icon: <BugOutlined /> }, risk: { label: '风险', color: 'warning', icon: <ExclamationCircleOutlined /> }, suggestion: { label: '建议', color: 'blue', icon: <BulbOutlined /> } }
const SEVERITY_COLORS = { critical: '#e8453c', high: '#fa8c16', medium: '#4e8af0', low: '#8c8c8c' }

export default function Exploratory() {
  const { projectId } = useParams()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [activeSession, setActiveSession] = useState(null)
  const [findings, setFindings] = useState([])
  const [charterLoading, setCharterLoading] = useState(false)
  const [findingForm] = Form.useForm()
  const [createForm] = Form.useForm()

  const fetchSessions = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/exploratory/sessions`)
      setSessions(res.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      const res = await api.post(`/projects/${projectId}/exploratory/sessions`, {
        title: values.title,
        targetModule: values.targetModule,
        timeLimitMinutes: values.timeLimitMinutes || 30,
      })
      message.success('会话已创建')
      setCreateOpen(false)
      createForm.resetFields()
      fetchSessions()
      openSession(res.data.id)
    } catch { /* */ }
  }

  const openSession = async (sessionId) => {
    try {
      const res = await api.get(`/projects/${projectId}/exploratory/sessions/${sessionId}`)
      setActiveSession(res.data)
      setFindings(res.data.findings || [])
    } catch { /* */ }
  }

  const handleGenerateCharter = async () => {
    if (!activeSession) return
    setCharterLoading(true)
    api.stream(
      `/projects/${projectId}/exploratory/sessions/${activeSession.id}/generate-charter`,
      {},
      {
        onChunk: (data) => {
          if (data && data.charter) {
            setActiveSession(prev => ({ ...prev, charter: data.charter, checkpoints: data.charter.checkpoints, totalCheckpoints: data.charter.checkpoints?.length || 0 }))
          }
        },
        onDone: (data) => {
          if (data && data.charter) {
            setActiveSession(prev => ({ ...prev, charter: data.charter, checkpoints: data.charter.checkpoints, totalCheckpoints: data.charter.checkpoints?.length || 0 }))
            message.success('章程已生成')
          }
          setCharterLoading(false)
        },
        onError: (msg) => { message.error(msg); setCharterLoading(false) },
      }
    )
  }

  const handleAddFinding = async () => {
    try {
      const values = await findingForm.validateFields()
      await api.post(`/projects/${projectId}/exploratory/sessions/${activeSession.id}/findings`, values)
      findingForm.resetFields()
      openSession(activeSession.id)
      message.success('发现已记录')
    } catch { /* */ }
  }

  const handleCompleteCheckpoint = async () => {
    await api.post(`/projects/${projectId}/exploratory/sessions/${activeSession.id}/complete-checkpoint`)
    openSession(activeSession.id)
  }

  const handleComplete = async () => {
    await api.post(`/projects/${projectId}/exploratory/sessions/${activeSession.id}/complete`)
    message.success('会话已结束')
    openSession(activeSession.id)
    fetchSessions()
  }

  const sessionColumns = [
    { title: '标题', dataIndex: 'title', render: (t, r) => <a onClick={() => openSession(r.id)}>{t}</a> },
    { title: '目标模块', dataIndex: 'targetModule', width: 120 },
    { title: '状态', dataIndex: 'status', width: 100, render: (s) => s === 'completed' ? <Tag color="success">已完成</Tag> : <Tag color="processing">进行中</Tag> },
    { title: '进度', width: 120, render: (_, r) => <span>{r.completedCheckpoints}/{r.totalCheckpoints} 检查点</span> },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (t) => t?.slice(0, 16).replace('T', ' ') },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}><BugOutlined style={{ marginRight: 8 }} />探索测试</h2>
          <Text type="secondary" style={{ fontSize: 13 }}>AI 辅助探索测试：生成章程 → 引导检查 → 记录发现 → 输出报告</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建会话</Button>
      </div>

      {sessions.length === 0 && !loading ? (
        <Card><Empty description="暂无探索测试会话" /></Card>
      ) : (
        <Table rowKey="id" columns={sessionColumns} dataSource={sessions} loading={loading} pagination={false} size="small" />
      )}

      {/* 新建会话 */}
      <Modal title="新建探索测试会话" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={handleCreate}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="会话标题" rules={[{ required: true }]}>
            <Input placeholder="例如：用户管理模块探索测试" />
          </Form.Item>
          <Form.Item name="targetModule" label="目标模块">
            <Input placeholder="例如：用户管理" />
          </Form.Item>
          <Form.Item name="timeLimitMinutes" label="时间限制（分钟）" initialValue={30}>
            <InputNumber min={10} max={120} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 会话详情 Drawer */}
      <Drawer
        title={activeSession ? `探索测试: ${activeSession.title}` : ''}
        open={!!activeSession}
        onClose={() => setActiveSession(null)}
        width={700}
      >
        {activeSession && (
          <div>
            {/* 章程区 */}
            {!activeSession.charter ? (
              <Card size="small" style={{ marginBottom: 16, borderColor: '#4e8af0' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text strong>还没有章程，让 AI 生成一份？</Text>
                  <Text type="secondary">AI 会根据项目 API 接口分析，自动生成检查点和探索建议</Text>
                  <Button type="primary" icon={charterLoading ? <LoadingOutlined /> : <RobotOutlined />}
                    loading={charterLoading} onClick={handleGenerateCharter}>
                    AI 生成章程
                  </Button>
                </Space>
              </Card>
            ) : (
              <Card size="small" style={{ marginBottom: 16 }} title={<Space><CheckCircleOutlined style={{ color: '#0ea5a0' }} /> 探索章程</Space>}>
                <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                  <div><Text strong>目标：</Text>{activeSession.charter.objective}</div>
                  {activeSession.charter.riskAreas?.length > 0 && (
                    <div><Text strong>风险区域：</Text>{activeSession.charter.riskAreas.join('、')}</div>
                  )}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Text strong>检查点 ({activeSession.completedCheckpoints}/{activeSession.totalCheckpoints})：</Text>
                  <div style={{ marginTop: 8 }}>
                    {(activeSession.checkpoints || []).map((cp, i) => (
                      <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                        <Space>
                          {i < activeSession.completedCheckpoints
                            ? <CheckCircleOutlined style={{ color: '#0ea5a0' }} />
                            : <ClockCircleOutlined style={{ color: '#d9d9d9' }} />}
                          <Text>{cp.title}</Text>
                          <Tag>{cp.priority}</Tag>
                        </Space>
                      </div>
                    ))}
                  </div>
                  {activeSession.status === 'active' && (
                    <Space style={{ marginTop: 8 }}>
                      <Button size="small" type="primary" ghost onClick={handleCompleteCheckpoint}
                        disabled={activeSession.completedCheckpoints >= activeSession.totalCheckpoints}>
                        完成当前检查点
                      </Button>
                      <Button size="small" danger onClick={handleComplete}>结束会话</Button>
                    </Space>
                  )}
                </div>
                {activeSession.charter.explorationHints?.length > 0 && (
                  <Alert type="info" showIcon style={{ marginTop: 12 }}
                    message="AI 探索建议"
                    description={activeSession.charter.explorationHints.map((h, i) => <div key={i}>• {h}</div>)} />
                )}
              </Card>
            )}

            {/* 记录发现 */}
            {activeSession.status === 'active' && (
              <Card size="small" style={{ marginBottom: 16 }} title="记录发现">
                <Form form={findingForm} layout="vertical" size="small">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Form.Item name="findingType" label="类型" rules={[{ required: true }]} initialValue="bug">
                      <Select options={[{ value: 'bug', label: 'Bug' }, { value: 'risk', label: '风险' }, { value: 'suggestion', label: '改进建议' }]} />
                    </Form.Item>
                    <Form.Item name="severity" label="严重度" initialValue="medium">
                      <Select options={[{ value: 'critical', label: '严重' }, { value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]} />
                    </Form.Item>
                  </div>
                  <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                    <Input placeholder="简述发现的问题" />
                  </Form.Item>
                  <Form.Item name="description" label="详细描述">
                    <TextArea rows={3} placeholder="详细描述问题、复现步骤、影响范围" />
                  </Form.Item>
                  <Button type="primary" onClick={handleAddFinding} block>记录发现</Button>
                </Form>
              </Card>
            )}

            {/* 发现列表 */}
            <Card size="small" title={`发现列表 (${findings.length})`}>
              {findings.length === 0 ? <Empty description="暂无发现" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                findings.map(f => (
                  <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <Space>
                      {FINDING_TYPES[f.findingType]?.icon}
                      <Tag color={FINDING_TYPES[f.findingType]?.color}>{FINDING_TYPES[f.findingType]?.label}</Tag>
                      <Tag style={{ color: SEVERITY_COLORS[f.severity] }}>{f.severity}</Tag>
                      <Text strong>{f.title}</Text>
                    </Space>
                    {f.description && <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0 28px' }}>{f.description}</Paragraph>}
                  </div>
                ))
              )}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  )
}
