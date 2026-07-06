import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Drawer, Button, Input, Form, Tag, Space, Steps, message, Alert,
  Typography, Card, Badge,
} from 'antd'
import {
  RobotOutlined, LoadingOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, ThunderboltOutlined,
  FileTextOutlined, StopOutlined, BulbOutlined,
} from '@ant-design/icons'
import { api } from '../utils/request'

const { Text } = Typography
const { TextArea } = Input

export default function AISidebar() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
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
        message.error('无法获取项目分支，请刷新页面重试')
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
    { title: '上下文收集', description: '读取项目 API 和已有用例', status: stepStatuses[1] || 'wait' },
    { title: '维度规划 + 生成', description: 'AI 多维度生成测试用例', status: stepStatuses[2] || 'wait' },
    { title: '解析入库', description: '解析结果并写入系统', status: stepStatuses[3] || 'wait' },
  ]

  const showForm = !running && !result && !error

  return (
    <>
      {/* ── 浮动入口按钮：带文字标签 ── */}
      <div
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(14,165,160,0.12)', color: '#0ea5a0',
          padding: '10px 18px 10px 14px',
          borderRadius: 24,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,185,107,0.4)',
          fontSize: 14,
          fontWeight: 500,
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {running ? <LoadingOutlined style={{ fontSize: 18 }} /> : <RobotOutlined style={{ fontSize: 18 }} />}
        <span>{running ? 'AI 生成中...' : 'AI 生成用例'}</span>
        {generatedCases.length > 0 && !open && (
          <Badge count={generatedCases.length} size="small" style={{ marginLeft: 4 }} />
        )}
      </div>

      {/* ── 侧边栏 Drawer ── */}
      <Drawer
        title={
          <Space>
            <RobotOutlined />
            <span>AI 用例生成</span>
            {running && <Tag color="processing" icon={<LoadingOutlined />}>运行中</Tag>}
          </Space>
        }
        placement="right"
        width={440}
        open={open}
        onClose={() => setOpen(false)}
        extra={running && (
          <Button size="small" danger icon={<StopOutlined />} onClick={handleStop}>
            停止
          </Button>
        )}
      >
        {/* ── 输入表单 ── */}
        {showForm && (
          <>
            <Alert
              type="info"
              showIcon
              icon={<BulbOutlined />}
              message="使用说明"
              description={
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  1. 填写要测试的 <b>接口信息</b>（URL、请求参数、响应格式）<br/>
                  2. 填写 <b>业务规则</b>（每行一条，如"用户名唯一"）<br/>
                  3. 指定 <b>模块名称</b>，生成的用例会归入该模块<br/>
                  4. 点击"开始生成"，AI 会自动从 6 个维度生成测试用例并入库
                </div>
              }
              style={{ marginBottom: 16 }}
              closable
            />

            <Form form={form} layout="vertical">
              <Form.Item
                name="interfaceInfo"
                label="接口信息"
                rules={[{ required: true, message: '请输入接口信息' }]}
                tooltip="填写接口的 HTTP 方法、路径、请求参数和响应格式"
              >
                <TextArea
                  rows={4}
                  placeholder={"POST /api/users 创建用户\n请求: {username: string, email: string}\n响应: 201 {id, username, email}"}
                />
              </Form.Item>

              <Form.Item
                name="businessRules"
                label="业务规则"
                tooltip="每行写一条规则，AI 会针对每条规则生成对应的测试用例"
              >
                <TextArea
                  rows={3}
                  placeholder={"用户名 3-20 字符\n邮箱必须唯一\n密码至少 8 位含大小写"}
                />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Form.Item
                  name="module"
                  label="模块"
                  rules={[{ required: true, message: '请输入模块名' }]}
                  tooltip="用例会归入此模块文件夹"
                >
                  <Input placeholder="用户管理" />
                </Form.Item>
                <Form.Item name="submodule" label="子模块" tooltip="可选，进一步细分">
                  <Input placeholder="注册" />
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

              <div style={{ marginTop: 12, padding: '8px 12px', background: '#f9f9f9', borderRadius: 6, fontSize: 12, color: '#86909c' }}>
                AI 会从 <b>正向流程、参数验证、业务规则、边界值、异常场景、安全</b> 六个维度自动生成测试用例，
                并去重后直接入库到用例管理中。
              </div>
            </Form>
          </>
        )}

        {/* ── 执行进度 ── */}
        {(running || result || error) && (
          <div>
            <Steps
              direction="vertical"
              size="small"
              current={currentStep - 1}
              items={stepItems}
              style={{ marginBottom: 16 }}
            />

            {generatedCases.length > 0 && (
              <Card
                size="small"
                title={
                  <Space>
                    <FileTextOutlined />
                    <span>已生成 {generatedCases.length} 条用例</span>
                    {running && <Text type="secondary" style={{ fontSize: 11 }}>（实时更新）</Text>}
                  </Space>
                }
                style={{ marginBottom: 16 }}
              >
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                  {generatedCases.map((c, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <Space size={4}>
                        <CheckCircleOutlined style={{ color: '#0ea5a0', fontSize: 12 }} />
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

            {result && (
              <Card size="small" style={{ borderColor: 'rgba(14,165,160,0.3)', background: '#e0f7f6' }}>
                <Space direction="vertical" size={4}>
                  <Text strong>
                    <CheckCircleOutlined style={{ color: '#0ea5a0' }} /> 生成完成
                  </Text>
                  <Text>入库 {result.imported} 条，跳过 {result.skipped} 条</Text>
                  {result.priorities && (
                    <Space size={4}>
                      {Object.entries(result.priorities).map(([k, v]) => (
                        <Tag key={k}>{k}: {v}</Tag>
                      ))}
                    </Space>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    刷新用例列表即可看到新生成的用例
                  </Text>
                </Space>
                <div style={{ marginTop: 12 }}>
                  <Button type="primary" ghost onClick={resetState} block>
                    再生成一批
                  </Button>
                </div>
              </Card>
            )}

            {error && (
              <Card size="small" style={{ borderColor: '#e8453c', background: '#fff2f0' }}>
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
