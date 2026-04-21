import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Tag, Button, Radio, Table, Space, Spin, Empty, Row, Col, message } from 'antd'
import { DownloadOutlined, ArrowLeftOutlined, ClockCircleOutlined, SyncOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const statusCfg = {
  passed: { label: '通过', color: '#6ecf96', bg: '#eefbf3' },
  failed: { label: '失败', color: '#f08a8e', bg: '#fef0f1' },
  error: { label: '错误', color: '#f5b87a', bg: '#fef5eb' },
  skipped: { label: '跳过', color: '#bfc4cd', bg: '#f5f5f7' },
  pending: { label: '待录入', color: '#a78bfa', bg: '#f3f0fe' },
}

const methodColor = { GET: '#6ecf96', POST: '#7c8cf8', PUT: '#f5b87a', DELETE: '#f08a8e', PATCH: '#a78bfa' }

function fmt(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}

function PassRateRing({ rate, passed, size = 140 }) {
  const r = size / 2 - 8
  const c = 2 * Math.PI * r
  const offset = c - (c * (rate || 0)) / 100
  const color = rate >= 95 ? '#6ecf96' : rate >= 80 ? '#f5b87a' : '#f08a8e'
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0f0f3" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 - 10} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 12, fill: '#86909c' }}>已完成</text>
      <text x={size/2} y={size/2 + 12} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 24, fontWeight: 700, fill: '#2e3138' }}>{passed ?? 0}</text>
    </svg>
  )
}

