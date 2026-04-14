import { useState, useMemo } from 'react'
import { Card, Tag, Button, Radio, Table, Descriptions, Space, Row, Col } from 'antd'
import { BarChartOutlined, DownloadOutlined, FileTextOutlined, UserOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { mockPlan, mockReport } from '../../mock/data'

const statusCfg = {
  passed: { label: '通过', color: '#6ecf96', bg: '#f6ffed' },
  failed: { label: '失败', color: '#f08a8e', bg: '#fff2f0' },
  error: { label: '错误', color: '#f5b87a', bg: '#fff7e6' },
  flaky: { label: 'Flaky', color: '#f0d86e', bg: '#feffe6' },
  skipped: { label: '跳过', color: '#86909c', bg: '#f7f8fa' },
  xfail: { label: '预期失败', color: '#8c8c8c', bg: '#fafafa' },
}

export default function PlanDetail() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [source, setSource] = useState('all')

  const cases = mockReport.scenarios.slice(0, 20)
  const filtered = useMemo(() => {
    let r = cases
    if (tab !== 'all') r = r.filter(c => c.status === tab)
    if (source !== 'all') r = r.filter(c => c.executionType === source)
    return r
  }, [tab, source])

  const counts = {}
  cases.forEach(c => { counts[c.status] = (counts[c.status]||0)+1 })

  const columns = [
    { title: '用例', dataIndex: 'name', ellipsis: true, render: (v, r) => (
      <div>
        <span style={{ fontWeight: 500 }}>{v}</span>
        {r.errorSummary && <div style={{ fontSize: 12, color: '#f08a8e', marginTop: 2 }}>{r.errorSummary}</div>}
        {r.remark && <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>{r.remark}</div>}
      </div>
    )},
    { title: '状态', dataIndex: 'status', width: 90, align: 'center', render: v => {
      const c = statusCfg[v]; return <Tag style={{ background: c.bg, color: c.color, border: 'none' }}>{c.label}</Tag>
    }},
    { title: '来源', width: 72, align: 'center', render: (_, r) => <Tag style={{ background: r.executionType==='automated'?'#e6f4ff':'#fff7e6', color: r.executionType==='automated'?'#7c8cf8':'#f5b87a', border: 'none' }}>{r.executionType==='automated'?'自动':'手动'}</Tag> },
    { title: '耗时', width: 80, align: 'right', render: (_, r) => <span style={{ fontSize: 13, color: '#86909c', fontFamily: 'monospace' }}>{r.durationMs ? (r.durationMs < 1000 ? r.durationMs+'ms' : (r.durationMs/1000).toFixed(1)+'s') : '-'}</span> },
    { title: '处理人', width: 70, align: 'center', render: (_, r) => r.assignee || <span style={{ color: '#ddd' }}>-</span> },
  ]

  return (
    <div>
      {/* 头部 */}
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{mockPlan.name}</h2>
              <Tag style={{ background: '#f6ffed', color: '#6ecf96', border: 'none' }}>{mockPlan.status}</Tag>
              <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{mockPlan.type}</Tag>
            </div>
            <Space size={20} style={{ fontSize: 13, color: '#86909c' }}>
              <span><UserOutlined style={{ marginRight: 4 }} />{mockPlan.createdBy}</span>
              <span><ClockCircleOutlined style={{ marginRight: 4 }} />执行 {mockPlan.executedAt}</span>
              <span>环境 <Tag size="small" style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{mockPlan.environment}</Tag></span>
            </Space>
          </div>
          <Space>
            <Button type="primary" icon={<BarChartOutlined />} onClick={() => navigate('/projects/proj-001/reports/rpt-001')}>查看报告</Button>
            <Button icon={<DownloadOutlined />}>导出 HTML</Button>
            <Button icon={<FileTextOutlined />}>导出 Excel</Button>
          </Space>
        </div>
      </Card>

      {/* 统计卡片 */}
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={4}>
          <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{mockPlan.total}</div>
            <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>总用例数</div>
          </Card>
        </Col>
        {Object.entries(statusCfg).map(([k, v]) => (
          <Col span={3} key={k}>
            <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: v.color }}>{mockPlan.summary[k]||0}</div>
              <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>{v.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 配置信息 */}
      <Card style={{ marginBottom: 8 }} title={<span style={{ fontSize: 14, fontWeight: 600 }}>计划配置</span>}
        headStyle={{ borderBottom: '1px solid #f2f3f5', minHeight: 44 }} styles={{ body: { padding: '12px 24px' } }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="计划类型">{mockPlan.type}</Descriptions.Item>
          <Descriptions.Item label="测试类型">{mockPlan.testType}</Descriptions.Item>
          <Descriptions.Item label="目标环境">{mockPlan.environment}</Descriptions.Item>
          <Descriptions.Item label="通知渠道">{mockPlan.channel}</Descriptions.Item>
          <Descriptions.Item label="失败重试">{mockPlan.retry} 次</Descriptions.Item>
          <Descriptions.Item label="熔断-连续失败">{mockPlan.circuitBreaker.consecutive} 条</Descriptions.Item>
          <Descriptions.Item label="熔断-失败率">{mockPlan.circuitBreaker.rate}%</Descriptions.Item>
          <Descriptions.Item label="自动化/手动">{mockPlan.automated} / {mockPlan.manual}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 用例列表 */}
      <Card title={<span style={{ fontSize: 14, fontWeight: 600 }}>用例执行结果</span>}
        headStyle={{ borderBottom: '1px solid #f2f3f5', minHeight: 44 }}
        extra={<Radio.Group value={source} onChange={e => setSource(e.target.value)} size="small" buttonStyle="solid">
          <Radio.Button value="all">全部</Radio.Button><Radio.Button value="automated">自动化</Radio.Button><Radio.Button value="manual">手动</Radio.Button>
        </Radio.Group>}>
        <div style={{ marginBottom: 12 }}>
          <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="all">全部 ({cases.length})</Radio.Button>
            {Object.entries(statusCfg).map(([k,v]) => counts[k] ? <Radio.Button key={k} value={k}><span style={{ color: v.color }}>{v.label} ({counts[k]})</span></Radio.Button> : null)}
          </Radio.Group>
        </div>
        <Table dataSource={filtered} columns={columns} rowKey="scenarioId" size="small" pagination={{ pageSize: 15, size: 'small', showTotal: t => `共 ${t} 条` }} />
      </Card>
    </div>
  )
}
