import { useState, useMemo } from 'react'
import { Card, Tag, Button, Radio, Drawer, Tabs, Table, Space, Tooltip } from 'antd'
import { DownloadOutlined, ShareAltOutlined, UserOutlined, ClockCircleOutlined, RightOutlined, CopyOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { Pie } from '@ant-design/charts'
import { mockReport, getMockSteps, getMockStepDetail } from '../../mock/data'

const statusCfg = {
  passed: { label: '通过', color: '#52c41a', bg: '#f6ffed' },
  failed: { label: '失败', color: '#dc4446', bg: '#fff2f0' },
  error: { label: '错误', color: '#fa8c16', bg: '#fff7e6' },
  flaky: { label: 'Flaky', color: '#d4b106', bg: '#feffe6' },
  skipped: { label: '跳过', color: '#c0c4cc', bg: '#f7f8fa' },
  xfail: { label: '预期失败', color: '#8c8c8c', bg: '#fafafa' },
}
const methodColors = { GET: '#52c41a', POST: '#4C8BF5', PUT: '#fa8c16', DELETE: '#dc4446' }

function fmt(ms) { if (!ms && ms !== 0) return '-'; if (ms < 1000) return ms+'ms'; if (ms < 60000) return (ms/1000).toFixed(1)+'s'; return (ms/60000).toFixed(1)+'min' }
function fmtJson(o) { return JSON.stringify(o, null, 2) }

export default function ReportDetail() {
  const r = mockReport
  const [tab, setTab] = useState('all')
  const [source, setSource] = useState('all')
  const [expandedMods, setExpandedMods] = useState([])
  const [expandedScns, setExpandedScns] = useState([])
  const [steps, setSteps] = useState({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selStep, setSelStep] = useState(null)
  const [stepDetail, setStepDetail] = useState(null)

  // 环形图
  const pieData = Object.entries(statusCfg).filter(([k]) => r.summary[k]).map(([k, v]) => ({ type: v.label, value: r.summary[k], color: v.color }))
  const pieConfig = {
    data: pieData,
    angleField: 'value',
    colorField: 'type',
    color: pieData.map(d => d.color),
    innerRadius: 0.7,
    radius: 0.9,
    label: false,
    legend: false,
    tooltip: { title: 'type', items: [{ channel: 'y', name: '数量', valueFormatter: v => v + ' 个' }] },
    statistic: {
      title: { content: `${r.summary.passRate}%`, style: { fontSize: '24px', fontWeight: 700, color: '#1d2129', lineHeight: '1.2' } },
      content: { content: '通过率', style: { fontSize: '13px', color: '#86909c', marginTop: '4px' } },
    },
    animation: false,
    width: 200, height: 200,
  }

  // 排序模块
  const sortedMods = useMemo(() => [...r.modules].sort((a, b) => (b.failed+b.error) - (a.failed+a.error)), [])

  const getScenarios = (modId) => {
    let s = r.scenarios.filter(x => x.moduleId === modId)
    if (tab !== 'all') s = s.filter(x => x.status === tab)
    if (source !== 'all') s = s.filter(x => x.executionType === source)
    const order = { error:0,failed:1,flaky:2,xfail:3,skipped:4,passed:5 }
    return s.sort((a,b) => (order[a.status]??9)-(order[b.status]??9))
  }

  const toggleMod = id => setExpandedMods(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id])
  const toggleScn = scn => {
    if (scn.executionType === 'manual') return
    const id = scn.scenarioId
    setExpandedScns(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id])
    if (!steps[id]) setSteps(p => ({ ...p, [id]: getMockSteps(id) }))
  }
  const openDetail = step => { setSelStep(step); setStepDetail(getMockStepDetail(step.stepId)); setDrawerOpen(true) }

  const tabCounts = useMemo(() => {
    const c = { all: r.scenarios.length }
    r.scenarios.forEach(s => { c[s.status]=(c[s.status]||0)+1 })
    return c
  }, [])

  return (
    <div>
      {/* 头部 */}
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{r.planName}</h2>
              <Tag style={{ background: '#f6ffed', color: '#52c41a', border: 'none', fontWeight: 600 }}>已完成</Tag>
            </div>
            <Space size={20} style={{ fontSize: 13, color: '#86909c' }}>
              <span><UserOutlined style={{ marginRight: 4 }} />{r.executedBy}</span>
              <span><ClockCircleOutlined style={{ marginRight: 4 }} />{r.executedAt}</span>
              <span><EnvironmentOutlined style={{ marginRight: 4 }} /><Tag size="small" style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{r.environment}</Tag></span>
            </Space>
          </div>
          <Space>
            <Button icon={<DownloadOutlined />}>导出 HTML</Button>
            <Button icon={<ShareAltOutlined />}>分享</Button>
          </Space>
        </div>
      </Card>

      {/* 第一层：仪表盘 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {/* 环形图 */}
        <Card style={{ width: 260, flexShrink: 0 }} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, padding: 16 } }}>
          <Pie {...pieConfig} />
        </Card>

        {/* 指标卡片 */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: '1fr 1fr', gap: 12 }}>
          {Object.entries(statusCfg).map(([k, v]) => (
            <Card key={k} styles={{ body: { padding: '14px 12px', textAlign: 'center' } }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: v.color, lineHeight: 1.2 }}>{r.summary[k]||0}</div>
              <div style={{ fontSize: 12, color: '#86909c', marginTop: 4 }}>{v.label}</div>
            </Card>
          ))}
          {[
            { label: '总场景', value: r.summary.totalScenarios },
            { label: '总耗时', value: fmt(r.summary.totalDurationMs) },
            { label: '平均耗时', value: fmt(r.summary.avgScenarioDurationMs) },
            { label: 'HTTP请求', value: r.summary.totalRequests },
            { label: '断言数', value: r.summary.totalAssertions },
            { label: '失败断言', value: r.summary.failedAssertions, danger: r.summary.failedAssertions > 0 },
          ].map((item, i) => (
            <Card key={i} styles={{ body: { padding: '14px 12px', textAlign: 'center' } }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: item.danger ? '#dc4446' : '#1d2129', lineHeight: 1.2 }}>{item.value}</div>
              <div style={{ fontSize: 12, color: '#86909c', marginTop: 4 }}>{item.label}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* 筛选栏 */}
      <Card styles={{ body: { padding: '10px 20px' } }} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Radio.Group value={tab} onChange={e => setTab(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="all">全部 ({tabCounts.all})</Radio.Button>
            {Object.entries(statusCfg).map(([k,v]) => tabCounts[k] ? <Radio.Button key={k} value={k}><span style={{ color: tab===k?'#fff':v.color }}>{v.label} ({tabCounts[k]})</span></Radio.Button> : null)}
          </Radio.Group>
          <Radio.Group value={source} onChange={e => setSource(e.target.value)} size="small" buttonStyle="solid">
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="automated">仅自动化</Radio.Button>
            <Radio.Button value="manual">仅手动</Radio.Button>
          </Radio.Group>
        </div>
      </Card>

      {/* 第二层：模块分组 + 第三层：场景列表 */}
      {sortedMods.map(mod => (
        <div key={mod.moduleId} style={{ marginBottom: 8 }}>
          {/* 模块行 */}
          <div
            onClick={() => toggleMod(mod.moduleId)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 20px', background: '#fff', borderRadius: 12,
              border: '1px solid #f2f3f5', cursor: 'pointer',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <RightOutlined style={{ fontSize: 11, color: '#c0c4cc', transition: 'transform 0.2s', transform: expandedMods.includes(mod.moduleId)?'rotate(90deg)':'none' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{mod.label}</span>
              <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none', fontSize: 12 }}>{mod.code}</Tag>
              <span style={{ fontSize: 13, color: '#c0c4cc' }}>{mod.scenarioCount} 个场景</span>
            </div>
            <Space size={16}>
              {mod.passed > 0 && <span style={{ fontSize: 13, color: '#52c41a' }}>{mod.passed} 通过</span>}
              {mod.failed > 0 && <span style={{ fontSize: 13, color: '#dc4446', fontWeight: 600 }}>{mod.failed} 失败</span>}
              {mod.error > 0 && <span style={{ fontSize: 13, color: '#fa8c16', fontWeight: 600 }}>{mod.error} 错误</span>}
              {mod.flaky > 0 && <span style={{ fontSize: 13, color: '#d4b106' }}>{mod.flaky} Flaky</span>}
              <span style={{ fontSize: 13, color: '#c0c4cc' }}>{fmt(mod.durationMs)}</span>
            </Space>
          </div>

          {/* 场景列表 */}
          {expandedMods.includes(mod.moduleId) && (
            <div style={{ marginLeft: 24, marginTop: 4 }}>
              {getScenarios(mod.moduleId).map(scn => (
                <div key={scn.scenarioId} style={{ marginBottom: 4 }}>
                  {/* 场景行 */}
                  <div
                    onClick={() => toggleScn(scn)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 16px', background: '#fff', borderRadius: 10,
                      borderLeft: `3px solid ${statusCfg[scn.status]?.color || '#ddd'}`,
                      border: '1px solid #f2f3f5',
                      cursor: scn.executionType === 'automated' ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (scn.executionType==='automated') e.currentTarget.style.background='#fafbfc' }}
                    onMouseLeave={e => e.currentTarget.style.background='#fff'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {scn.executionType === 'automated' && <RightOutlined style={{ fontSize: 10, color: '#c0c4cc', transition: 'transform 0.2s', transform: expandedScns.includes(scn.scenarioId)?'rotate(90deg)':'none' }} />}
                      <Tag style={{ background: statusCfg[scn.status].bg, color: statusCfg[scn.status].color, border: 'none', minWidth: 52, textAlign: 'center' }}>
                        {statusCfg[scn.status].label}
                      </Tag>
                      <span style={{ fontSize: 13 }}>{scn.name}</span>
                      <Tag style={{ background: scn.executionType==='automated'?'#e6f4ff':'#fff7e6', color: scn.executionType==='automated'?'#4C8BF5':'#fa8c16', border: 'none', fontSize: 11 }}>
                        {scn.executionType==='automated'?'自动':'手动'}
                      </Tag>
                    </div>
                    <Space size={14} style={{ fontSize: 13, color: '#c0c4cc' }}>
                      {scn.executionType==='automated' && <span>{scn.stepCount} steps</span>}
                      {scn.assignee && <span>{scn.assignee}</span>}
                      <span>{fmt(scn.durationMs)}</span>
                    </Space>
                  </div>
                  {/* 错误/备注 */}
                  {(scn.errorSummary || scn.remark) && (
                    <div style={{ marginLeft: 36, padding: '4px 0', fontSize: 12, color: scn.errorSummary ? '#dc4446' : '#86909c' }}>
                      {scn.errorSummary || `备注: ${scn.remark}`}
                    </div>
                  )}

                  {/* 步骤列表 */}
                  {expandedScns.includes(scn.scenarioId) && steps[scn.scenarioId] && (
                    <div style={{ marginLeft: 36, marginTop: 2, borderRadius: 8, overflow: 'hidden', border: '1px solid #f2f3f5' }}>
                      {steps[scn.scenarioId].map((step, idx) => (
                        <div
                          key={step.stepId}
                          onClick={() => openDetail(step)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 14px', fontSize: 13,
                            background: step.status==='failed'?'#fffbfb':'#fff',
                            borderBottom: idx < steps[scn.scenarioId].length-1 ? '1px solid #f8f8f8' : 'none',
                            cursor: 'pointer', transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = step.status==='failed'?'#fff5f5':'#fafbfc'}
                          onMouseLeave={e => e.currentTarget.style.background = step.status==='failed'?'#fffbfb':'#fff'}
                        >
                          <span style={{ fontSize: 14 }}>{step.status==='passed'?'✅':'❌'}</span>
                          <Tag style={{ background: methodColors[step.method], color: '#fff', border: 'none', minWidth: 48, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>
                            {step.method}
                          </Tag>
                          <span style={{ color: '#4e5969', flex: 1 }}>{step.name}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#c0c4cc' }}>{step.url}</span>
                          <Tag style={{ background: step.statusCode===200?'#f6ffed':'#fff2f0', color: step.statusCode===200?'#52c41a':'#dc4446', border: 'none', fontSize: 11 }}>{step.statusCode}</Tag>
                          <span style={{ color: '#c0c4cc', minWidth: 48, textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{step.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 第四层：详情面板 */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={selStep?.name || '步骤详情'} width={520}
        styles={{ header: { borderBottom: '1px solid #f2f3f5' }, body: { padding: '16px 24px' } }}>
        {selStep && stepDetail && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: '#fafbfc', borderRadius: 10 }}>
              <Tag style={{ background: methodColors[selStep.method], color: '#fff', border: 'none', fontWeight: 600 }}>{selStep.method}</Tag>
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#4e5969' }}>{selStep.url}</span>
              <Tag style={{ background: selStep.statusCode===200?'#f6ffed':'#fff2f0', color: selStep.statusCode===200?'#52c41a':'#dc4446', border: 'none' }}>{selStep.statusCode}</Tag>
              <span style={{ fontSize: 13, color: '#86909c' }}>{selStep.durationMs}ms</span>
            </div>

            <Tabs items={[
              { key: 'req', label: 'Request', children: (
                <div>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>Headers</h4>
                  <pre className="json-view">{fmtJson(stepDetail.request.headers)}</pre>
                  <h4 style={{ fontSize: 13, color: '#86909c', margin: '16px 0 8px' }}>Params</h4>
                  <pre className="json-view">{fmtJson(stepDetail.request.params)}</pre>
                  <h4 style={{ fontSize: 13, color: '#86909c', margin: '16px 0 8px' }}>Body</h4>
                  <pre className="json-view">{fmtJson(stepDetail.request.body)}</pre>
                </div>
              )},
              { key: 'res', label: 'Response', children: (
                <div>
                  <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#86909c' }}>Status:</span>
                    <Tag style={{ background: stepDetail.response.statusCode===200?'#f6ffed':'#fff2f0', color: stepDetail.response.statusCode===200?'#52c41a':'#dc4446', border: 'none' }}>{stepDetail.response.statusCode}</Tag>
                  </div>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>Headers</h4>
                  <pre className="json-view">{fmtJson(stepDetail.response.headers)}</pre>
                  <h4 style={{ fontSize: 13, color: '#86909c', margin: '16px 0 8px' }}>Body</h4>
                  <pre className="json-view">{fmtJson(stepDetail.response.body)}</pre>
                </div>
              )},
              { key: 'assert', label: '断言', children: (
                <Table dataSource={stepDetail.assertions} rowKey="id" size="small" pagination={false}
                  columns={[
                    { title: '类型', dataIndex: 'type', width: 100 },
                    { title: '表达式', dataIndex: 'expression' },
                    { title: '期望', dataIndex: 'expected', width: 90 },
                    { title: '实际', dataIndex: 'actual', width: 90 },
                    { title: '结果', width: 60, align: 'center', render: (_,r) => <span>{r.passed?'✅':'❌'}</span> },
                  ]} />
              )},
            ]} />

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f2f3f5' }}>
              <Button icon={<CopyOutlined />} type="primary" ghost size="small">复制 curl 命令</Button>
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}
