import { useState, useMemo } from 'react'
import { Card, Tag, Button, Radio, Input, Space, Table, Progress } from 'antd'
import { PlusOutlined, SearchOutlined, PlayCircleOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { mockPlans } from '../../mock/data'

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
  const [tab, setTab] = useState('all')
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    let r = mockPlans
    if (tab !== 'all') r = r.filter(p => p.status === tab)
    if (keyword) {
      const k = keyword.toLowerCase()
      r = r.filter(p => p.name.toLowerCase().includes(k))
    }
    return r
  }, [tab, keyword])

  const statusCounts = useMemo(() => {
    const c = { all: mockPlans.length }
    mockPlans.forEach(p => { c[p.status] = (c[p.status]||0)+1 })
    return c
  }, [])

  // 通过率颜色
  function rateColor(rate) {
    if (rate >= 95) return '#6ecf96'
    if (rate >= 80) return '#f5b87a'
    return '#f08a8e'
  }

  // 统计条
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

  return (
    <div>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>测试计划</h2>
        <Button type="primary" icon={<PlusOutlined />}>创建计划</Button>
      </div>

      {/* 筛选 */}
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

      {/* 计划卡片列表 */}
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
                {/* 左侧：名称+标签 */}
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

                {/* 中间：进度条 */}
                <div style={{ width: 180 }}>
                  <MiniBar summary={plan.summary} total={plan.scenarioCount} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#8c919e' }}>
                    <span>{plan.summary.passed} 通过</span>
                    {plan.summary.failed > 0 && <span style={{ color: '#f08a8e' }}>{plan.summary.failed} 失败</span>}
                    {plan.summary.error > 0 && <span style={{ color: '#f5b87a' }}>{plan.summary.error} 错误</span>}
                  </div>
                </div>

                {/* 右侧：通过率+耗时 */}
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
    </div>
  )
}
