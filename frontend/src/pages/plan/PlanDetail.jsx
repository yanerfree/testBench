import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Tag, Button, Radio, Table, Descriptions, Space, Row, Col, Spin, Empty, message } from 'antd'
import { DownloadOutlined, UserOutlined, ClockCircleOutlined, EditOutlined, PlayCircleOutlined, CheckOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const statusCfg = {
  passed: { label: '通过', color: '#6ecf96', bg: '#eefbf3' },
  failed: { label: '失败', color: '#f08a8e', bg: '#fef0f1' },
  error: { label: '错误', color: '#f5b87a', bg: '#fef5eb' },
  skipped: { label: '跳过', color: '#bfc4cd', bg: '#f5f5f7' },
  pending: { label: '待录入', color: '#a78bfa', bg: '#f3f0fe' },
}

const planStatusMap = {
  draft: { label: '草稿', color: '#bfc4cd', bg: '#f5f5f7' },
  executing: { label: '执行中', color: '#7c8cf8', bg: '#eef0fe' },
  completed: { label: '已完成', color: '#6ecf96', bg: '#eefbf3' },
  archived: { label: '已归档', color: '#a8adb6', bg: '#f5f5f7' },
}

export default function PlanDetail() {
  const navigate = useNavigate()
  const { projectId, planId } = useParams()
  const [plan, setPlan] = useState(null)
  const [report, setReport] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')

  const fetchData = useCallback(async () => {
    if (!projectId || !planId) return
    setLoading(true)
    try {
      const [planRes, resultsRes] = await Promise.all([
        api.get(`/projects/${projectId}/plans/${planId}`),
        api.get(`/projects/${projectId}/plans/${planId}/results`),
      ])
      setPlan(planRes.data)
      if (resultsRes.data) {
        setReport(resultsRes.data.report)
        setScenarios(resultsRes.data.scenarios || [])
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, planId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleExecute = async () => {
    try {
      await api.post(`/projects/${projectId}/plans/${planId}/execute`)
      message.success('计划已启动执行')
      fetchData()
    } catch { /* */ }
  }

  const handleComplete = async () => {
    try {
      await api.post(`/projects/${projectId}/plans/${planId}/complete`)
      message.success('计划已完成')
      fetchData()
    } catch { /* */ }
  }

  const filtered = useMemo(() => {
    if (tab === 'all') return scenarios
    return scenarios.filter(s => s.status === tab)
  }, [scenarios, tab])

  const counts = {}
  scenarios.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1 })

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  if (!plan) return <Empty description="计划不存在" />

  const ps = planStatusMap[plan.status] || planStatusMap.draft

  const columns = [
    { title: '用例', dataIndex: 'scenarioName', ellipsis: true, render: (v, r) => (
      <div>
        <span style={{ fontWeight: 500 }}>{v}</span>
        <span style={{ fontSize: 11, color: '#bfc4cd', marginLeft: 8 }}>{r.caseCode}</span>
        {r.remark && <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>{r.remark}</div>}
      </div>
    )},
    { title: '状态', dataIndex: 'status', width: 90, align: 'center', render: v => {
      const c = statusCfg[v] || statusCfg.pending
      return <Tag style={{ background: c.bg, color: c.color, border: 'none' }}>{c.label}</Tag>
    }},
    { title: '类型', dataIndex: 'executionType', width: 72, align: 'center', render: v =>
      <Tag style={{ background: v === 'automated' ? '#e6f4ff' : '#fff7e6', color: v === 'automated' ? '#7c8cf8' : '#f5b87a', border: 'none' }}>
        {v === 'automated' ? '自动' : '手动'}
      </Tag>
    },
    { title: '耗时', dataIndex: 'durationMs', width: 80, align: 'right', render: v =>
      <span style={{ fontSize: 13, color: '#86909c', fontFamily: 'monospace' }}>
        {v ? (v < 1000 ? v + 'ms' : (v / 1000).toFixed(1) + 's') : '-'}
      </span>
    },
  ]

  return (
    <div>
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{plan.name}</h2>
              <Tag style={{ background: ps.bg, color: ps.color, border: 'none' }}>{ps.label}</Tag>
              <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{plan.planType === 'automated' ? '自动化' : '手动'}</Tag>
              <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{plan.testType?.toUpperCase()}</Tag>
            </div>
            <Space size={20} style={{ fontSize: 13, color: '#86909c', paddingLeft: 40 }}>
              <span><ClockCircleOutlined style={{ marginRight: 4 }} />创建于 {new Date(plan.createdAt).toLocaleString('zh-CN')}</span>
              {plan.executedAt && <span>执行于 {new Date(plan.executedAt).toLocaleString('zh-CN')}</span>}
            </Space>
          </div>
          <Space>
            {plan.status === 'draft' && (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExecute}>启动执行</Button>
            )}
            {plan.status === 'executing' && (<>
              <Button icon={<EditOutlined />} onClick={() => navigate(`/projects/${projectId}/plans/${planId}/manual-record`)}>手动录入</Button>
              <Button type="primary" icon={<CheckOutlined />} onClick={handleComplete}>确认完成</Button>
            </>)}
          </Space>
        </div>
      </Card>

      {report && (
        <Row gutter={8} style={{ marginBottom: 8 }}>
          <Col span={4}>
            <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{report.totalScenarios}</div>
              <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>总用例</div>
            </Card>
          </Col>
          {['passed', 'failed', 'error', 'skipped'].map(k => (
            <Col span={4} key={k}>
              <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: statusCfg[k].color }}>{report[k] || 0}</div>
                <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>{statusCfg[k].label}</div>
              </Card>
            </Col>
          ))}
          {report.passRate != null && (
            <Col span={4}>
              <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: report.passRate >= 95 ? '#6ecf96' : report.passRate >= 80 ? '#f5b87a' : '#f08a8e' }}>{report.passRate}%</div>
                <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>通过率</div>
              </Card>
            </Col>
          )}
        </Row>
      )}

      <Card style={{ marginBottom: 8 }} title={<span style={{ fontSize: 14, fontWeight: 600 }}>计划配置</span>}
        styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 }, body: { padding: '12px 24px' } }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="计划类型">{plan.planType === 'automated' ? '自动化' : '手动'}</Descriptions.Item>
          <Descriptions.Item label="测试类型">{plan.testType?.toUpperCase()}</Descriptions.Item>
          <Descriptions.Item label="失败重试">{plan.retryCount} 次</Descriptions.Item>
          {plan.circuitBreaker && <>
            <Descriptions.Item label="熔断-连续失败">{plan.circuitBreaker.consecutive} 条</Descriptions.Item>
            <Descriptions.Item label="熔断-失败率">{plan.circuitBreaker.rate}%</Descriptions.Item>
          </>}
        </Descriptions>
      </Card>

      <Card title={<span style={{ fontSize: 14, fontWeight: 600 }}>用例执行结果</span>}
        styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 } }}>
        {scenarios.length > 0 ? (<>
          <div style={{ marginBottom: 12 }}>
            <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
              <Radio.Button value="all">全部 ({scenarios.length})</Radio.Button>
              {Object.entries(statusCfg).map(([k, v]) => counts[k] ? <Radio.Button key={k} value={k}><span style={{ color: v.color }}>{v.label} ({counts[k]})</span></Radio.Button> : null)}
            </Radio.Group>
          </div>
          <Table dataSource={filtered} columns={columns} rowKey="id" size="small" pagination={{ pageSize: 15, size: 'small', showTotal: t => `共 ${t} 条` }} />
        </>) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#bfc4cd' }}>
            {plan.status === 'draft' ? '尚未执行，点击上方"启动执行"开始' : '暂无执行结果'}
          </div>
        )}
      </Card>
    </div>
  )
}
