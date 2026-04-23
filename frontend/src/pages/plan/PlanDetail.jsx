import { useState, useEffect, useCallback } from 'react'
import { Card, Tag, Button, Descriptions, Space, Spin, Empty, message, Input, Modal, Table } from 'antd'
import { ClockCircleOutlined, EditOutlined, PlayCircleOutlined, CheckOutlined, ArrowLeftOutlined, SaveOutlined, SearchOutlined, SyncOutlined, BarChartOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../utils/request'

const planStatusMap = {
  draft: { label: '草稿', color: '#bfc4cd', bg: '#f5f5f7' },
  executing: { label: '执行中', color: '#7c8cf8', bg: '#eef0fe' },
  completed: { label: '已完成', color: '#6ecf96', bg: '#eefbf3' },
  paused: { label: '已暂停', color: '#f5b87a', bg: '#fef5eb' },
  pending_manual: { label: '待手动录入', color: '#a78bfa', bg: '#f3f0fe' },
  archived: { label: '已归档', color: '#a8adb6', bg: '#f5f5f7' },
}

function fmt(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}

export default function PlanDetail() {
  const navigate = useNavigate()
  const { projectId, planId } = useParams()
  const [searchParams] = useSearchParams()
  const [plan, setPlan] = useState(null)
  const [executions, setExecutions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [casePickerOpen, setCasePickerOpen] = useState(false)
  const [pickerSelected, setPickerSelected] = useState([])
  const [availableCases, setAvailableCases] = useState([])
  const [caseSearch, setCaseSearch] = useState('')
  const [caseSaving, setCaseSaving] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [execMessage, setExecMessage] = useState('')

  const fetchData = useCallback(async () => {
    if (!projectId || !planId) return
    setLoading(true)
    try {
      const [planRes, execRes] = await Promise.all([
        api.get(`/projects/${projectId}/plans/${planId}`),
        api.get(`/projects/${projectId}/plans/${planId}/executions`),
      ])
      setPlan(planRes.data)
      setExecutions(execRes.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, planId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (plan && searchParams.get('edit') === 'cases' && ['draft', 'completed', 'paused'].includes(plan.status)) {
      openCasePicker()
    }
  }, [plan?.id])

  const handleExecute = async () => {
    try {
      const res = await api.post(`/projects/${projectId}/plans/${planId}/execute`)
      fetchData()
      const taskId = res.data?.taskId
      if (!taskId) return
      setExecuting(true)
      setExecMessage('排队中...')
      const poll = setInterval(async () => {
        try {
          const status = await api.get(`/tasks/${taskId}/status`)
          const s = status.data
          setExecMessage(s.message || s.status)
          if (s.status === 'running') fetchData()
          if (s.status === 'completed') {
            clearInterval(poll)
            setExecuting(false)
            setExecMessage('')
            message.success('执行完成')
            fetchData()
          } else if (s.status === 'failed') {
            clearInterval(poll)
            setExecuting(false)
            setExecMessage('')
            message.error(s.message || '执行失败')
            fetchData()
          }
        } catch { /* */ }
      }, 3000)
    } catch (err) {
      message.error(err?.response?.data?.error?.message || err?.message || '执行失败')
    }
  }

  const handleComplete = async () => {
    try {
      await api.post(`/projects/${projectId}/plans/${planId}/complete`)
      message.success('计划已完成')
      fetchData()
    } catch (err) {
      message.error(err?.response?.data?.error?.message || err?.message || '操作失败')
    }
  }

  const handleSave = async () => {
    if (!editName.trim()) { message.warning('计划名称不能为空'); return }
    try {
      await api.put(`/projects/${projectId}/plans/${planId}`, { name: editName })
      message.success('保存成功')
      setEditing(false)
      fetchData()
    } catch (err) {
      message.error(err?.response?.data?.error?.message || err?.message || '保存失败')
    }
  }

  const startEdit = () => { setEditName(plan?.name || ''); setEditing(true) }

  const openCasePicker = async () => {
    setPickerSelected(plan?.caseIds || [])
    setCaseSearch('')
    try {
      const brRes = await api.get(`/projects/${projectId}/branches`)
      const active = (brRes.data || []).find(b => b.status === 'active')
      if (active) {
        const caseRes = await api.get(`/projects/${projectId}/branches/${active.id}/cases?pageSize=100`)
        setAvailableCases(caseRes.data || [])
      }
    } catch { /* */ }
    setCasePickerOpen(true)
  }

  const handleCaseSave = async () => {
    if (pickerSelected.length === 0) { message.warning('请至少选择 1 条用例'); return }
    setCaseSaving(true)
    try {
      await api.put(`/projects/${projectId}/plans/${planId}`, { caseIds: pickerSelected })
      message.success('用例已更新')
      setCasePickerOpen(false)
      fetchData()
    } catch (err) {
      message.error(err?.response?.data?.error?.message || err?.message || '保存失败')
    } finally { setCaseSaving(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  if (!plan) return <Empty description="计划不存在" />

  const ps = planStatusMap[plan.status] || planStatusMap.draft

  return (
    <div>
      {/* Header */}
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
              {editing ? (
                <Input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: 300, fontSize: 18, fontWeight: 600 }}
                  onPressEnter={handleSave} autoFocus />
              ) : (
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{plan.name}</h2>
              )}
              <Tag style={{ background: ps.bg, color: ps.color, border: 'none' }}>{ps.label}</Tag>
              {executing && <Tag icon={<SyncOutlined spin />} color="processing">{execMessage}</Tag>}
              <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{plan.planType === 'automated' ? '自动化' : '手动'}</Tag>
              <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{plan.testType?.toUpperCase()}</Tag>
            </div>
            <Space size={20} style={{ fontSize: 13, color: '#86909c', paddingLeft: 40 }}>
              <span><ClockCircleOutlined style={{ marginRight: 4 }} />创建于 {new Date(plan.createdAt).toLocaleString('zh-CN')}</span>
              {plan.executedAt && <span>执行于 {new Date(plan.executedAt).toLocaleString('zh-CN')}</span>}
            </Space>
          </div>
          <Space>
            {plan.status === 'draft' && !editing && (
              <Button icon={<EditOutlined />} onClick={startEdit}>编辑</Button>
            )}
            {editing && (<>
              <Button onClick={() => setEditing(false)}>取消</Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
            </>)}
            {plan.status === 'draft' && !editing && (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExecute} loading={executing}>启动执行</Button>
            )}
            {(plan.status === 'completed' || plan.status === 'paused') && !executing && (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExecute} loading={executing}>重新执行</Button>
            )}
            {plan.status === 'pending_manual' && !executing && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`/projects/${projectId}/plans/${planId}/manual-record`)}>手动录入</Button>
            )}
            {(plan.status === 'pending_manual' || plan.status === 'executing') && !executing && (
              <Button type="primary" icon={<CheckOutlined />} onClick={handleComplete}>确认完成</Button>
            )}
          </Space>
        </div>
      </Card>

      {/* Plan Config */}
      <Card style={{ marginBottom: 8 }} title={<span style={{ fontSize: 14, fontWeight: 600 }}>计划配置</span>}
        styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 }, body: { padding: '12px 24px' } }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="计划类型">{plan.planType === 'automated' ? '自动化' : '手动'}</Descriptions.Item>
          <Descriptions.Item label="测试类型">{plan.testType?.toUpperCase()}</Descriptions.Item>
          <Descriptions.Item label="失败重试">{plan.retryCount} 次</Descriptions.Item>
          <Descriptions.Item label="关联用例">
            <Space size={8}>
              <span>{plan.caseIds?.length || 0} 条</span>
              {['draft', 'completed', 'paused'].includes(plan.status) && <Button type="link" size="small" style={{ padding: 0 }} onClick={openCasePicker}>修改用例</Button>}
            </Space>
          </Descriptions.Item>
          {plan.circuitBreaker && <>
            <Descriptions.Item label="熔断-连续失败">{plan.circuitBreaker.consecutive} 条</Descriptions.Item>
            <Descriptions.Item label="熔断-失败率">{plan.circuitBreaker.rate}%</Descriptions.Item>
          </>}
        </Descriptions>
      </Card>

      {/* Execution History */}
      <Card title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>执行历史</span>
          <span style={{ fontSize: 13, color: '#86909c', fontWeight: 400 }}>共 {executions.length} 次执行</span>
        </div>
      } styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 } }}>
        {executions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#bfc4cd' }}>
            {plan.status === 'draft' ? '尚未执行，点击上方"启动执行"开始' : '暂无执行记录'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Table Header */}
            <div style={{ display: 'flex', padding: '8px 16px', background: '#f7f8fa', borderRadius: '6px 6px 0 0', fontSize: 12, color: '#86909c', fontWeight: 500 }}>
              <div style={{ width: 50 }}>#</div>
              <div style={{ flex: 3 }}>执行时间</div>
              <div style={{ flex: 2, textAlign: 'center' }}>状态</div>
              <div style={{ flex: 3 }}>结果</div>
              <div style={{ flex: 2, textAlign: 'center' }}>通过率</div>
              <div style={{ flex: 2, textAlign: 'right' }}>耗时</div>
              <div style={{ flex: 2, textAlign: 'center' }}>操作</div>
            </div>
            {executions.map((exec, i) => {
              const num = executions.length - i
              const isCompleted = !!exec.completedAt
              const isRunning = !exec.completedAt && exec.passed === 0 && exec.failed === 0
              return (
                <div key={exec.id} style={{
                  display: 'flex', alignItems: 'center', padding: '12px 16px',
                  borderBottom: '1px solid #f5f5f7', fontSize: 13,
                }}>
                  <div style={{ width: 50, color: '#86909c', fontWeight: 600 }}>#{num}</div>
                  <div style={{ flex: 3, color: '#4a4a4a' }}>
                    {exec.executedAt ? new Date(exec.executedAt).toLocaleString('zh-CN') : '-'}
                  </div>
                  <div style={{ flex: 2, textAlign: 'center' }}>
                    {isRunning ? (
                      <Tag icon={<SyncOutlined spin />} color="processing">执行中</Tag>
                    ) : (
                      <Tag style={{ background: isCompleted ? '#eefbf3' : '#eef0fe', color: isCompleted ? '#6ecf96' : '#7c8cf8', border: 'none' }}>
                        {isCompleted ? '已完成' : '进行中'}
                      </Tag>
                    )}
                  </div>
                  <div style={{ flex: 3 }}>
                    <span style={{ color: '#6ecf96', fontWeight: 500 }}>{exec.passed}</span>
                    <span style={{ color: '#86909c' }}> / </span>
                    <span style={{ color: '#f08a8e', fontWeight: 500 }}>{exec.failed + exec.error}</span>
                    <span style={{ color: '#86909c' }}> / </span>
                    <span>{exec.totalScenarios}</span>
                    <span style={{ color: '#c0c4cc', marginLeft: 4, fontSize: 11 }}>(通过/失败/总计)</span>
                  </div>
                  <div style={{ flex: 2, textAlign: 'center' }}>
                    {exec.passRate != null ? (
                      <span style={{ fontWeight: 600, color: exec.passRate >= 95 ? '#6ecf96' : exec.passRate >= 80 ? '#f5b87a' : '#f08a8e' }}>
                        {exec.passRate}%
                      </span>
                    ) : '-'}
                  </div>
                  <div style={{ flex: 2, textAlign: 'right', fontFamily: 'monospace', color: '#86909c' }}>
                    {fmt(exec.totalDurationMs)}
                  </div>
                  <div style={{ flex: 2, textAlign: 'center' }}>
                    <Button type="link" size="small" icon={<BarChartOutlined />}
                      onClick={() => navigate(`/projects/${projectId}/reports/${planId}`)}>
                      查看报告
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Case Picker Modal */}
      <Modal title="修改关联用例" open={casePickerOpen} width={800}
        onOk={handleCaseSave} onCancel={() => setCasePickerOpen(false)}
        okText="确定" cancelText="取消" confirmLoading={caseSaving}>
        <Input placeholder="搜索用例编号或标题" value={caseSearch} onChange={e => setCaseSearch(e.target.value)}
          allowClear style={{ marginBottom: 12 }} prefix={<SearchOutlined style={{ color: '#c2c6cf' }} />} />
        <Table size="small" rowKey="id" pagination={{ pageSize: 10, size: 'small', showTotal: t => `共 ${t} 条` }}
          rowSelection={{
            selectedRowKeys: pickerSelected,
            onChange: keys => setPickerSelected(keys),
          }}
          dataSource={availableCases.filter(c =>
            !caseSearch || (c.caseCode + ' ' + c.title).toLowerCase().includes(caseSearch.toLowerCase())
          )}
          columns={[
            { title: '编号', dataIndex: 'caseCode', width: 120, render: v => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
            { title: '标题', dataIndex: 'title', ellipsis: true },
            { title: '优先级', dataIndex: 'priority', width: 70, align: 'center', render: v => <Tag>{v}</Tag> },
            { title: '类型', dataIndex: 'type', width: 60, align: 'center', render: v => v?.toUpperCase() },
          ]}
        />
      </Modal>
    </div>
  )
}
