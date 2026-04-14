import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Tag, Button, Input, Select, Space, Divider, Modal, message, Tabs, Timeline, Switch, Popover, Tooltip } from 'antd'
import {
  ArrowLeftOutlined, EditOutlined, PlayCircleOutlined, SaveOutlined, CloseOutlined,
  CheckCircleFilled, CloseCircleFilled, LoadingOutlined,
  ExperimentOutlined, BugOutlined, PlusOutlined, DeleteOutlined, HolderOutlined,
  ThunderboltOutlined, TagOutlined, AppstoreOutlined, BranchesOutlined, ApiOutlined,
  FlagOutlined, WarningOutlined,
} from '@ant-design/icons'
import { mockCases, mockModules } from '../../mock/data'

const priorityColors = { P0: '#dc4446', P1: '#fa8c16', P2: '#4C8BF5', P3: '#86909c' }
const statusColors = { '已自动化': '#52c41a', '待自动化': '#fa8c16', '脚本已移除': '#dc4446' }

// 可点击的内联属性标签
function InlineProp({ icon, label, value, color, bg, children }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      content={<div style={{ minWidth: 150 }} onClick={e => e.stopPropagation()}>{children}</div>}
      arrow={false}
      styles={{ body: { padding: 8 } }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px 2px 6px',
        borderRadius: 6, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
        background: bg || '#f7f8fa', color: color || '#4e5969', border: '1px solid transparent',
        userSelect: 'none', lineHeight: '22px',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#e5e6eb'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
      >
        {icon && <span style={{ fontSize: 11, color: color || '#86909c', display: 'flex' }}>{icon}</span>}
        {label && <span style={{ color: '#86909c' }}>{label}</span>}
        <span style={{ fontWeight: 500, color: color || '#4e5969' }}>{value}</span>
      </div>
    </Popover>
  )
}

// 只读标签（不可编辑的字段）
function ReadonlyProp({ icon, label, value, color, bg }) {
  return (
    <Tooltip title={label}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px 2px 6px',
        borderRadius: 6, fontSize: 12, background: bg || '#f7f8fa', color: color || '#4e5969',
        lineHeight: '22px',
      }}>
        {icon && <span style={{ fontSize: 11, color: color || '#86909c', display: 'flex' }}>{icon}</span>}
        {label && <span style={{ color: '#86909c' }}>{label}</span>}
        <span style={{ fontWeight: 500 }}>{value}</span>
      </div>
    </Tooltip>
  )
}

