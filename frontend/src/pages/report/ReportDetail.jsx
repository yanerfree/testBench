import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Tag, Button, Radio, Space, Spin, Empty, Drawer, Input, Tooltip, message } from 'antd'
import {
  DownloadOutlined, ArrowLeftOutlined, SyncOutlined, RightOutlined,
  SearchOutlined, CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled,
  ClockCircleOutlined, MinusCircleFilled, LoadingOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const statusCfg = {
  passed: { label: '通过', color: '#6ecf96', dot: '#6ecf96' },
  failed: { label: '失败', color: '#f08a8e', dot: '#f08a8e' },
  error: { label: '错误', color: '#f5b87a', dot: '#f5b87a' },
  skipped: { label: '跳过', color: '#bfc4cd', dot: '#bfc4cd' },
  running: { label: '执行中', color: '#7c8cf8', dot: '#7c8cf8' },
  pending: { label: '待执行', color: '#c0c4cc', dot: '#c0c4cc' },
}

const methodColor = { GET: '#6ecf96', POST: '#7c8cf8', PUT: '#f5b87a', DELETE: '#f08a8e', PATCH: '#a78bfa' }

function fmt(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(2) + 's'
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}

function PassRateRing({ rate, passed, total, size = 160, running = false, done = 0 }) {
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  const pct = running ? (total > 0 ? (done / total) * 100 : 0) : (total > 0 ? (passed / total) * 100 : 0)
  const offset = c - (c * pct) / 100
  const color = running ? '#7c8cf8' : pct >= 95 ? '#6ecf96' : pct >= 80 ? '#f5b87a' : '#f08a8e'
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0f0f3" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={size/2} y={size/2 - 14} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 13, fill: running ? '#7c8cf8' : '#86909c' }}>{running ? '执行中' : '已完成'}</text>
      <text x={size/2} y={size/2 + 10} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: running ? 22 : 28, fontWeight: 700, fill: '#2e3138' }}>
        {running ? `${done}/${total}` : (passed ?? 0)}
      </text>
    </svg>
  )
}

function StatusIcon({ status, size = 16 }) {
  const s = { fontSize: size, lineHeight: 1 }
  switch (status) {
    case 'passed': return <CheckCircleFilled style={{ ...s, color: '#6ecf96' }} />
    case 'failed': return <CloseCircleFilled style={{ ...s, color: '#f08a8e' }} />
    case 'error': return <ExclamationCircleFilled style={{ ...s, color: '#f5b87a' }} />
    case 'skipped': return <MinusCircleFilled style={{ ...s, color: '#bfc4cd' }} />
    case 'running': return <LoadingOutlined style={{ ...s, color: '#7c8cf8' }} spin />
    default: return <ClockCircleOutlined style={{ ...s, color: '#c0c4cc' }} />
  }
}

function StatusDot({ status }) {
  return <StatusIcon status={status} size={14} />
}

function parseExecutionLog(log) {
  if (!log) return { testName: null, result: null, duration: null, errorLines: [], outputLines: [] }
  const lines = log.split('\n')
  let testName = null, result = null, duration = null
  const errorLines = []
  const outputLines = []
  let inError = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 提取测试结果行: tests/e2e/test_smoke.py::TestClass::test_func PASSED
    const resultMatch = trimmed.match(/^(tests\/\S+::\S+)\s+(PASSED|FAILED|ERROR)/i)
    if (resultMatch) {
      testName = resultMatch[1]
      result = resultMatch[2]
      continue
    }

    // 提取耗时: 1 passed in 0.71s / 1 failed in 2.3s
    const durMatch = trimmed.match(/(\d+)\s+(?:passed|failed|error).*?in\s+([\d.]+s)/i)
    if (durMatch) { duration = durMatch[2]; continue }

    // 跳过 pytest header/footer 噪音
    if (trimmed.startsWith('===') || trimmed.startsWith('---') || trimmed.startsWith('platform ')
      || trimmed.startsWith('cachedir:') || trimmed.startsWith('rootdir:')
      || trimmed.startsWith('configfile:') || trimmed.startsWith('plugins:')
      || trimmed.startsWith('asyncio:') || trimmed.startsWith('collecting')
      || trimmed.startsWith('collected') || trimmed.startsWith('generated xml')) continue

    // 错误/断言行
    if (trimmed.startsWith('E ') || trimmed.startsWith('> ') || trimmed.includes('AssertionError')
      || trimmed.includes('assert ') || trimmed.startsWith('FAILED')) {
      inError = true
      errorLines.push(line)
      continue
    }
    if (inError && (trimmed.startsWith('  ') || trimmed.startsWith('File '))) {
      errorLines.push(line)
      continue
    }
    inError = false

    // 其余有意义的输出
    if (trimmed.length > 2) outputLines.push(line)
  }

  return { testName, result, duration, errorLines, outputLines }
}

