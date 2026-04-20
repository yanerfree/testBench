import { useState, useEffect, useCallback } from 'react'
import { Card, Tag, Button, Radio, Input, Space, Modal, Form, Select, InputNumber, Table, message, Empty, Spin } from 'antd'
import { PlusOutlined, SearchOutlined, ClockCircleOutlined, UserOutlined, ReloadOutlined, PlayCircleOutlined, EditOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const statusStyle = {
  draft: { label: '草稿', color: '#bfc4cd', bg: '#f5f5f7' },
  executing: { label: '执行中', color: '#7c8cf8', bg: '#eef0fe' },
  paused: { label: '已暂停', color: '#f5b87a', bg: '#fef5eb' },
  pending_manual: { label: '待手动录入', color: '#a78bfa', bg: '#f3f0fe' },
  completed: { label: '已完成', color: '#6ecf96', bg: '#eefbf3' },
  archived: { label: '已归档', color: '#a8adb6', bg: '#f5f5f7' },
}

export default function PlanList() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [plans, setPlans] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  // 创建弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const planType = Form.useWatch('planType', form)

  // 弹窗数据源
  const [branches, setBranches] = useState([])
  const [cases, setCases] = useState([])
  const [environments, setEnvironments] = useState([])
  const [channels, setChannels] = useState([])
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [casePickerOpen, setCasePickerOpen] = useState(false)
  const [caseSearch, setCaseSearch] = useState('')

  // 加载计划列表
  const fetchPlans = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 20 })
      if (tab) params.set('status', tab)
      const res = await api.get(`/projects/${projectId}/plans?${params}`)
      setPlans(res.data || [])
      setTotal(res.pagination?.total || 0)
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, tab, page])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  // 打开创建弹窗时加载数据源
  const openCreate = async () => {
    form.resetFields()
    setCreateOpen(true)
    try {
      const [brRes, envRes, chRes] = await Promise.all([
        api.get(`/projects/${projectId}/branches`),
        api.get('/environments'),
        api.get('/channels'),
      ])
      setBranches(brRes.data || [])
      setEnvironments(envRes.data || [])
      setChannels(chRes.data || [])
      // 默认选第一个活跃分支
      const active = (brRes.data || []).find(b => b.status === 'active')
      if (active) {
        setSelectedBranch(active.id)
        loadCases(active.id)
      }
    } catch { /* */ }
  }

  const loadCases = async (branchId) => {
    if (!branchId) return
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/cases?pageSize=100`)
      setCases(res.data || [])
    } catch { /* */ }
  }

  const handleBranchChange = (branchId) => {
    setSelectedBranch(branchId)
    form.setFieldValue('caseIds', [])
    loadCases(branchId)
  }

  const handleCreate = async () => {
    let values
    try { values = await form.validateFields() } catch { return }
    setSaving(true)
    try {
      await api.post(`/projects/${projectId}/plans`, {
        name: values.name,
        planType: values.planType,
        testType: values.testType,
        caseIds: values.caseIds,
        environmentId: values.environmentId || null,
        channelId: values.channelId || null,
        retryCount: values.retryCount || 0,
        circuitBreaker: values.planType === 'automated' ? {
          consecutive: values.consecutive || 5,
          rate: values.rate || 50,
        } : null,
      })
      message.success('计划创建成功')
      setCreateOpen(false)
      fetchPlans()
    } catch { /* */ } finally { setSaving(false) }
  }

  const handleQuickExecute = async (e, planId) => {
    e.stopPropagation()
    try {
      await api.post(`/projects/${projectId}/plans/${planId}/execute`)
      message.success('计划已启动执行')
      fetchPlans()
    } catch (err) {
      message.error(err?.response?.data?.error?.message || err?.message || '执行失败')
    }
  }

  const handleQuickDelete = (e, planId, planName) => {
    e.stopPropagation()
    Modal.confirm({
      title: '确认删除',
      content: `确定删除计划「${planName}」？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/projects/${projectId}/plans/${planId}`)
          message.success('删除成功')
          fetchPlans()
        } catch (err) {
          message.error(err?.response?.data?.error?.message || err?.message || '删除失败')
        }
      },
    })
  }

  const filteredPlans = keyword
    ? plans.filter(p => p.name.toLowerCase().includes(keyword.toLowerCase()))
    : plans

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>测试计划</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchPlans} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建计划</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: '10px 16px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Radio.Group value={tab} onChange={e => { setTab(e.target.value); setPage(1) }} size="small" buttonStyle="solid">
            <Radio.Button value="">全部 ({total})</Radio.Button>
            {Object.entries(statusStyle).map(([k, v]) => (
              <Radio.Button key={k} value={k}>{v.label}</Radio.Button>
            ))}
          </Radio.Group>
          <Input prefix={<SearchOutlined style={{ color: '#c2c6cf' }} />} placeholder="搜索计划名称"
            value={keyword} onChange={e => setKeyword(e.target.value)} allowClear style={{ width: 240 }} size="small" />
        </div>
      </Card>

      {loading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div> :
        filteredPlans.length === 0 ? <Empty description="暂无计划" style={{ marginTop: 60 }} /> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredPlans.map(plan => {
            const s = statusStyle[plan.status] || statusStyle.draft
            return (
              <Card key={plan.id} styles={{ body: { padding: '14px 20px' } }} style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/projects/${projectId}/plans/${plan.id}`)}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#2e3138' }}>{plan.name}</span>
                      <Tag style={{ background: s.bg, color: s.color, border: 'none' }}>{s.label}</Tag>
                      <Tag style={{ background: '#f5f5f7', color: '#8c919e', border: 'none' }}>{plan.planType === 'automated' ? '自动化' : '手动'}</Tag>
                      <Tag style={{ background: '#f5f5f7', color: '#8c919e', border: 'none' }}>{plan.testType?.toUpperCase()}</Tag>
                    </div>
                    <Space size={16} style={{ fontSize: 12, color: '#8c919e' }}>
                      <span><ClockCircleOutlined style={{ marginRight: 3 }} />{new Date(plan.createdAt).toLocaleDateString('zh-CN')}</span>
                      <span>用例: {plan.caseCount} 条</span>
                    </Space>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {plan.status === 'draft' && (
                      <Button type="primary" size="small" icon={<PlayCircleOutlined />}
                        onClick={e => handleQuickExecute(e, plan.id)}>执行</Button>
                    )}
                    {plan.status === 'executing' && (
                      <Button size="small" icon={<EditOutlined />}
                        onClick={e => { e.stopPropagation(); navigate(`/projects/${projectId}/plans/${plan.id}/manual-record`) }}>录入</Button>
                    )}
                    {(plan.status === 'draft' || plan.status === 'archived') && (
                      <Button size="small" danger icon={<DeleteOutlined />}
                        onClick={e => handleQuickDelete(e, plan.id, plan.name)} />
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      }

      {/* 创建计划弹窗 */}
      <Modal title="创建测试计划" open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)}
        okText="创建" cancelText="取消" confirmLoading={saving} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ planType: 'automated', testType: 'api', retryCount: 2 }}>
          <Form.Item name="name" label="计划名称" rules={[{ required: true, message: '请输入计划名称' }]}>
            <Input placeholder="如：API 回归测试 — Sprint 13" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="planType" label="计划类型" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={[{ value: 'automated', label: '自动化' }, { value: 'manual', label: '手动' }]} />
            </Form.Item>
            <Form.Item name="testType" label="测试类型" rules={[{ required: true }]} style={{ flex: 1 }} extra="同一计划不可混合 API 和 E2E">
              <Select options={[{ value: 'api', label: 'API' }, { value: 'e2e', label: 'E2E' }]} />
            </Form.Item>
          </div>
          <Form.Item label="分支配置（选择后加载该分支的用例）">
            <Select placeholder="选择分支" value={selectedBranch} onChange={handleBranchChange}
              options={branches.filter(b => b.status === 'active').map(b => ({ value: b.id, label: `${b.name} (${b.branch})` }))} />
          </Form.Item>
          <Form.Item name="caseIds" label="选择用例" rules={[{ required: true, message: '请至少选择 1 条用例' }]}>
            <div>
              <Space>
                <Button onClick={() => setCasePickerOpen(true)} disabled={!selectedBranch}>
                  {selectedBranch ? '选择用例' : '请先选择分支'}
                </Button>
                <span style={{ fontSize: 13, color: '#86909c' }}>
                  已选 {(form.getFieldValue('caseIds') || []).length} 条
                </span>
              </Space>
            </div>
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="environmentId" label="目标环境"
              rules={planType === 'automated' ? [{ required: true, message: '自动化计划必须选择环境' }] : []} style={{ flex: 1 }}>
              <Select placeholder="选择环境" allowClear options={environments.map(e => ({ value: e.id, label: e.name }))} />
            </Form.Item>
            <Form.Item name="channelId" label="通知渠道" style={{ flex: 1 }}>
              <Select placeholder="选择通知渠道" allowClear options={channels.map(c => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </div>
          {planType === 'automated' && (
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item name="retryCount" label="失败重试" style={{ flex: 1 }}>
                <InputNumber min={0} max={3} style={{ width: '100%' }} addonAfter="次" />
              </Form.Item>
              <Form.Item name="consecutive" label="熔断-连续失败" style={{ flex: 1 }} initialValue={5}>
                <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="条" />
              </Form.Item>
              <Form.Item name="rate" label="熔断-失败率" style={{ flex: 1 }} initialValue={50}>
                <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="%" />
              </Form.Item>
            </div>
          )}
        </Form>
      </Modal>

      <Modal title="选择用例" open={casePickerOpen} width={800}
        onOk={() => setCasePickerOpen(false)} onCancel={() => setCasePickerOpen(false)}
        okText="确定" cancelText="取消">
        <Input placeholder="搜索用例编号或标题" value={caseSearch} onChange={e => setCaseSearch(e.target.value)}
          allowClear style={{ marginBottom: 12 }} prefix={<SearchOutlined style={{ color: '#c2c6cf' }} />} />
        <Table size="small" rowKey="id" pagination={{ pageSize: 10, size: 'small', showTotal: t => `共 ${t} 条` }}
          rowSelection={{
            selectedRowKeys: form.getFieldValue('caseIds') || [],
            onChange: keys => form.setFieldsValue({ caseIds: keys }),
          }}
          dataSource={cases.filter(c =>
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
