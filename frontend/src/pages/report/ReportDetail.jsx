import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Tag, Button, Radio, Space, Spin, Empty, Drawer, Input, Tooltip, message } from 'antd'
import {
  DownloadOutlined, ArrowLeftOutlined, SyncOutlined, RightOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const statusCfg = {
  passed: { label: '通过', color: '#6ecf96', dot: '#6ecf96' },
  failed: { label: '失败', color: '#f08a8e', dot: '#f08a8e' },
  error: { label: '错误', color: '#f5b87a', dot: '#f5b87a' },
  skipped: { label: '跳过', color: '#bfc4cd', dot: '#bfc4cd' },
  pending: { label: '待录入', color: '#a78bfa', dot: '#a78bfa' },
}

const methodColor = { GET: '#6ecf96', POST: '#7c8cf8', PUT: '#f5b87a', DELETE: '#f08a8e', PATCH: '#a78bfa' }

function fmt(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(2) + 's'
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}

function PassRateRing({ rate, passed, total, size = 160 }) {
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  const pct = total > 0 ? (passed / total) * 100 : 0
  const offset = c - (c * pct) / 100
  const color = pct >= 95 ? '#6ecf96' : pct >= 80 ? '#f5b87a' : '#f08a8e'
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0f0f3" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size/2} y={size/2 - 14} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 13, fill: '#86909c' }}>已完成</text>
      <text x={size/2} y={size/2 + 10} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 28, fontWeight: 700, fill: '#2e3138' }}>{passed ?? 0}</text>
    </svg>
  )
}

function StatusDot({ status }) {
  const cfg = statusCfg[status] || statusCfg.pending
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, display: 'inline-block', flexShrink: 0 }} />
}

