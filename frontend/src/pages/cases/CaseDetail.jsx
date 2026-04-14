import { useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Tag, Button, Input, Select, Space, Divider, Modal, message, Tabs, Timeline, Switch, Popover, Tooltip } from 'antd'
import {
  ArrowLeftOutlined, PlayCircleOutlined, SaveOutlined,
  CheckCircleFilled, CloseCircleFilled, LoadingOutlined,
  ExperimentOutlined, BugOutlined, PlusOutlined, DeleteOutlined, HolderOutlined,
  ThunderboltOutlined, TagOutlined, AppstoreOutlined, BranchesOutlined, ApiOutlined,
  FlagOutlined, WarningOutlined,
} from '@ant-design/icons'
import { mockCases, mockModules, mockEnvironments } from '../../mock/data'

const priorityColors = { P0: '#f08a8e', P1: '#f5b87a', P2: '#7c8cf8', P3: '#a8adb6' }
const priorityBg = { P0: '#fef0f1', P1: '#fef5eb', P2: '#f0f1fe', P3: '#f5f5f7' }
const statusColors = { '已自动化': '#6ecf96', '待自动化': '#f5b87a', '脚本已移除': '#f08a8e' }
const statusBg = { '已自动化': '#eefbf3', '待自动化': '#fef5eb', '脚本已移除': '#fef0f1' }

function InlineProp({ icon, value, color, bg, children }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomLeft"
      content={<div style={{ minWidth: 150 }} onClick={e => e.stopPropagation()}>{children}</div>}
      arrow={false} styles={{ body: { padding: 8 } }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px 2px 6px',
        borderRadius: 6, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
        background: bg || '#f7f8fa', color: color || '#4e5969', border: '1px solid transparent',
        userSelect: 'none', lineHeight: '22px',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#e5e6eb'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
        {icon && <span style={{ fontSize: 11, color: color || '#86909c', display: 'flex' }}>{icon}</span>}
        <span style={{ fontWeight: 500, color: color || '#4e5969' }}>{value}</span>
      </div>
    </Popover>
  )
}

function ReadonlyProp({ icon, label, value, bg }) {
  return (
    <Tooltip title={label}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px 2px 6px',
        borderRadius: 6, fontSize: 12, background: bg || '#f7f8fa', lineHeight: '22px',
      }}>
        {icon && <span style={{ fontSize: 11, color: '#86909c', display: 'flex' }}>{icon}</span>}
        {label && <span style={{ color: '#86909c' }}>{label}</span>}
        <span style={{ fontWeight: 500, color: '#4e5969' }}>{value}</span>
      </div>
    </Tooltip>
  )
}

