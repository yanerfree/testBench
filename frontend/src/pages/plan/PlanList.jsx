import { useState, useMemo } from 'react'
import { Card, Tag, Button, Radio, Input, Space, Modal, Form, Select, InputNumber, message } from 'antd'
import { PlusOutlined, SearchOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { mockPlans, mockModules, mockCases, mockEnvironments, mockBranches } from '../../mock/data'

const statusStyle = {
  '已完成': { color: '#6ecf96', bg: '#eefbf3' },
  '执行中': { color: '#7c8cf8', bg: '#eef0fe' },
  '已暂停': { color: '#f5b87a', bg: '#fef5eb' },
  '草稿': { color: '#bfc4cd', bg: '#f5f5f7' },
}

function fmt(ms) {
  if (!ms) return '-'
  if (ms < 60000) return (ms/1000).toFixed(0) + 's'
  return (ms/60000).toFixed(0) + 'min'
}

export default function PlanList() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [plans, setPlans] = useState(mockPlans)
  const [tab, setTab] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()
  const planType = Form.useWatch('type', form)

  const filtered = useMemo(() => {
    let r = plans
    if (tab !== 'all') r = r.filter(p => p.status === tab)
    if (keyword) {
      const k = keyword.toLowerCase()
      r = r.filter(p => p.name.toLowerCase().includes(k))
    }
    return r
  }, [plans, tab, keyword])

  const statusCounts = useMemo(() => {
    const c = { all: plans.length }
    plans.forEach(p => { c[p.status] = (c[p.status]||0)+1 })
    return c
  }, [plans])

  function rateColor(rate) {
    if (rate >= 95) return '#6ecf96'
    if (rate >= 80) return '#f5b87a'
    return '#f08a8e'
  }

  function MiniBar({ summary, total }) {
    if (!total) return <span style={{ color: '#c2c6cf', fontSize: 12 }}>未执行</span>
    const segments = [
      { count: summary.passed, color: '#6ecf96' },
      { count: summary.failed, color: '#f08a8e' },
      { count: summary.error, color: '#f5b87a' },
      { count: summary.flaky, color: '#f0d86e' },
      { count: summary.skipped, color: '#e0e0e3' },
      { count: summary.xfail, color: '#b89aed' },
    ].filter(s => s.count > 0)

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f0f0f3', overflow: 'hidden', display: 'flex' }}>
          {segments.map((s, i) => (
            <div key={i} style={{ width: `${(s.count/total)*100}%`, height: '100%', background: s.color }} />
          ))}
        </div>
      </div>
    )
  }

  // 用例选项：按模块分组
  const caseOptions = mockModules.map(m => ({
    label: `${m.icon} ${m.label}`,
    options: mockCases
      .filter(c => c.moduleId === m.id)
      .slice(0, 10)
      .map(c => ({ value: c.id, label: `${c.id} ${c.title}` })),
  }))

  const handleCreate = () => {
    form.validateFields().then(values => {
      const caseCount = values.cases?.length || 0
      const newPlan = {
        id: `plan-${Date.now()}`,
        name: values.name,
        type: values.type,
        testType: values.testType,
        environment: values.environment || '-',
        status: '草稿',
        createdBy: JSON.parse(localStorage.getItem('user') || '{}').username || 'admin',
        executedAt: null,
        completedAt: null,
        scenarioCount: caseCount,
        automated: values.type === '自动化' ? caseCount : 0,
        manual: values.type === '手动' ? caseCount : 0,
        summary: { passed: 0, failed: 0, error: 0, flaky: 0, skipped: 0, xfail: 0 },
        passRate: 0,
        durationMs: null,
      }
      setPlans(prev => [newPlan, ...prev])
      setCreateOpen(false)
      form.resetFields()
      message.success('计划创建成功')
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>测试计划</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建计划</Button>
      </div>

      <Card styles={{ body: { padding: '10px 16px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="all">全部 ({statusCounts.all})</Radio.Button>
            {Object.entries(statusStyle).map(([k, v]) => statusCounts[k] ? (
              <Radio.Button key={k} value={k}>
                <span style={{ color: tab === k ? '#fff' : v.color }}>{k} ({statusCounts[k]})</span>
              </Radio.Button>
            ) : null)}
          </Radio.Group>
          <Input prefix={<SearchOutlined style={{ color: '#c2c6cf' }} />} placeholder="搜索计划名称"
            value={keyword} onChange={e => setKeyword(e.target.value)} allowClear
            style={{ width: 240 }} size="small" />
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(plan => {
          const s = statusStyle[plan.status] || statusStyle['草稿']
          const total = plan.summary.passed + plan.summary.failed + plan.summary.error + plan.summary.flaky
          return (
            <Card key={plan.id}
              styles={{ body: { padding: '14px 20px' } }}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/projects/${projectId}/plans/${plan.id}`)}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#2e3138' }}>{plan.name}</span>
                    <Tag style={{ background: s.bg, color: s.color, border: 'none' }}>{plan.status}</Tag>
                    <Tag style={{ background: '#f5f5f7', color: '#8c919e', border: 'none' }}>{plan.type}</Tag>
                    <Tag style={{ background: '#f5f5f7', color: '#8c919e', border: 'none' }}>{plan.testType}</Tag>
                  </div>
                  <Space size={16} style={{ fontSize: 12, color: '#8c919e' }}>
                    <span><UserOutlined style={{ marginRight: 3 }} />{plan.createdBy}</span>
                    {plan.executedAt && <span><ClockCircleOutlined style={{ marginRight: 3 }} />{plan.executedAt}</span>}
                    <span>环境: {plan.environment}</span>
                    <span>场景: {plan.scenarioCount} ({plan.automated}自动 + {plan.manual}手动)</span>
                  </Space>
                </div>

                <div style={{ width: 180 }}>
                  <MiniBar summary={plan.summary} total={plan.scenarioCount} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#8c919e' }}>
                    <span>{plan.summary.passed} 通过</span>
                    {plan.summary.failed > 0 && <span style={{ color: '#f08a8e' }}>{plan.summary.failed} 失败</span>}
                    {plan.summary.error > 0 && <span style={{ color: '#f5b87a' }}>{plan.summary.error} 错误</span>}
                  </div>
                </div>

                <div style={{ textAlign: 'right', width: 90 }}>
                  {total > 0 ? (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 700, color: rateColor(plan.passRate) }}>{plan.passRate}%</div>
                      <div style={{ fontSize: 11, color: '#c2c6cf' }}>{fmt(plan.durationMs)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: '#c2c6cf' }}>未执行</div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* 创建计划弹窗 */}
      <Modal
        title="创建测试计划"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ type: '自动化', testType: 'API', retry: 2 }}>
          <Form.Item name="name" label="计划名称" rules={[{ required: true, message: '请输入计划名称' }]}>
            <Input placeholder="如：API审批流程回归-Sprint 13" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="type" label="计划类型" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={[
                { value: '自动化', label: '自动化' },
                { value: '手动', label: '手动' },
              ]} />
            </Form.Item>
            <Form.Item name="testType" label="测试类型" rules={[{ required: true }]} style={{ flex: 1 }}
              extra="同一计划不可混合 API 和 E2E"
            >
              <Select options={[
                { value: 'API', label: 'API' },
                { value: 'E2E', label: 'E2E' },
              ]} />
            </Form.Item>
          </div>
          <Form.Item name="cases" label="选择用例" rules={[{ required: true, message: '请至少选择 1 条用例' }]}>
            <Select
              mode="multiple"
              placeholder="搜索并选择用例（可多选）"
              options={caseOptions}
              maxTagCount={5}
              showSearch
              filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="branch" label="分支配置">
            <Select
              placeholder="选择分支配置"
              options={mockBranches.filter(b => b.status === 'active').map(b => ({
                value: b.id, label: `${b.name} (${b.branch})`,
              }))}
            />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="environment" label="目标环境"
              rules={planType === '自动化' ? [{ required: true, message: '自动化计划必须选择环境' }] : []}
              style={{ flex: 1 }}
            >
              <Select
                placeholder="选择环境"
                allowClear
                options={mockEnvironments.map(e => ({ value: e.name, label: `${e.name} — ${e.description}` }))}
              />
            </Form.Item>
            <Form.Item name="channel" label="通知渠道" style={{ flex: 1 }}>
              <Select placeholder="选择通知渠道" allowClear options={[
                { value: '测试团队群', label: '测试团队群' },
                { value: '项目通知群', label: '项目通知群' },
              ]} />
            </Form.Item>
          </div>
          {planType === '自动化' && (
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item name="retry" label="失败重试次数" style={{ flex: 1 }}>
                <InputNumber min={0} max={3} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="熔断-连续失败" style={{ flex: 1 }}>
                <InputNumber min={1} max={100} defaultValue={5} style={{ width: '100%' }} addonAfter="条" />
              </Form.Item>
              <Form.Item label="熔断-失败率" style={{ flex: 1 }}>
                <InputNumber min={1} max={100} defaultValue={50} style={{ width: '100%' }} addonAfter="%" />
              </Form.Item>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  )
}