function ScenarioExpanded({ scenario }) {
  const { caseSteps, preconditions, expectedResult, errorSummary, executionLog, status, scriptRefFile, scriptRefFunc, durationMs, remark, startedAt, completedAt } = scenario
  const isFailed = status === 'failed' || status === 'error'
  const isPassed = status === 'passed'
  const parsed = parseExecutionLog(executionLog)
  const hasRetry = remark && remark.includes('重试')

  return (
    <div style={{ padding: '16px 20px 16px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 执行信息卡片 */}
      <div style={{ padding: '12px 16px', background: isPassed ? '#f0faf4' : isFailed ? '#fef0f1' : '#f7f8fa', borderRadius: 8, border: `1px solid ${isPassed ? '#d4edda' : isFailed ? '#fde2e4' : '#f0f0f3'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusIcon status={status} size={18} />
            <span style={{ fontWeight: 600, fontSize: 14, color: isPassed ? '#6ecf96' : isFailed ? '#f08a8e' : '#86909c' }}>
              {isPassed ? '执行通过' : isFailed ? '执行失败' : status === 'skipped' ? '已跳过' : status === 'running' ? '执行中' : '待执行'}
            </span>
            {hasRetry && (
              <Tag style={{ background: '#fff7e6', color: '#f5b87a', border: 'none', fontSize: 11 }}>{remark}</Tag>
            )}
          </div>
          <span style={{ fontSize: 13, color: '#86909c', fontFamily: 'monospace' }}>
            {durationMs ? fmt(durationMs) : parsed.duration || '-'}
          </span>
        </div>
        {(scriptRefFile || parsed.testName) && (
          <div style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>
            {parsed.testName || `${scriptRefFile}${scriptRefFunc ? `::${scriptRefFunc}` : ''}`}
          </div>
        )}
        {startedAt && (
          <div style={{ fontSize: 12, color: '#86909c', marginTop: 4 }}>
            开始: {new Date(startedAt).toLocaleString('zh-CN')}
            {completedAt && <span style={{ marginLeft: 16 }}>结束: {new Date(completedAt).toLocaleString('zh-CN')}</span>}
          </div>
        )}
      </div>

      {/* 失败原因 */}
      {isFailed && (errorSummary || parsed.errorLines.length > 0) && (
        <div>
          <div style={{ fontSize: 12, color: '#f08a8e', marginBottom: 6, fontWeight: 600 }}>失败原因</div>
          {errorSummary && (
            <div style={{ fontSize: 13, color: '#d9534f', padding: '10px 14px', background: '#fef0f1', borderRadius: 6, border: '1px solid #fde2e4', marginBottom: parsed.errorLines.length > 0 ? 8 : 0, lineHeight: 1.6 }}>
              {errorSummary}
            </div>
          )}
          {parsed.errorLines.length > 0 && (
            <pre style={{
              margin: 0, padding: '10px 14px', background: '#fafbfc', color: '#d9534f',
              borderRadius: 6, fontSize: 12, lineHeight: 1.5, overflow: 'auto', maxHeight: 200,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid #f0f0f3',
              fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
            }}>{parsed.errorLines.join('\n')}</pre>
          )}
        </div>
      )}

      {/* 用例步骤（如果有定义） */}
      {caseSteps && caseSteps.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#86909c', marginBottom: 6, fontWeight: 600 }}>测试步骤</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {caseSteps.map((step, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 12px',
                background: '#fff', borderRadius: 6, border: '1px solid #f0f0f3',
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: '#fff',
                  background: isPassed ? '#6ecf96' : '#c0c4cc',
                }}>{step.seq || i + 1}</span>
                <span style={{ fontSize: 13, color: '#4a4a4a', lineHeight: 1.5 }}>{step.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 执行日志（始终展示） */}
      {executionLog && (
        <div>
          <div style={{ fontSize: 12, color: '#86909c', marginBottom: 6, fontWeight: 600 }}>执行日志</div>
          <pre style={{
            margin: 0, padding: '12px 14px', background: '#fafbfc', color: '#4a4a4a',
            borderRadius: 6, fontSize: 12, lineHeight: 1.6, overflow: 'auto', maxHeight: 300,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid #f0f0f3',
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', monospace",
          }}>{executionLog}</pre>
        </div>
      )}

      {/* 预期结果 */}
      {expectedResult && (
        <div>
          <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4, fontWeight: 600 }}>预期结果</div>
          <div style={{ fontSize: 13, color: '#4a4a4a', padding: '8px 14px', background: '#f0faf4', borderRadius: 6, border: '1px solid #d4edda', lineHeight: 1.5 }}>
            {expectedResult}
          </div>
        </div>
      )}

      {/* 前置条件 */}
      {preconditions && (
        <div>
          <div style={{ fontSize: 12, color: '#86909c', marginBottom: 4, fontWeight: 600 }}>前置条件</div>
          <div style={{ fontSize: 13, color: '#86909c', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{preconditions}</div>
        </div>
      )}

      {!executionLog && !(caseSteps && caseSteps.length > 0) && (
        <div style={{ color: '#bfc4cd', fontSize: 13 }}>暂无执行详情</div>
      )}
    </div>
  )
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
    setLoading(prev => prev)
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

  // 执行中自动轮询
  const isRunning = summary && !summary.completedAt
  useEffect(() => {
    if (!isRunning) return
    const poll = setInterval(() => fetchData(), 3000)
    return () => clearInterval(poll)
  }, [isRunning, fetchData])

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
  const doneCount = scenarios.filter(s => s.status !== 'pending').length

  // 计算总耗时：如果 summary 没有，从 scenarios 汇总
  const totalDuration = summary?.totalDurationMs || scenarios.reduce((sum, s) => sum + (s.durationMs || 0), 0)

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  if (!summary) return <Empty description="暂无报告数据" />

  // 执行中时从 scenarios 实时计算统计数据
  const livePassed = isRunning ? (counts.passed || 0) : summary.passed
  const liveFailed = isRunning ? ((counts.failed || 0) + (counts.error || 0)) : (summary.failed + summary.error)
  const liveError = isRunning ? (counts.error || 0) : summary.error
  const liveSkipped = isRunning ? (counts.skipped || 0) : summary.skipped
  const liveTotal = summary.totalScenarios
  const liveRate = doneCount > 0 ? (livePassed / (livePassed + liveFailed) * 100).toFixed(1) : null
  const failRate = liveTotal > 0 ? (liveFailed / liveTotal * 100).toFixed(1) : '0.0'

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {s.remark && s.remark.includes('重试') && (
              <Tag style={{ background: '#fff7e6', color: '#f5b87a', border: 'none', fontSize: 11 }}>{s.remark}</Tag>
            )}
            {s.errorSummary && (
              <span style={{ fontSize: 12, color: '#f08a8e', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.errorSummary}
              </span>
            )}
            <Tag style={{ background: isAutomatic ? '#e6f4ff' : '#fff7e6', color: isAutomatic ? '#7c8cf8' : '#f5b87a', border: 'none', fontSize: 11 }}>
              {isAutomatic ? '自动' : '手动'}
            </Tag>
            {s.startedAt && (
              <span style={{ fontSize: 11, color: '#c0c4cc' }}>
                {new Date(s.startedAt).toLocaleTimeString('zh-CN')}
                {s.completedAt ? ` ~ ${new Date(s.completedAt).toLocaleTimeString('zh-CN')}` : ''}
              </span>
            )}
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
            ) : (
              <ScenarioExpanded scenario={s} />
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
          <PassRateRing rate={liveRate} passed={livePassed} total={liveTotal} running={isRunning} done={doneCount} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6ecf96', display: 'inline-block' }} />
              <span style={{ color: '#4a4a4a' }}>通过</span>
            </div>
            <div style={{ paddingLeft: 18, marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{livePassed}</span>
              <span style={{ color: '#86909c', marginLeft: 6 }}>({liveRate != null ? `${liveRate}%` : '-'})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f08a8e', display: 'inline-block' }} />
              <span style={{ color: '#4a4a4a' }}>失败</span>
            </div>
            <div style={{ paddingLeft: 18 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{liveFailed}</span>
              <span style={{ color: '#86909c', marginLeft: 6 }}>({failRate}%)</span>
            </div>
          </div>

          <div style={{ borderLeft: '1px solid #f0f0f3', paddingLeft: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 48px' }}>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>总耗时</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#7c8cf8' }}>{fmt(totalDuration) || '-'}</div>
            </div>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>{isRunning ? '进度' : '总用例'}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{isRunning ? `${doneCount} / ${liveTotal}` : `执行: ${liveTotal}`}</div>
            </div>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>错误</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#f5b87a' }}>{liveError}</div>
            </div>
            <div>
              <div style={{ color: '#86909c', fontSize: 13, marginBottom: 4 }}>跳过</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#bfc4cd' }}>{liveSkipped}</div>
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