function DropdownList({ items, activeKey, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map(item => (
        <div key={item.key} onClick={() => onSelect(item.key)} style={{
          padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
          background: activeKey === item.key ? '#f0f7ff' : 'transparent',
          fontWeight: activeKey === item.key ? 600 : 400,
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
          onMouseLeave={e => e.currentTarget.style.background = activeKey === item.key ? '#f0f7ff' : 'transparent'}>
          {item.dot && <span style={{ width: 8, height: 8, borderRadius: item.dot === 'circle' ? '50%' : 2, background: item.color, flexShrink: 0 }} />}
          {item.icon && <span>{item.icon}</span>}
          {item.label}
        </div>
      ))}
    </div>
  )
}

export default function CaseDetail() {
  const { projectId, caseId } = useParams()
  const navigate = useNavigate()
  const originalCase = useMemo(() => mockCases.find(c => c.id === caseId) || mockCases[0], [caseId])

  const [runModalOpen, setRunModalOpen] = useState(false)
  const [runStatus, setRunStatus] = useState('idle')
  const [runEnv, setRunEnv] = useState('staging')

  // 所有字段始终可编辑
  const [title, setTitle] = useState(originalCase.title)
  const [type, setType] = useState(originalCase.type)
  const [priority, setPriority] = useState(originalCase.priority)
  const [moduleId, setModuleId] = useState(originalCase.moduleId)
  const [subModuleId, setSubModuleId] = useState(originalCase.subModuleId)
  const [autoStatus, setAutoStatus] = useState(originalCase.status)
  const [flaky, setFlaky] = useState(originalCase.flaky)
  const [preconditions, setPreconditions] = useState('1. 用户账号已存在\n2. 处于未登录状态')
  const [expectedResult, setExpectedResult] = useState('接口返回正确数据，状态变更符合业务预期')
  const [scriptRef, setScriptRef] = useState(`tests/api/auth/test_${originalCase.id.toLowerCase().replace(/-/g, '_')}.py`)
  const [remark, setRemark] = useState('')
  const [steps, setSteps] = useState([
    { seq: 1, action: '发送登录请求 POST /api/auth/login' },
    { seq: 2, action: '携带 token 请求目标接口' },
    { seq: 3, action: '校验响应数据字段完整性' },
    { seq: 4, action: '校验业务逻辑正确性' },
  ])

  // 脏检查：用 useRef 记录上次保存时的值
  const initialSnap = useMemo(() => JSON.stringify({
    title: originalCase.title, type: originalCase.type, priority: originalCase.priority,
    moduleId: originalCase.moduleId, subModuleId: originalCase.subModuleId,
    autoStatus: originalCase.status, flaky: originalCase.flaky,
    preconditions: '1. 用户账号已存在\n2. 处于未登录状态',
    expectedResult: '接口返回正确数据，状态变更符合业务预期',
    scriptRef: `tests/api/auth/test_${originalCase.id.toLowerCase().replace(/-/g, '_')}.py`,
    remark: '',
    steps: [
      { seq: 1, action: '发送登录请求 POST /api/auth/login' },
      { seq: 2, action: '携带 token 请求目标接口' },
      { seq: 3, action: '校验响应数据字段完整性' },
      { seq: 4, action: '校验业务逻辑正确性' },
    ],
  }), [])
  const savedRef = useRef(initialSnap)
  const currentSnap = JSON.stringify({ title, type, priority, moduleId, subModuleId, autoStatus, flaky, preconditions, expectedResult, scriptRef, remark, steps })
  const isDirty = currentSnap !== savedRef.current

  const currentModule = mockModules.find(m => m.id === moduleId)
  const subModuleOptions = currentModule?.subs || []
  const currentSub = subModuleOptions.find(s => s.id === subModuleId)

  const addStep = () => setSteps(prev => [...prev, { seq: prev.length + 1, action: '' }])
  const removeStep = (idx) => setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))
  const updateStep = (idx, value) => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, action: value } : s))

  const handleSave = () => {
    savedRef.current = currentSnap
    message.success('保存成功')
  }
  const handleRun = () => {
    setRunStatus('running')
    setTimeout(() => setRunStatus(Math.random() > 0.3 ? 'passed' : 'failed'), 2500)
  }

  const history = [
    { time: '2026-04-14 08:35', status: 'passed', plan: 'Sprint 12 回归', duration: '2.3s', env: 'staging' },
    { time: '2026-04-13 22:10', status: 'failed', plan: 'Sprint 12 冒烟', duration: '4.1s', env: 'staging', error: '预期状态码200，实际500' },
    { time: '2026-04-12 15:00', status: 'passed', plan: 'Sprint 11 回归', duration: '1.8s', env: 'production' },
    { time: '2026-04-10 09:30', status: 'passed', plan: '每日冒烟', duration: '2.0s', env: 'staging' },
  ]

  return (
    <div>
      {/* 面包屑 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} size="small"
          onClick={() => navigate(`/projects/${projectId}/cases`)} style={{ color: '#86909c' }} />
        <span style={{ fontSize: 12, color: '#c0c4cc' }}>用例管理</span>
        <span style={{ color: '#e5e6eb', fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>{originalCase.id}</span>
      </div>

      {/* 标题栏 */}
      <Card styles={{ body: { padding: '16px 20px' } }} style={{ marginBottom: 16 }}>
        {/* 第一行：保存 + 标题 + 环境选择 + 执行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Button type="primary" size="small" icon={<SaveOutlined />}
            disabled={!isDirty} onClick={handleSave}>保存</Button>
          <Input value={title} onChange={e => setTitle(e.target.value)} variant="borderless"
            style={{ fontSize: 16, fontWeight: 600, flex: 1, padding: '2px 4px' }} />
          <Select value={runEnv} onChange={setRunEnv} size="small" style={{ width: 170, flexShrink: 0 }}
            placeholder="选择环境"
            options={mockEnvironments.map(e => ({ value: e.name, label: `${e.name} (${e.label})` }))} />
          <Button type="primary" size="small" icon={<PlayCircleOutlined />}
            onClick={() => { setRunModalOpen(true); setRunStatus('idle') }}>执行</Button>
        </div>

        {/* 第二行：属性标签 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <ReadonlyProp icon={<TagOutlined />} value={originalCase.id} />

          <InlineProp icon={<FlagOutlined />} value={priority} color={priorityColors[priority]} bg={priorityBg[priority]}>
            <DropdownList activeKey={priority} onSelect={setPriority}
              items={['P0','P1','P2','P3'].map(p => ({ key: p, label: p, dot: 'square', color: priorityColors[p] }))} />
          </InlineProp>

          <InlineProp icon={<ApiOutlined />} value={type} color={type==='API'?'#7c8cf8':'#6ecf96'} bg={type==='API'?'#e6f4ff':'#f6ffed'}>
            <DropdownList activeKey={type} onSelect={setType}
              items={['API','E2E'].map(t => ({ key: t, label: t }))} />
          </InlineProp>

          <InlineProp icon={<AppstoreOutlined />} value={currentModule?.label || '-'}>
            <DropdownList activeKey={moduleId} onSelect={v => { setModuleId(v); setSubModuleId(mockModules.find(m=>m.id===v)?.subs[0]?.id || null) }}
              items={mockModules.map(m => ({ key: m.id, label: `${m.icon} ${m.label}` }))} />
          </InlineProp>

          <InlineProp icon={<BranchesOutlined />} value={currentSub?.label || '-'}>
            <DropdownList activeKey={subModuleId} onSelect={setSubModuleId}
              items={subModuleOptions.map(s => ({ key: s.id, label: s.label }))} />
          </InlineProp>

          <InlineProp icon={<ThunderboltOutlined />} value={autoStatus} color={statusColors[autoStatus]} bg={statusBg[autoStatus]}>
            <DropdownList activeKey={autoStatus} onSelect={setAutoStatus}
              items={['已自动化','待自动化','脚本已移除'].map(s => ({ key: s, label: s, dot: 'circle', color: statusColors[s] }))} />
          </InlineProp>

          <InlineProp icon={<WarningOutlined />} value={flaky ? 'Flaky' : '正常'} color={flaky ? '#f5b87a' : '#86909c'} bg={flaky ? '#fff7e6' : '#f7f8fa'}>
            <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 13 }}>Flaky 标记</span>
              <Switch size="small" checked={flaky} onChange={v => { setFlaky(v); message.success(v ? '已标记为 Flaky' : '已取消 Flaky') }} />
            </div>
          </InlineProp>

          <ReadonlyProp label="来源" value={originalCase.source} />
        </div>
      </Card>

      {/* 主体 */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Tabs defaultActiveKey="info" items={[
            { key: 'info', label: '用例信息', children: (
              <Card styles={{ body: { padding: '16px 20px' } }}>
                {/* 前置条件 */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>前置条件</h4>
                  <Input.TextArea rows={2} value={preconditions} onChange={e => setPreconditions(e.target.value)}
                    style={{ background: '#fafbfc', borderColor: '#f2f3f5' }}
                    autoSize={{ minRows: 2, maxRows: 6 }} />
                </div>

                {/* 测试步骤 */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ fontSize: 13, color: '#86909c', margin: 0 }}>测试步骤</h4>
                    <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addStep}>添加步骤</Button>
                  </div>
                  <div style={{ borderRadius: 10, border: '1px solid #f2f3f5', overflow: 'hidden' }}>
                    {steps.map((s, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '8px 14px', fontSize: 13,
                        background: i % 2 === 0 ? '#fff' : '#fafbfc',
                        borderBottom: i < steps.length - 1 ? '1px solid #f8f8f8' : 'none',
                        alignItems: 'center',
                      }}>
                        <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', flexShrink: 0 }} />
                        <span style={{
                          width: 24, height: 24, borderRadius: 6, background: '#e6f4ff', color: '#7c8cf8',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0,
                        }}>{s.seq}</span>
                        <Input value={s.action} onChange={e => updateStep(i, e.target.value)}
                          placeholder="描述操作步骤..." variant="borderless"
                          style={{ flex: 1, fontSize: 13 }} />
                        <Button type="text" danger size="small" icon={<DeleteOutlined />}
                          onClick={() => removeStep(i)} disabled={steps.length <= 1}
                          style={{ flexShrink: 0, opacity: steps.length <= 1 ? 0.3 : 1 }} />
                      </div>
                    ))}
                  </div>
                  <Button type="dashed" block style={{ marginTop: 8, borderRadius: 8 }} icon={<PlusOutlined />} onClick={addStep}>
                    添加步骤
                  </Button>
                </div>

                {/* 预期结果 */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>预期结果</h4>
                  <Input.TextArea value={expectedResult} onChange={e => setExpectedResult(e.target.value)}
                    style={{ background: '#fafbfc', borderColor: '#f2f3f5' }}
                    autoSize={{ minRows: 2, maxRows: 6 }} />
                </div>

                {/* 脚本引用 */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>脚本引用</h4>
                  <Input value={scriptRef} onChange={e => setScriptRef(e.target.value)} size="small"
                    placeholder="tests/api/..." style={{ fontFamily: 'monospace', fontSize: 12, background: '#fafbfc', borderColor: '#f2f3f5' }} />
                </div>

                {/* 备注 */}
                <div>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>备注</h4>
                  <Input.TextArea value={remark} onChange={e => setRemark(e.target.value)}
                    placeholder="可选备注信息"
                    style={{ background: '#fafbfc', borderColor: '#f2f3f5' }}
                    autoSize={{ minRows: 2, maxRows: 4 }} />
                </div>
              </Card>
            )},
            { key: 'history', label: '执行历史', children: (
              <Card styles={{ body: { padding: '16px 24px' } }}>
                <Timeline items={history.map(h => ({
                  dot: h.status === 'passed'
                    ? <CheckCircleFilled style={{ color: '#6ecf96', fontSize: 16 }} />
                    : <CloseCircleFilled style={{ color: '#f08a8e', fontSize: 16 }} />,
                  children: (
                    <div style={{ paddingBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500, color: '#1d2129' }}>{h.plan}</span>
                        <Tag style={{ background: h.status==='passed'?'#f6ffed':'#fff2f0', color: h.status==='passed'?'#6ecf96':'#f08a8e', border: 'none' }}>
                          {h.status==='passed'?'通过':'失败'}
                        </Tag>
                        <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{h.env}</Tag>
                        <span style={{ fontSize: 12, color: '#c0c4cc' }}>{h.duration}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#86909c' }}>{h.time}</div>
                      {h.error && <div style={{ fontSize: 12, color: '#f08a8e', marginTop: 4 }}>{h.error}</div>}
                    </div>
                  ),
                }))} />
              </Card>
            )},
          ]} />
        </div>

        {/* 右侧面板 */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 12 }}>快速操作</h4>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button block type="primary" icon={<PlayCircleOutlined />}
                onClick={() => { setRunModalOpen(true); setRunStatus('idle') }}>执行此用例</Button>
              <Button block icon={<BugOutlined />}
                onClick={() => { setFlaky(!flaky); message.success(flaky ? '已取消 Flaky' : '已标记 Flaky') }}>
                {flaky ? '取消 Flaky 标记' : '标记为 Flaky'}
              </Button>
              <Button block icon={<ExperimentOutlined />} danger ghost>归档</Button>
            </Space>
          </Card>
          <Card styles={{ body: { padding: 16 } }}>
            <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 12 }}>最近执行</h4>
            {history.slice(0, 3).map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 2 ? '1px solid #f8f8f8' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#4e5969' }}>{h.plan}</div>
                  <div style={{ fontSize: 11, color: '#c0c4cc' }}>{h.time}</div>
                </div>
                <Tag style={{ background: h.status==='passed'?'#f6ffed':'#fff2f0', color: h.status==='passed'?'#6ecf96':'#f08a8e', border: 'none', fontSize: 11 }}>
                  {h.status==='passed'?'通过':'失败'}
                </Tag>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* 执行弹窗 */}
      <Modal open={runModalOpen} onCancel={() => setRunModalOpen(false)} footer={null} title="执行用例" width={480}>
        <div style={{ padding: '12px 0' }}>
          <div style={{ padding: '12px 16px', background: '#fafbfc', borderRadius: 10, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>{originalCase.id}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>选择执行环境</div>
            <Select value={runEnv} onChange={setRunEnv} style={{ width: '100%' }}
              options={mockEnvironments.map(e => ({ value: e.name, label: `${e.name} (${e.label})` }))} />
          </div>
          {runStatus === 'idle' && <Button type="primary" block size="large" icon={<PlayCircleOutlined />} onClick={handleRun}>开始执行</Button>}
          {runStatus === 'running' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <LoadingOutlined style={{ fontSize: 36, color: '#7c8cf8', marginBottom: 12 }} spin />
              <div style={{ fontSize: 14, color: '#4e5969' }}>正在执行中...</div>
              <div style={{ fontSize: 12, color: '#c0c4cc', marginTop: 4 }}>请稍候，脚本执行需要几秒钟</div>
            </div>
          )}
          {runStatus === 'passed' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircleFilled style={{ fontSize: 48, color: '#6ecf96', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#6ecf96' }}>执行通过</div>
              <div style={{ fontSize: 13, color: '#86909c', marginTop: 4 }}>耗时 2.3s · 环境 {runEnv}</div>
              <Space style={{ marginTop: 16 }}><Button onClick={() => setRunStatus('idle')}>再次执行</Button><Button type="primary" onClick={() => setRunModalOpen(false)}>关闭</Button></Space>
            </div>
          )}
          {runStatus === 'failed' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CloseCircleFilled style={{ fontSize: 48, color: '#f08a8e', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#f08a8e' }}>执行失败</div>
              <div style={{ fontSize: 13, color: '#86909c', marginTop: 4 }}>耗时 4.1s · 环境 {runEnv}</div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff2f0', borderRadius: 8, textAlign: 'left', fontSize: 12, color: '#f08a8e' }}>
                AssertionError: 预期状态码 200，实际返回 500
              </div>
              <Space style={{ marginTop: 16 }}><Button onClick={() => setRunStatus('idle')}>再次执行</Button><Button type="primary" onClick={() => setRunModalOpen(false)}>关闭</Button></Space>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