function StepTable({ steps }) {
  const columns = [
    { title: '#', dataIndex: 'sortOrder', width: 40, align: 'center', render: v => <span style={{ color: '#bfc4cd' }}>{(v ?? 0) + 1}</span> },
    { title: '步骤', dataIndex: 'stepName', ellipsis: true },
    { title: '方法', dataIndex: 'httpMethod', width: 60, align: 'center',
      render: v => v ? <Tag style={{ background: 'transparent', color: methodColor[v] || '#86909c', border: `1px solid ${methodColor[v] || '#d9d9d9'}` }}>{v}</Tag> : '-' },
    { title: 'URL', dataIndex: 'url', width: 250, ellipsis: true,
      render: v => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#86909c' }}>{v || '-'}</span> },
    { title: '状态', dataIndex: 'status', width: 70, align: 'center',
      render: v => { const c = statusCfg[v]; return c ? <Tag style={{ background: c.bg, color: c.color, border: 'none' }}>{c.label}</Tag> : v } },
    { title: '状态码', dataIndex: 'statusCode', width: 65, align: 'center',
      render: v => v ? <span style={{ fontFamily: 'monospace', color: v >= 400 ? '#f08a8e' : '#6ecf96' }}>{v}</span> : '-' },
    { title: '耗时', dataIndex: 'durationMs', width: 70, align: 'right',
      render: v => <span style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>{fmt(v)}</span> },
    { title: '错误', dataIndex: 'errorSummary', ellipsis: true,
      render: v => v ? <span style={{ color: '#f08a8e', fontSize: 12 }}>{v}</span> : null },
  ]
  return <Table dataSource={steps} columns={columns} rowKey="id" size="small" pagination={false} />
}

export default function ReportDetail() {
  const navigate = useNavigate()
  const { projectId, planId } = useParams()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [modules, setModules] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [tab, setTab] = useState('all')
  const [stepsCache, setStepsCache] = useState({})
  const [loadingSteps, setLoadingSteps] = useState({})
  const [exporting, setExporting] = useState(false)

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

  const loadSteps = async (scenarioId) => {
    if (stepsCache[scenarioId] || loadingSteps[scenarioId]) return
    setLoadingSteps(prev => ({ ...prev, [scenarioId]: true }))
    try {
      const res = await api.get(`/projects/${projectId}/plans/${planId}/scenarios/${scenarioId}/steps`)
      setStepsCache(prev => ({ ...prev, [scenarioId]: res.data || [] }))
    } catch { /* */ } finally {
      setLoadingSteps(prev => ({ ...prev, [scenarioId]: false }))
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await api.download(`/projects/${projectId}/plans/${planId}/export/excel`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${planId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch {
      message.error('导出失败')
    } finally { setExporting(false) }
  }

  const filtered = useMemo(() => {
    if (tab === 'all') return scenarios
    return scenarios.filter(s => s.status === tab)
  }, [scenarios, tab])

  const counts = {}
  scenarios.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1 })

  const sortedModules = useMemo(() => {
    return [...modules].sort((a, b) => (b.failed + b.error) - (a.failed + a.error))
  }, [modules])

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  if (!summary) return <Empty description="暂无报告数据" />

  const scenarioColumns = [
    { title: '用例', dataIndex: 'scenarioName', ellipsis: true, render: (v, r) => (
      <div>
        <div>
          <span style={{ fontWeight: 500 }}>{v}</span>
          <span style={{ fontSize: 11, color: '#bfc4cd', marginLeft: 8 }}>{r.caseCode}</span>
        </div>
        {r.scriptRefFile && (
          <div style={{ fontSize: 11, color: '#86909c', fontFamily: 'monospace', marginTop: 2 }}>
            {r.scriptRefFile}{r.scriptRefFunc ? `::${r.scriptRefFunc}` : ''}
          </div>
        )}
      </div>
    )},
    { title: '状态', dataIndex: 'status', width: 80, align: 'center', render: v => {
      const c = statusCfg[v] || statusCfg.pending
      return <Tag style={{ background: c.bg, color: c.color, border: 'none' }}>{c.label}</Tag>
    }},
    { title: '类型', dataIndex: 'executionType', width: 65, align: 'center', render: v =>
      <Tag style={{ background: v === 'automated' ? '#e6f4ff' : '#fff7e6', color: v === 'automated' ? '#7c8cf8' : '#f5b87a', border: 'none' }}>
        {v === 'automated' ? '自动' : '手动'}
      </Tag>
    },
    { title: '耗时', dataIndex: 'durationMs', width: 80, align: 'right', render: v =>
      <span style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>{fmt(v)}</span>
    },
    { title: '错误信息', dataIndex: 'errorSummary', width: 300, render: v => v ? (
      <div style={{ color: '#f08a8e', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 80, overflow: 'auto' }}>{v}</div>
    ) : null },
  ]

  const statCards = [
    { label: '总用例', value: summary.totalScenarios, color: '#2e3138' },
    { label: '通过', value: summary.passed, color: '#6ecf96' },
    { label: '失败', value: summary.failed, color: '#f08a8e' },
    { label: '错误', value: summary.error, color: '#f5b87a' },
    { label: '跳过', value: summary.skipped, color: '#bfc4cd' },
    { label: '待录入', value: summary.pending, color: '#a78bfa' },
  ]

  return (
    <div>
      {/* Header */}
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={12}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${projectId}/reports`)} />
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>执行报告</h2>
            <Tag style={{ background: summary.completedAt ? '#eefbf3' : '#eef0fe', color: summary.completedAt ? '#6ecf96' : '#7c8cf8', border: 'none' }}>
              {summary.completedAt ? '已完成' : '执行中'}
            </Tag>
          </Space>
          <Space>
            <span style={{ fontSize: 13, color: '#86909c' }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {summary.executedAt ? new Date(summary.executedAt).toLocaleString('zh-CN') : '-'}
            </span>
            {summary.totalDurationMs && <span style={{ fontSize: 13, color: '#86909c' }}>总耗时 {fmt(summary.totalDurationMs)}</span>}
            <Button icon={<SyncOutlined />} onClick={fetchData}>刷新</Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>导出 Excel</Button>
          </Space>
        </div>
      </Card>

      {/* L1 Summary */}
      <Card style={{ marginBottom: 8 }} styles={{ body: { padding: '24px 32px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <PassRateRing rate={summary.passRate} passed={summary.passed} size={140} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6ecf96', display: 'inline-block' }} />
              <span style={{ color: '#6ecf96' }}>通过</span>
              <span style={{ fontWeight: 600 }}>{summary.passed}</span>
              <span style={{ color: '#86909c' }}>({summary.passRate != null ? `${summary.passRate}%` : '-'})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f08a8e', display: 'inline-block' }} />
              <span style={{ color: '#f08a8e' }}>失败</span>
              <span style={{ fontWeight: 600 }}>{summary.failed}</span>
              <span style={{ color: '#86909c' }}>({summary.totalScenarios > 0 ? ((summary.failed / summary.totalScenarios * 100).toFixed(1) + '%') : '0%'})</span>
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #f0f0f3', paddingLeft: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
            <div><span style={{ color: '#86909c', fontSize: 13 }}>总耗时</span><div style={{ fontSize: 16, fontWeight: 600, color: '#7c8cf8' }}>{fmt(summary.totalDurationMs)}</div></div>
            <div><span style={{ color: '#86909c', fontSize: 13 }}>错误数</span><div style={{ fontSize: 16, fontWeight: 600 }}><span style={{ color: '#f5b87a' }}>{summary.error}</span></div></div>
            <div><span style={{ color: '#86909c', fontSize: 13 }}>总用例</span><div style={{ fontSize: 16, fontWeight: 600 }}>{summary.totalScenarios}</div></div>
            <div><span style={{ color: '#86909c', fontSize: 13 }}>跳过</span><div style={{ fontSize: 16, fontWeight: 600 }}><span style={{ color: '#bfc4cd' }}>{summary.skipped}</span></div></div>
          </div>
        </div>
      </Card>

      {/* L2 Module Grouping */}
      {sortedModules.length > 0 && (
        <Card style={{ marginBottom: 8 }} title={<span style={{ fontSize: 14, fontWeight: 600 }}>模块质量概览</span>}
          styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 }, body: { padding: '12px 16px' } }}>
          {sortedModules.map(mod => {
            const hasFailure = mod.failed > 0 || mod.error > 0
            const barWidth = summary.totalScenarios > 0 ? (mod.passed / mod.total * 100) : 0
            return (
              <div key={mod.module} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 8, marginBottom: 4, background: '#fafbfc',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: hasFailure ? '#f08a8e' : '#2e3138' }}>{mod.module}</span>
                  <span style={{ fontSize: 12, color: '#c0c4cc' }}>{mod.total} 个用例</span>
                  <div style={{ flex: 1, maxWidth: 120, height: 6, background: '#f0f0f3', borderRadius: 3, marginLeft: 8 }}>
                    <div style={{ width: `${barWidth}%`, height: '100%', background: mod.passRate >= 95 ? '#6ecf96' : mod.passRate >= 80 ? '#f5b87a' : '#f08a8e', borderRadius: 3 }} />
                  </div>
                </div>
                <Space size={12}>
                  {mod.passed > 0 && <span style={{ fontSize: 13, color: '#6ecf96' }}>{mod.passed} 通过</span>}
                  {mod.failed > 0 && <span style={{ fontSize: 13, color: '#f08a8e', fontWeight: 600 }}>{mod.failed} 失败</span>}
                  {mod.error > 0 && <span style={{ fontSize: 13, color: '#f5b87a' }}>{mod.error} 错误</span>}
                  {mod.passRate != null && <Tag style={{ background: mod.passRate >= 95 ? '#eefbf3' : mod.passRate >= 80 ? '#fef5eb' : '#fef0f1', color: mod.passRate >= 95 ? '#6ecf96' : mod.passRate >= 80 ? '#f5b87a' : '#f08a8e', border: 'none' }}>{mod.passRate}%</Tag>}
                </Space>
              </div>
            )
          })}
        </Card>
      )}

      {/* L3 Scenario List + L4 Steps */}
      <Card title={<span style={{ fontSize: 14, fontWeight: 600 }}>用例明细</span>}
        styles={{ header: { borderBottom: '1px solid #f2f3f5', minHeight: 44 } }}>
        <div style={{ marginBottom: 12 }}>
          <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="all">全部 ({scenarios.length})</Radio.Button>
            {Object.entries(statusCfg).map(([k, v]) => counts[k] ? <Radio.Button key={k} value={k}><span style={{ color: v.color }}>{v.label} ({counts[k]})</span></Radio.Button> : null)}
          </Radio.Group>
        </div>
        <Table
          dataSource={filtered}
          columns={scenarioColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20, size: 'small', showTotal: t => `共 ${t} 条` }}
          expandable={{
            expandedRowRender: (record) => {
              const steps = stepsCache[record.id]
              if (loadingSteps[record.id]) return <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
              if (!steps || steps.length === 0) return <div style={{ padding: 12, color: '#bfc4cd' }}>无步骤详情</div>
              return <StepTable steps={steps} />
            },
            onExpand: (expanded, record) => {
              if (expanded && record.executionType === 'automated') loadSteps(record.id)
            },
            rowExpandable: record => record.executionType === 'automated',
          }}
        />
      </Card>
    </div>
  )
}
