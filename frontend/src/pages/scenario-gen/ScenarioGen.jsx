import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Table, Tag, Space, Empty, message } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../../utils/request'
import WizardStepper from './components/WizardStepper'
import Stage1Input from './components/Stage1Input'
import Stage2Requirements from './components/Stage2Requirements'
import Stage3ScenarioModel from './components/Stage3ScenarioModel'
import Stage4Generation from './components/Stage4Generation'
import Stage5Review from './components/Stage5Review'

const STATUS_MAP = {
  extracting: { color: 'processing', label: '提取中' },
  model_ready: { color: 'warning', label: '待确认模型' },
  confirmed: { color: 'blue', label: '已确认' },
  generating: { color: 'processing', label: '生成中' },
  completed: { color: 'success', label: '已完成' },
  partial_failed: { color: 'warning', label: '部分失败' },
  failed: { color: 'error', label: '失败' },
  aborted: { color: 'default', label: '已中止' },
}

const STAGE_FROM_STATUS = {
  extracting: 'input',
  model_ready: 'model',
  confirmed: 'model',
  generating: 'generate',
  completed: 'review',
  partial_failed: 'generate',
  failed: 'generate',
  aborted: 'generate',
}

export default function ScenarioGen() {
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const taskId = searchParams.get('taskId')
  const navigate = useNavigate()

  if (taskId) {
    return <TaskDetail projectId={projectId} taskId={taskId} />
  }
  return <TaskCenter projectId={projectId} />
}

function TaskCenter({ projectId }) {
  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const branchId = localStorage.getItem(`branch_${projectId}`) || ''

  const fetchTasks = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/scenario-gen/tasks?page=${page}&pageSize=20`)
      setTasks(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch { /* request.js handles */ }
    finally { setLoading(false) }
  }, [projectId, branchId, page])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const columns = [
    {
      title: '任务名称', dataIndex: 'title', key: 'title',
      render: (t) => <span style={{ fontWeight: 500 }}>{t}</span>,
    },
    {
      title: '阶段', dataIndex: 'status', key: 'status',
      render: (s) => {
        const info = STATUS_MAP[s] || { color: 'default', label: s }
        return <Tag color={info.color}>{info.label}</Tag>
      },
    },
    {
      title: '进度', dataIndex: 'progress', key: 'progress',
      render: (p) => {
        if (!p) return '—'
        return `${p.succeeded || 0}/${p.total || '?'}`
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt',
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '—',
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#2e3138' }}>AI 生成手工测试用例</h3>
          <span style={{ fontSize: 12, color: '#8c919e' }}>从需求文档自动生成测试步骤（操作 + 预期结果），生成后进入用例管理待审核</span>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchTasks}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate(`/projects/${projectId}/scenario-gen?taskId=new`)}>
            新建生成任务
          </Button>
        </Space>
      </div>

      {!branchId ? (
        <Empty description="请先在顶部选择分支" />
      ) : (
        <Table
          dataSource={tasks}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage, showTotal: t => `共 ${t} 条` }}
          onRow={(record) => ({
            onClick: () => navigate(`/projects/${projectId}/scenario-gen?taskId=${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{ emptyText: (
            <Empty
              description={
                <div>
                  <p style={{ marginBottom: 8 }}>还没有生成任务</p>
                  <p style={{ fontSize: 12, color: '#8c919e' }}>
                    粘贴一份需求文档，AI 自动生成手工测试用例（操作步骤 + 预期结果），
                    审核通过后可加入测试计划执行
                  </p>
                </div>
              }
            >
              <Button type="primary" icon={<PlusOutlined />}
                onClick={() => navigate(`/projects/${projectId}/scenario-gen?taskId=new`)}>
                新建生成任务
              </Button>
            </Empty>
          )}}
        />
      )}
    </div>
  )
}

function TaskDetail({ projectId, taskId }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const branchId = localStorage.getItem(`branch_${projectId}`) || ''
  const stage = searchParams.get('stage') || 'input'

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (taskId === 'new' || !branchId) return
    setLoading(true)
    api.get(`/projects/${projectId}/branches/${branchId}/scenario-gen/tasks/${taskId}`)
      .then(res => {
        setTask(res.data)
        const autoStage = STAGE_FROM_STATUS[res.data.status] || 'input'
        if (!searchParams.get('stage')) {
          setSearchParams({ taskId, stage: autoStage }, { replace: true })
        }
      })
      .catch(() => message.error('任务不存在或加载失败'))
      .finally(() => setLoading(false))
  }, [taskId, branchId])

  const handleStageChange = (newStage) => {
    setSearchParams({ taskId, stage: newStage }, { replace: true })
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="text" onClick={() => navigate(`/projects/${projectId}/scenario-gen`)}
          style={{ color: '#8c919e' }}>
          ← 返回任务中心
        </Button>
        {task && <span style={{ color: '#2e3138', fontWeight: 500 }}>{task.title}</span>}
        {task && <Tag color={STATUS_MAP[task.status]?.color}>{STATUS_MAP[task.status]?.label}</Tag>}
      </div>

      <WizardStepper currentStage={stage} onStageClick={handleStageChange} taskStatus={task?.status} />

      <div style={{ marginTop: 24, padding: 24, background: 'rgba(255,255,255,0.6)', borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.04)', minHeight: 400 }}>
        {taskId === 'new' && stage === 'input' && (
          <Stage1Input
            projectId={projectId}
            branchId={branchId}
            onTaskCreated={(data) => {
              setTask(data)
              setSearchParams({ taskId: data.id, stage: 'requirements' }, { replace: true })
            }}
          />
        )}
        {taskId !== 'new' && stage === 'requirements' && (
          <Stage2Requirements
            projectId={projectId}
            branchId={branchId}
            taskId={taskId}
            docContent={task?.docContent}
            healthCheck={task?.healthCheck}
            onConfirm={(data) => {
              setTask(data)
              setSearchParams({ taskId, stage: 'model' }, { replace: true })
            }}
          />
        )}
        {stage === 'model' && (
          <Stage3ScenarioModel
            projectId={projectId}
            branchId={branchId}
            taskId={taskId}
            onConfirm={(data) => {
              setTask(data)
              setSearchParams({ taskId, stage: 'generate' }, { replace: true })
            }}
          />
        )}
        {stage === 'generate' && (
          <Stage4Generation
            projectId={projectId}
            branchId={branchId}
            taskId={taskId}
            onDone={(data) => {
              setSearchParams({ taskId, stage: 'review' }, { replace: true })
            }}
          />
        )}
        {stage === 'review' && (
          <Stage5Review
            projectId={projectId}
            branchId={branchId}
            taskId={taskId}
          />
        )}
      </div>
    </div>
  )
}