export default function CaseDetail() {
  const { projectId, caseId } = useParams()
  const navigate = useNavigate()
  const originalCase = useMemo(() => mockCases.find(c => c.id === caseId) || mockCases[0], [caseId])

  const [editing, setEditing] = useState(false)
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [runStatus, setRunStatus] = useState('idle')
  const [runEnv, setRunEnv] = useState('staging')

  // 可编辑字段
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
    { seq: 1, action: '发送登录请求 POST /api/auth/login', expected: '返回 200 和 token' },
    { seq: 2, action: '携带 token 请求目标接口', expected: '返回 200 和正确数据' },
    { seq: 3, action: '校验响应数据字段完整性', expected: '所有必填字段存在且类型正确' },
    { seq: 4, action: '校验业务逻辑正确性', expected: '状态变更符合预期' },
  ])

  const currentModule = mockModules.find(m => m.id === moduleId)
  const subModuleOptions = currentModule?.subs || []
  const currentSub = subModuleOptions.find(s => s.id === subModuleId)

  const addStep = () => setSteps(prev => [...prev, { seq: prev.length + 1, action: '', expected: '' }])
  const removeStep = (idx) => setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))
  const updateStep = (idx, field, value) => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))

  const handleSave = () => { setEditing(false); message.success('保存成功') }
  const handleCancel = () => {
    setEditing(false)
    setTitle(originalCase.title); setPriority(originalCase.priority)
    setType(originalCase.type); setAutoStatus(originalCase.status)
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

      {/* 标题栏 - Apifox 风格紧凑设计 */}
      <Card styles={{ body: { padding: '16px 20px' } }} style={{ marginBottom: 16 }}>
        {/* 第一行：标题 + 操作按钮 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          {editing ? (
            <Input value={title} onChange={e => setTitle(e.target.value)}
              style={{ fontSize: 16, fontWeight: 600, flex: 1, maxWidth: 600 }} />
          ) : (
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>{title}</h2>
          )}
          <Space size={8}>
            {!editing ? (
              <>
                <Button type="primary" size="small" icon={<PlayCircleOutlined />}
                  onClick={() => { setRunModalOpen(true); setRunStatus('idle') }}
                  disabled={autoStatus !== '已自动化'}>执行</Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>编辑</Button>
              </>
            ) : (
              <>
                <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
                <Button size="small" icon={<CloseOutlined />} onClick={handleCancel}>取消</Button>
              </>
            )}
          </Space>
        </div>

        {/* 第二行：属性标签行 - 小图标+值，可点击下拉修改 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {/* ID - 只读 */}
          <ReadonlyProp icon={<TagOutlined />} value={originalCase.id} bg="#f7f8fa" />

          {/* 优先级 */}
          <InlineProp icon={<FlagOutlined />} value={priority} color="#fff" bg={priorityColors[priority]}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['P0','P1','P2','P3'].map(p => (
                <div key={p} onClick={() => setPriority(p)} style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: priority === p ? '#f0f7ff' : 'transparent',
                  fontWeight: priority === p ? 600 : 400,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                  onMouseLeave={e => e.currentTarget.style.background = priority === p ? '#f0f7ff' : 'transparent'}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: priorityColors[p] }} />
                  {p}
                </div>
              ))}
            </div>
          </InlineProp>

          {/* 类型 */}
          <InlineProp icon={<ApiOutlined />} value={type} color={type==='API'?'#4C8BF5':'#52c41a'} bg={type==='API'?'#e6f4ff':'#f6ffed'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['API','E2E'].map(t => (
                <div key={t} onClick={() => setType(t)} style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  background: type === t ? '#f0f7ff' : 'transparent', fontWeight: type === t ? 600 : 400,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                  onMouseLeave={e => e.currentTarget.style.background = type === t ? '#f0f7ff' : 'transparent'}
                >{t}</div>
              ))}
            </div>
          </InlineProp>

          {/* 模块 */}
          <InlineProp icon={<AppstoreOutlined />} value={currentModule?.label || '-'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mockModules.map(m => (
                <div key={m.id} onClick={() => { setModuleId(m.id); setSubModuleId(m.subs[0]?.id || null) }} style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  background: moduleId === m.id ? '#f0f7ff' : 'transparent', fontWeight: moduleId === m.id ? 600 : 400,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                  onMouseLeave={e => e.currentTarget.style.background = moduleId === m.id ? '#f0f7ff' : 'transparent'}
                >{m.icon} {m.label}</div>
              ))}
            </div>
          </InlineProp>

          {/* 子模块 */}
          <InlineProp icon={<BranchesOutlined />} value={currentSub?.label || '-'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {subModuleOptions.map(s => (
                <div key={s.id} onClick={() => setSubModuleId(s.id)} style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  background: subModuleId === s.id ? '#f0f7ff' : 'transparent', fontWeight: subModuleId === s.id ? 600 : 400,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                  onMouseLeave={e => e.currentTarget.style.background = subModuleId === s.id ? '#f0f7ff' : 'transparent'}
                >{s.label}</div>
              ))}
            </div>
          </InlineProp>

          {/* 自动化状态 */}
          <InlineProp icon={<ThunderboltOutlined />} value={autoStatus} color={statusColors[autoStatus]} bg={statusColors[autoStatus]+'18'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['已自动化','待自动化','脚本已移除'].map(s => (
                <div key={s} onClick={() => setAutoStatus(s)} style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: autoStatus === s ? '#f0f7ff' : 'transparent', fontWeight: autoStatus === s ? 600 : 400,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
                  onMouseLeave={e => e.currentTarget.style.background = autoStatus === s ? '#f0f7ff' : 'transparent'}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[s] }} />
                  {s}
                </div>
              ))}
            </div>
          </InlineProp>

          {/* Flaky */}
          {flaky && (
            <InlineProp icon={<WarningOutlined />} value="Flaky" color="#fa8c16" bg="#fff7e6">
              <div style={{ padding: '4px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 13 }}>Flaky 标记</span>
                  <Switch size="small" checked={flaky} onChange={v => { setFlaky(v); message.success(v ? '已标记' : '已取消') }} />
                </div>
              </div>
            </InlineProp>
          )}

          {/* 来源 */}
          <ReadonlyProp label="来源" value={originalCase.source} />
        </div>
      </Card>

      {/* 主体内容 */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Tabs defaultActiveKey="info" items={[
            { key: 'info', label: '用例信息', children: (
              <Card styles={{ body: { padding: '16px 20px' } }}>
                {/* 前置条件 */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>前置条件</h4>
                  {editing ? (
                    <Input.TextArea rows={3} value={preconditions} onChange={e => setPreconditions(e.target.value)} />
                  ) : (
                    <div style={{ fontSize: 13, color: '#4e5969', lineHeight: 1.8, padding: '8px 12px', background: '#fafbfc', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
                      {preconditions}
                    </div>
                  )}
                </div>

                {/* 测试步骤 */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ fontSize: 13, color: '#86909c', margin: 0 }}>测试步骤</h4>
                    {editing && <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addStep}>添加步骤</Button>}
                  </div>
                  <div style={{ borderRadius: 10, border: '1px solid #f2f3f5', overflow: 'hidden' }}>
                    {steps.map((s, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '10px 14px', fontSize: 13,
                        background: i % 2 === 0 ? '#fff' : '#fafbfc',
                        borderBottom: i < steps.length - 1 ? '1px solid #f8f8f8' : 'none',
                        alignItems: 'flex-start',
                      }}>
                        {editing && <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', marginTop: 6, flexShrink: 0 }} />}
                        <span style={{
                          width: 24, height: 24, borderRadius: 6, background: '#e6f4ff', color: '#4C8BF5',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12,
                          flexShrink: 0, marginTop: editing ? 4 : 0,
                        }}>{s.seq}</span>
                        <div style={{ flex: 1 }}>
                          {editing ? (
                            <>
                              <Input value={s.action} onChange={e => updateStep(i, 'action', e.target.value)}
                                placeholder="操作步骤描述" size="small" style={{ marginBottom: 6 }} />
                              <Input value={s.expected} onChange={e => updateStep(i, 'expected', e.target.value)}
                                placeholder="预期结果" size="small"
                                addonBefore={<span style={{ fontSize: 11, color: '#86909c' }}>预期</span>} />
                            </>
                          ) : (
                            <>
                              <div style={{ color: '#1d2129' }}>{s.action}</div>
                              {s.expected && <div style={{ color: '#86909c', fontSize: 12, marginTop: 2 }}>预期: {s.expected}</div>}
                            </>
                          )}
                        </div>
                        {editing && (
                          <Button type="text" danger size="small" icon={<DeleteOutlined />}
                            onClick={() => removeStep(i)} style={{ marginTop: 2, flexShrink: 0 }}
                            disabled={steps.length <= 1} />
                        )}
                      </div>
                    ))}
                  </div>
                  {editing && (
                    <Button type="dashed" block style={{ marginTop: 8, borderRadius: 8 }} icon={<PlusOutlined />} onClick={addStep}>
                      添加步骤
                    </Button>
                  )}
                </div>

                {/* 预期结果 */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>预期结果</h4>
                  {editing ? (
                    <Input.TextArea rows={2} value={expectedResult} onChange={e => setExpectedResult(e.target.value)} />
                  ) : (
                    <div style={{ fontSize: 13, color: '#4e5969', padding: '8px 12px', background: '#fafbfc', borderRadius: 8 }}>
                      {expectedResult}
                    </div>
                  )}
                </div>

                {/* 脚本引用 */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>脚本引用</h4>
                  {editing ? (
                    <Input value={scriptRef} onChange={e => setScriptRef(e.target.value)} size="small"
                      placeholder="tests/api/..." style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  ) : (
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#4e5969', padding: '8px 12px', background: '#fafbfc', borderRadius: 8 }}>
                      {scriptRef || <span style={{ color: '#c0c4cc' }}>无</span>}
                    </div>
                  )}
                </div>

                {/* 备注 */}
                <div>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>备注</h4>
                  {editing ? (
                    <Input.TextArea rows={2} value={remark} onChange={e => setRemark(e.target.value)} placeholder="可选备注信息" />
                  ) : (
                    <div style={{ fontSize: 13, color: remark ? '#4e5969' : '#c0c4cc', padding: '8px 12px', background: '#fafbfc', borderRadius: 8 }}>
                      {remark || '无'}
                    </div>
                  )}
                </div>
              </Card>
            )},
            { key: 'history', label: '执行历史', children: (
              <Card styles={{ body: { padding: '16px 24px' } }}>
                <Timeline items={history.map(h => ({
                  dot: h.status === 'passed'
                    ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />
                    : <CloseCircleFilled style={{ color: '#dc4446', fontSize: 16 }} />,
                  children: (
                    <div style={{ paddingBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500, color: '#1d2129' }}>{h.plan}</span>
                        <Tag style={{ background: h.status==='passed'?'#f6ffed':'#fff2f0', color: h.status==='passed'?'#52c41a':'#dc4446', border: 'none' }}>
                          {h.status==='passed'?'通过':'失败'}
                        </Tag>
                        <Tag style={{ background: '#f7f8fa', color: '#86909c', border: 'none' }}>{h.env}</Tag>
                        <span style={{ fontSize: 12, color: '#c0c4cc' }}>{h.duration}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#86909c' }}>{h.time}</div>
                      {h.error && <div style={{ fontSize: 12, color: '#dc4446', marginTop: 4 }}>{h.error}</div>}
                    </div>
                  ),
                }))} />
              </Card>
            )},
          ]} />
        </div>

        {/* 右侧快捷面板 */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 12 }}>快速操作</h4>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button block type="primary" icon={<PlayCircleOutlined />}
                onClick={() => { setRunModalOpen(true); setRunStatus('idle') }}
                disabled={autoStatus !== '已自动化'}>执行此用例</Button>
              <Button block icon={<BugOutlined />}
                onClick={() => { setFlaky(!flaky); message.success(flaky ? '已取消 Flaky 标记' : '已标记为 Flaky') }}>
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
                <Tag style={{ background: h.status==='passed'?'#f6ffed':'#fff2f0', color: h.status==='passed'?'#52c41a':'#dc4446', border: 'none', fontSize: 11 }}>
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
              options={[
                { value: 'staging', label: 'staging (测试环境)' },
                { value: 'production', label: 'production (生产环境)' },
                { value: 'dev', label: 'dev (开发环境)' },
              ]} />
          </div>
          {runStatus === 'idle' && <Button type="primary" block size="large" icon={<PlayCircleOutlined />} onClick={handleRun}>开始执行</Button>}
          {runStatus === 'running' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <LoadingOutlined style={{ fontSize: 36, color: '#4C8BF5', marginBottom: 12 }} spin />
              <div style={{ fontSize: 14, color: '#4e5969' }}>正在执行中...</div>
              <div style={{ fontSize: 12, color: '#c0c4cc', marginTop: 4 }}>请稍候，脚本执行需要几秒钟</div>
            </div>
          )}
          {runStatus === 'passed' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CheckCircleFilled style={{ fontSize: 48, color: '#52c41a', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#52c41a' }}>执行通过</div>
              <div style={{ fontSize: 13, color: '#86909c', marginTop: 4 }}>耗时 2.3s · 环境 {runEnv}</div>
              <Space style={{ marginTop: 16 }}><Button onClick={() => setRunStatus('idle')}>再次执行</Button><Button type="primary" onClick={() => setRunModalOpen(false)}>关闭</Button></Space>
            </div>
          )}
          {runStatus === 'failed' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <CloseCircleFilled style={{ fontSize: 48, color: '#dc4446', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#dc4446' }}>执行失败</div>
              <div style={{ fontSize: 13, color: '#86909c', marginTop: 4 }}>耗时 4.1s · 环境 {runEnv}</div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff2f0', borderRadius: 8, textAlign: 'left', fontSize: 12, color: '#dc4446' }}>
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
