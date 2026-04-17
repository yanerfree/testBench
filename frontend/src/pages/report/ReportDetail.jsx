import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Tag, Button, Radio, Space, Spin, Empty, Row, Col } from 'antd'
import { DownloadOutlined, ArrowLeftOutlined, ClockCircleOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const statusCfg = {
  passed: { label: '通过', color: '#6ecf96', bg: '#eefbf3' },
  failed: { label: '失败', color: '#f08a8e', bg: '#fef0f1' },
  error: { label: '错误', color: '#f5b87a', bg: '#fef5eb' },
  skipped: { label: '跳过', color: '#bfc4cd', bg: '#f5f5f7' },
  pending: { label: '待录入', color: '#a78bfa', bg: '#f3f0fe' },
}

function fmt(ms) { if (!ms && ms !== 0) return '-'; if (ms < 1000) return ms + 'ms'; if (ms < 60000) return (ms / 1000).toFixed(1) + 's'; return (ms / 60000).toFixed(1) + 'min' }

export default function ReportDetail() {
  const navigate = useNavigate()
  const { projectId, planId } = useParams()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [modules, setModules] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [tab, setTab] = useState('all')
  const [expandedMods, setExpandedMods] = useState([])

  const fetchData = useCallback(async () => {
    if (!projectId || !planId) return
    setLoading(true)
    try {
      const [reportRes, resultsRes] = await Promise.all([
        api.get(`/projects/${projectId}/plans/${planId}/report`),
        api.get(`/projects/${projectId}/plans/${planId}/results`),
      ])
      if (reportRes.data) {
        setSummary(reportRes.data.summary)
        setModules(reportRes.data.modules || [])
      }
      if (resultsRes.data) {
        setScenarios(resultsRes.data.scenarios || [])
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, planId])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (tab === 'all') return scenarios
    return scenarios.filter(s => s.status === tab)
  }, [scenarios, tab])

  const counts = {}
  scenarios.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1 })

  const toggleMod = (name) => setExpandedMods(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name])

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  if (!summary) return <Empty description="暂无报告数据" />

  return (
    <div>
      {/* 头部 */}
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>执行报告</h2>
            <Tag style={{ background: '#f6ffed', color: '#6ecf96', border: 'none' }}>
              {summary.completedAt ? '已完成' : '执行中'}
            </Tag>
          </div>
          <Space>
            <span style={{ fontSize: 13, color: '#86909c' }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {summary.executedAt ? new Date(summary.executedAt).toLocaleString('zh-CN') : '-'}
            </span>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Space>
        </div>
      </Card>

      {/* L1 汇总卡片 */}
      <Row gutter={8} style={{ marginBottom: 8 }}>
        <Col span={4}>
          <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{summary.totalScenarios}</div>
            <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>总用例</div>
          </Card>
        </Col>
        {['passed', 'failed', 'error', 'skipped', 'pending'].map(k => (
          <Col span={3} key={k}>
            <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: statusCfg[k]?.color || '#999' }}>{summary[k] || 0}</div>
              <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>{statusCfg[k]?.label || k}</div>
            </Card>
          </Col>
        ))}
        {summary.passRate != null && (
          <Col span={4}>
            <Card styles={{ body: { padding: '16px', textAlign: 'center' } }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: summary.passRate >= 95 ? '#6ecf96' : summary.passRate >= 80 ? '#f5b87a' : '#f08a8e' }}>{summary.passRate}%</div>
              <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>通过率</div>
            </Card>
          </Col>
        )}
      </Row>

      {/* L2 模块分组 */}
      {modules.length > 0 && (
        <Card style={{ marginBottom: 8 }} title={<span style={{ fontSize: 14, fontWeight: 600 }}>模块质量概览</span>}
          styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 }, body: { padding: '12px 16px' } }}>
          {modules.map(mod => (
            <div key={mod.module} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', borderRadius: 8, marginBottom: 4,
              background: '#fafbfc', cursor: 'pointer',
            }} onClick={() => toggleMod(mod.module)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RightOutlined style={{ fontSize: 10, color: '#c0c4cc', transition: 'transform 0.2s', transform: expandedMods.includes(mod.module) ? 'rotate(90deg)' : 'none' }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.module}</span>
                <span style={{ fontSize: 12, color: '#c0c4cc' }}>{mod.total} 个用例</span>
              </div>
              <Space size={12}>
                {mod.passed > 0 && <span style={{ fontSize: 13, color: '#6ecf96' }}>{mod.passed} 通过</span>}
                {mod.failed > 0 && <span style={{ fontSize: 13, color: '#f08a8e', fontWeight: 600 }}>{mod.failed} 失败</span>}
                {mod.error > 0 && <span style={{ fontSize: 13, color: '#f5b87a' }}>{mod.error} 错误</span>}
                {mod.passRate != null && <Tag style={{ background: mod.passRate >= 95 ? '#eefbf3' : mod.passRate >= 80 ? '#fef5eb' : '#fef0f1', color: mod.passRate >= 95 ? '#6ecf96' : mod.passRate >= 80 ? '#f5b87a' : '#f08a8e', border: 'none' }}>{mod.passRate}%</Tag>}
              </Space>
            </div>
          ))}
        </Card>
      )}

      {/* 场景列表 */}
      <Card title={<span style={{ fontSize: 14, fontWeight: 600 }}>用例明细</span>}
        styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 } }}>
        <div style={{ marginBottom: 12 }}>
          <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="all">全部 ({scenarios.length})</Radio.Button>
            {Object.entries(statusCfg).map(([k, v]) => counts[k] ? <Radio.Button key={k} value={k}><span style={{ color: v.color }}>{v.label} ({counts[k]})</span></Radio.Button> : null)}
          </Radio.Group>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(s => {
            const cfg = statusCfg[s.status] || statusCfg.pending
            return (
              <div key={s.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', background: '#fff', borderRadius: 8,
                borderLeft: `3px solid ${cfg.color}`, border: '1px solid #f2f3f5',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag style={{ background: cfg.bg, color: cfg.color, border: 'none', minWidth: 52, textAlign: 'center' }}>{cfg.label}</Tag>
                  <span style={{ fontSize: 13 }}>{s.scenarioName}</span>
                  <span style={{ fontSize: 11, color: '#bfc4cd' }}>{s.caseCode}</span>
                  <Tag style={{ background: s.executionType === 'automated' ? '#e6f4ff' : '#fff7e6', color: s.executionType === 'automated' ? '#7c8cf8' : '#f5b87a', border: 'none', fontSize: 11 }}>
                    {s.executionType === 'automated' ? '自动' : '手动'}
                  </Tag>
                </div>
                <Space size={12} style={{ fontSize: 13, color: '#c0c4cc' }}>
                  {s.remark && <span style={{ color: '#86909c', fontSize: 12 }}>{s.remark}</span>}
                  <span>{fmt(s.durationMs)}</span>
                </Space>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
