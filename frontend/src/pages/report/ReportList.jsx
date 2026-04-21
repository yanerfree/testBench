import { useState, useEffect, useCallback } from 'react'
import { Card, Tag, Space, Spin, Empty, Input, Radio, Button } from 'antd'
import { ArrowLeftOutlined, SearchOutlined, ReloadOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const statusStyle = {
  executing: { label: '执行中', color: '#7c8cf8', bg: '#eef0fe' },
  paused: { label: '已暂停', color: '#f5b87a', bg: '#fef5eb' },
  pending_manual: { label: '待手动录入', color: '#a78bfa', bg: '#f3f0fe' },
  completed: { label: '已完成', color: '#6ecf96', bg: '#eefbf3' },
  archived: { label: '已归档', color: '#a8adb6', bg: '#f5f5f7' },
}

export default function ReportList() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState('')

  const fetchPlans = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/plans?pageSize=100`)
      const all = (res.data || []).filter(p => p.status !== 'draft')
      setPlans(all)
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const filtered = plans
    .filter(p => !tab || p.status === tab)
    .filter(p => !keyword || p.name.toLowerCase().includes(keyword.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>测试报告</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchPlans} loading={loading}>刷新</Button>
      </div>

      <Card styles={{ body: { padding: '10px 16px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="">全部 ({plans.length})</Radio.Button>
            <Radio.Button value="completed">已完成</Radio.Button>
            <Radio.Button value="executing">执行中</Radio.Button>
            <Radio.Button value="pending_manual">待录入</Radio.Button>
          </Radio.Group>
          <Input prefix={<SearchOutlined style={{ color: '#c2c6cf' }} />} placeholder="搜索报告"
            value={keyword} onChange={e => setKeyword(e.target.value)} allowClear style={{ width: 240 }} size="small" />
        </div>
      </Card>

      {loading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div> :
        filtered.length === 0 ? <Empty description="暂无报告" style={{ marginTop: 60 }} /> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(plan => {
            const s = statusStyle[plan.status] || statusStyle.completed
            return (
              <Card key={plan.id} styles={{ body: { padding: '14px 20px' } }} style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/projects/${projectId}/reports/${plan.id}`)}
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
                </div>
              </Card>
            )
          })}
        </div>
      }
    </div>
  )
}
