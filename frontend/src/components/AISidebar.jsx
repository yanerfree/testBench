import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Drawer, Button, Input, Form, Select, Tag, Space, Steps, message,
  Typography, Card, Badge, Tooltip, Collapse,
} from 'antd'
import {
  RobotOutlined, SendOutlined, CloseOutlined, LoadingOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, ThunderboltOutlined,
  FileTextOutlined, StopOutlined,
} from '@ant-design/icons'
import { api } from '../utils/request'

const { Text, Paragraph } = Typography
const { TextArea } = Input

export default function AISidebar() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState([])
  const [generatedCases, setGeneratedCases] = useState([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [stepStatuses, setStepStatuses] = useState({})
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [branchId, setBranchId] = useState(null)
  const abortRef = useRef(null)
  const [form] = Form.useForm()

  const projectMatch = location.pathname.match(/\/projects\/([^/]+)/)
  const projectId = projectMatch?.[1]
  const isProjectPage = !!projectId

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/branches`).then(res => {
      const branches = res.data || []
      const active = branches.find(b => b.status === 'active') || branches[0]
      if (active) setBranchId(active.id)
    }).catch(() => {})
  }, [projectId])

  const resetState = () => {
    setEvents([])
    setGeneratedCases([])
    setCurrentStep(-1)
    setStepStatuses({})
    setResult(null)
    setError(null)
  }

  const handleRun = async () => {
    try {
      const values = await form.validateFields()
      if (!branchId) {
        message.error('请先进入项目的用例管理页面')
        return
      }

      resetState()
      setRunning(true)

      const url = `/projects/${projectId}/branches/${branchId}/skills/tb-case-generate`
      const body = {
        interfaceInfo: values.interfaceInfo,
        businessRules: (values.businessRules || '').split('\n').filter(r => r.trim()),
        module: values.module,
        submodule: values.submodule || undefined,
      }

      const { abort } = api.stream(url, body, {
        onChunk: (data) => {
          setEvents(prev => [...prev, data])

          if (data.type === 'step_start') {
            setCurrentStep(data.step)
            setStepStatuses(prev => ({ ...prev, [data.step]: 'process' }))
          } else if (data.type === 'step_done') {
            setStepStatuses(prev => ({ ...prev, [data.step]: 'finish' }))
          } else if (data.type === 'case_generated') {
            setGeneratedCases(prev => [...prev, data])
          } else if (data.type === 'error') {
            setError(data.message)
            setRunning(false)
          }
        },
        onDone: (data) => {
          if (data && data.imported !== undefined) {
            setResult(data)
          }
          setRunning(false)
        },
        onError: (msg) => {
          setError(msg)
          setRunning(false)
        },
      })

      abortRef.current = abort
    } catch { /* validation error */ }
  }

  const handleStop = () => {
    abortRef.current?.()
    setRunning(false)
  }

  if (!isProjectPage) return null

  const stepItems = [
    { title: '上下文收集', status: stepStatuses[1] || 'wait' },
    { title: '维度规划 + 生成', status: stepStatuses[2] || 'wait' },
    { title: '解析入库', status: stepStatuses[3] || 'wait' },
  ]

  return (
    <>
      <Tooltip title="AI 助手" placement="left">
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={running ? <LoadingOutlined /> : <RobotOutlined />}
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 1000,
            width: 48,
            height: 48,
            boxShadow: '0 4px 12px rgba(0,185,107,0.4)',
          }}
        />
      </Tooltip>

      {generatedCases.length > 0 && !open && (
        <Badge
          count={generatedCases.length}
          style={{ position: 'fixed', right: 20, bottom: 64, zIndex: 1001 }}
        />
      )}

      <Drawer
        title={
          <Space>
            <RobotOutlined />
            <span>AI 用例生成</span>
            {running && <Tag color="processing" icon={<LoadingOutlined />}>运行中</Tag>}
          </Space>
        }
        placement="right"
        width={420}
        open={open}
        onClose={() => setOpen(false)}
        extra={running && (
          <Button size="small" danger icon={<StopOutlined />} onClick={handleStop}>
            停止
          </Button>
        )}
      >
        {/* 输入表单 */}
        {!running && !result && (
          <Form form={form} layout="vertical">
            <Form.Item
              name="interfaceInfo"
              label="接口信息"
              rules={[{ required: true, message: '请输入接口信息' }]}
            >
              <TextArea
                rows={4}
                placeholder={"POST /api/users 创建用户\n请求: {username, email, password}\n响应: 201 {id, username}"}
              />
            </Form.Item>

            <Form.Item name="businessRules" label="业务规则（每行一条）">
              <TextArea
                rows={3}
                placeholder={"用户名 3-20 字符\n邮箱必须唯一\n密码至少 8 位"}
              />
            </Form.Item>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Form.Item
                name="module"
                label="模块"
                rules={[{ required: true, message: '请输入模块名' }]}
              >
                <Input placeholder="用户管理" />
              </Form.Item>
              <Form.Item name="submodule" label="子模块">
                <Input placeholder="注册（可选）" />
              </Form.Item>
            </div>

            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleRun}
              block
              size="large"
            >
              开始生成
            </Button>
          </Form>
        )}

        {/* 执行进度 */}
        {(running || result || error) && (
          <div>
            <Steps
              direction="vertical"
              size="small"
              current={currentStep - 1}
              items={stepItems}
              style={{ marginBottom: 16 }}
            />

            {/* 生成的用例列表 */}
            {generatedCases.length > 0 && (
              <Card
                size="small"
                title={
                  <Space>
                    <FileTextOutlined />
                    <span>已生成 {generatedCases.length} 条用例</span>
                  </Space>
                }
                style={{ marginBottom: 16 }}
              >
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  {generatedCases.map((c, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <Space size={4}>
                        <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                        <Tag style={{ fontSize: 11 }}>{c.priority}</Tag>
                        <Text style={{ fontSize: 13 }}>{c.title}</Text>
                      </Space>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 20 }}>{c.caseCode}</Text>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* 最终结果 */}
            {result && (
              <Card size="small" style={{ borderColor: '#52c41a', background: '#f6ffed' }}>
                <Space direction="vertical" size={4}>
                  <Text strong>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} /> 生成完成
                  </Text>
                  <Text>入库 {result.imported} 条，跳过 {result.skipped} 条</Text>
                  {result.priorities && (
                    <Space size={4}>
                      {Object.entries(result.priorities).map(([k, v]) => (
                        <Tag key={k}>{k}: {v}</Tag>
                      ))}
                    </Space>
                  )}
                </Space>
                <div style={{ marginTop: 12 }}>
                  <Button type="primary" ghost onClick={resetState} block>
                    再生成一批
                  </Button>
                </div>
              </Card>
            )}

            {/* 错误 */}
            {error && (
              <Card size="small" style={{ borderColor: '#ff4d4f', background: '#fff2f0' }}>
                <Space direction="vertical" size={4}>
                  <Text type="danger">
                    <ExclamationCircleOutlined /> 生成失败
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{error}</Text>
                </Space>
                <div style={{ marginTop: 12 }}>
                  <Button onClick={resetState} block>重试</Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </>
  )
}