export default function ReportDetail() {
  const navigate = useNavigate()
  const { projectId, planId } = useParams()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [modules, setModules] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [tab, setTab] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [stepsCache, setStepsCache] = useState({})
  const [loadingSteps, setLoadingSteps] = useState({})
  const [selectedStep, setSelectedStep] = useState(null)
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
      if (resultsRes.data) setScenarios(resultsRes.data.scenarios || [])
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

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else { next.add(id); loadSteps(id) }
      return next
    })
  }

  const expandAll = () => {
    const autoIds = filtered.filter(s => s.executionType === 'automated').map(s => s.id)
    setExpandedIds(new Set(autoIds))
    autoIds.forEach(id => loadSteps(id))
  }

  const collapseAll = () => setExpandedIds(new Set())

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await api.download(`/projects/${projectId}/plans/${planId}/export/excel`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `report-${planId}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch { message.error('导出失败') } finally { setExporting(false) }
  }

  const filtered = useMemo(() => {
    let list = scenarios
    if (tab !== 'all') list = list.filter(s => s.status === tab)
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(s =>
        (s.scenarioName || '').toLowerCase().includes(kw) ||
        (s.caseCode || '').toLowerCase().includes(kw) ||
        (s.scriptRefFile || '').toLowerCase().includes(kw)
      )
    }
    return list
  }, [scenarios, tab, keyword])

  const counts = {}
  scenarios.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1 })

  // 计算总耗时：如果 summary 没有，从 scenarios 汇总
  const totalDuration = summary?.totalDurationMs || scenarios.reduce((sum, s) => sum + (s.durationMs || 0), 0)

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  if (!summary) return <Empty description="暂无报告数据" />

  const failed = summary.failed + summary.error
  const failRate = summary.totalScenarios > 0 ? (failed / summary.totalScenarios * 100).toFixed(1) : '0.0'

  const renderScenarioRow = (s) => {
    const cfg = statusCfg[s.status] || statusCfg.pending
    const isExpanded = expandedIds.has(s.id)
    const steps = stepsCache[s.id]
    const isAutomatic = s.executionType === 'automated'
    const hasDetail = isAutomatic && (s.executionLog || (steps && steps.length > 0))

    return (
      <div key={s.id}>
        <div
          onClick={() => isAutomatic && toggleExpand(s.id)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid #f5f5f7',
            cursor: isAutomatic ? 'pointer' : 'default',
            background: isExpanded ? '#fafbfc' : '#fff',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (isAutomatic) e.currentTarget.style.background = '#fafbfc' }}
          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#fff' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <StatusDot status={s.status} />
            {isAutomatic && (
              <RightOutlined style={{
                fontSize: 10, color: '#c0c4cc', transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(90deg)' : 'none',
              }} />
            )}
            <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.scenarioName}
            </span>
            {s.scriptRefFile && (
              <span style={{ fontSize: 11, color: '#c0c4cc', fontFamily: 'monospace', flexShrink: 0 }}>
                {s.scriptRefFile}{s.scriptRefFunc ? `::${s.scriptRefFunc}` : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {s.errorSummary && (
              <span style={{ fontSize: 12, color: '#f08a8e', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.errorSummary}
              </span>
            )}
            <Tag style={{ background: isAutomatic ? '#e6f4ff' : '#fff7e6', color: isAutomatic ? '#7c8cf8' : '#f5b87a', border: 'none', fontSize: 11 }}>
              {isAutomatic ? '自动' : '手动'}
            </Tag>
            <span style={{ fontSize: 13, color: '#86909c', fontFamily: 'monospace', minWidth: 50, textAlign: 'right' }}>
              {fmt(s.durationMs)}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div style={{ background: '#fafbfc', borderBottom: '1px solid #f0f0f3' }}>
            {loadingSteps[s.id] ? (
              <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
            ) : steps && steps.length > 0 ? (
              steps.map(step => (
                <div key={step.id}
                  onClick={() => setSelectedStep(step)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 20px 8px 48px',
                    borderBottom: '1px solid #f5f5f7',
                    cursor: 'pointer', fontSize: 13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f5f7'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <StatusDot status={step.status} />
                    <span style={{ fontWeight: 500 }}>{step.stepName}</span>
                    {step.httpMethod && (
                      <span style={{ color: methodColor[step.httpMethod] || '#86909c', fontWeight: 600, fontSize: 12 }}>{step.httpMethod}</span>
                    )}
                    {step.url && (
                      <span style={{ color: '#86909c', fontFamily: 'monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.url}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {step.statusCode && (
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: step.statusCode >= 400 ? '#f08a8e' : '#6ecf96' }}>{step.statusCode}</span>
                    )}
                    <span style={{ fontSize: 12, color: '#c0c4cc', fontFamily: 'monospace', minWidth: 50, textAlign: 'right' }}>{fmt(step.durationMs)}</span>
                  </div>
                </div>
              ))
            ) : s.executionLog ? (
              <div style={{ padding: '12px 20px 12px 48px' }}>
                <pre style={{
                  margin: 0, padding: '12px 16px', background: '#f7f8fa', color: '#2e3138',
                  borderRadius: 6, fontSize: 12, lineHeight: 1.6, overflow: 'auto', maxHeight: 400,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid #f0f0f3',
                }}>{s.executionLog}</pre>
              </div>
            ) : (
              <div style={{ padding: '12px 48px', color: '#bfc4cd', fontSize: 13 }}>暂无执行详情</div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space size={8}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${projectId}/reports`)} />
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>执行报告</h2>
        </Space>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchData}>刷新</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>导出报告</Button>
        </Space>
      </div>

      {/* L1 Summary Card - Centered */}
      <Card style={{ marginBottom: 8 }} styles={{ body: { padding: '32px 40px', display: 'flex', justifyContent: 'center' } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
          <PassRateRing rate={summary.passRate} passed={summary.passed} total={summary.totalScenarios} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6ecf96', display: 'inline-block' }} />
              <span style={{ color: '#4a4a4a' }}>通过</span>
            </div>
            <div style={{ paddingLeft: 18, marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{summary.passed}</span>
              <span style={{ color: '#86909c', marginLeft: 6 }}>({summary.passRate != null ? `${summary.passRate}%` : '-'})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f08a8e', display: 'inline-block' }} />
              <span style={{ color: '#4a4a4a' }}>失败</span>
            </div>
            <div style={{ paddingLeft: 18 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{failed}</span>
              <span style={{ color: '#86909c', marginLeft: 6 }}>({failRate}%)</span>
            </div>
          </div>

          <div style={{ borderLeft: '1px solid #f0f0f3', paddingLeft: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 48px' }}>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>总耗时</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#7c8cf8' }}>{fmt(totalDuration) || '-'}</div>
            </div>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>总用例</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>执行: {summary.totalScenarios}</div>
            </div>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>错误</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#f5b87a' }}>{summary.error}</div>
            </div>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>跳过</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#bfc4cd' }}>{summary.skipped}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter Bar */}
      <Card style={{ marginBottom: 8 }} styles={{ body: { padding: '8px 16px' } }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Space size={12}>
            <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
              <Radio.Button value="all">全部 ({scenarios.length})</Radio.Button>
              {Object.entries(statusCfg).map(([k, v]) => counts[k] ? <Radio.Button key={k} value={k}><span style={{ color: v.color }}>{v.label} ({counts[k]})</span></Radio.Button> : null)}
            </Radio.Group>
            <Input
              prefix={<SearchOutlined style={{ color: '#c0c4cc' }} />}
              placeholder="搜索用例名称或编号"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              allowClear
              size="small"
              style={{ width: 200 }}
            />
            <Tooltip title={expandedIds.size > 0 ? '全部收起' : '全部展开'}>
              <Button type="text" size="small" icon={
                <svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor">
                  {expandedIds.size > 0 ? (
                    <><path d="M352 288l160 160 160-160" fill="none" stroke="currentColor" strokeWidth="80" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M352 576l160 160 160-160" fill="none" stroke="currentColor" strokeWidth="80" strokeLinecap="round" strokeLinejoin="round"/></>
                  ) : (
                    <><path d="M352 448l160-160 160 160" fill="none" stroke="currentColor" strokeWidth="80" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M352 736l160-160 160 160" fill="none" stroke="currentColor" strokeWidth="80" strokeLinecap="round" strokeLinejoin="round"/></>
                  )}
                </svg>
              } onClick={() => expandedIds.size > 0 ? collapseAll() : expandAll()} />
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* Scenario List */}
      <Card styles={{ body: { padding: 0 } }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#bfc4cd' }}>暂无用例</div>
        ) : (
          filtered.map(renderScenarioRow)
        )}
      </Card>

      {/* L4 Step Detail Drawer */}
      <Drawer
        title={selectedStep?.stepName || '步骤详情'}
        open={!!selectedStep}
        onClose={() => setSelectedStep(null)}
        width={560}
        styles={{ body: { padding: '16px 20px', background: '#fafbfc' } }}
      >
        {selectedStep && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot status={selectedStep.status} />
              {selectedStep.httpMethod && (
                <Tag style={{ background: 'transparent', color: methodColor[selectedStep.httpMethod] || '#86909c', border: `1px solid ${methodColor[selectedStep.httpMethod] || '#d9d9d9'}`, fontWeight: 600 }}>
                  {selectedStep.httpMethod}
                </Tag>
              )}
              {selectedStep.statusCode && (
                <Tag style={{ background: selectedStep.statusCode >= 400 ? '#fef0f1' : '#eefbf3', color: selectedStep.statusCode >= 400 ? '#f08a8e' : '#6ecf96', border: 'none' }}>
                  {selectedStep.statusCode}
                </Tag>
              )}
              <span style={{ fontSize: 12, color: '#86909c' }}>{fmt(selectedStep.durationMs)}</span>
            </div>

            {selectedStep.url && (
              <div>
                <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4 }}>URL</div>
                <div style={{ padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f3', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                  {selectedStep.url}
                </div>
              </div>
            )}

            {selectedStep.errorSummary && (
              <div>
                <div style={{ fontSize: 12, color: '#f08a8e', marginBottom: 4 }}>错误信息</div>
                <div style={{ padding: '8px 12px', background: '#fef0f1', borderRadius: 6, border: '1px solid #fde2e4', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {selectedStep.errorSummary}
                </div>
              </div>
            )}

            {selectedStep.requestData && (
              <div>
                <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4 }}>Request Body</div>
                <pre style={{ padding: '12px', background: '#282c34', color: '#abb2bf', borderRadius: 6, fontSize: 12, overflow: 'auto', maxHeight: 300, margin: 0 }}>
                  {typeof selectedStep.requestData === 'string' ? selectedStep.requestData : JSON.stringify(selectedStep.requestData, null, 2)}
                </pre>
              </div>
            )}

            {selectedStep.responseData && (
              <div>
                <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4 }}>Response Body</div>
                <pre style={{ padding: '12px', background: '#282c34', color: '#abb2bf', borderRadius: 6, fontSize: 12, overflow: 'auto', maxHeight: 300, margin: 0 }}>
                  {typeof selectedStep.responseData === 'string' ? selectedStep.responseData : JSON.stringify(selectedStep.responseData, null, 2)}
                </pre>
              </div>
            )}

            {selectedStep.assertions && selectedStep.assertions.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4 }}>断言 ({selectedStep.assertions.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selectedStep.assertions.map((a, i) => (
                    <div key={i} style={{ padding: '6px 10px', background: '#fff', borderRadius: 4, border: '1px solid #f0f0f3', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={a.passed ? 'passed' : 'failed'} />
                      <span>{a.description || a.message || JSON.stringify(a)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
