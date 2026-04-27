import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Tag, Button, Input, Select, Space, Divider, Modal, message, Tabs, Timeline, Switch, Popover, Tooltip, Spin } from 'antd'
import {
  ArrowLeftOutlined, PlayCircleOutlined, SaveOutlined,
  CheckCircleFilled, CloseCircleFilled, LoadingOutlined,
  ExperimentOutlined, BugOutlined, PlusOutlined, DeleteOutlined, HolderOutlined,
  ThunderboltOutlined, TagOutlined, AppstoreOutlined, BranchesOutlined, ApiOutlined,
  FlagOutlined, WarningOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const priorityColors = { P0: '#fff', P1: '#fff', P2: '#fff', P3: '#fff' }
const priorityBg = { P0: '#ff7875', P1: '#ffc069', P2: '#85a5ff', P3: '#d9d9d9' }
const statusColors = { automated: '#00b96b', pending: '#faad14', removed: '#ff4d4f' }
const statusBg = { automated: '#f6ffed', pending: '#fffbe6', removed: '#fff2f0' }
const statusLabels = { automated: '已自动化', pending: '待自动化', removed: '脚本已移除' }
const dotColors = { P0: '#ff7875', P1: '#ffc069', P2: '#85a5ff', P3: '#d9d9d9', automated: '#00b96b', pending: '#faad14', removed: '#ff4d4f' }

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
          background: activeKey === item.key ? '#e6f7ff' : 'transparent',
          fontWeight: activeKey === item.key ? 600 : 400,
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#f7f8fa'}
          onMouseLeave={e => e.currentTarget.style.background = activeKey === item.key ? '#e6f7ff' : 'transparent'}>
          {item.dot && <span style={{ width: 8, height: 8, borderRadius: item.dot === 'circle' ? '50%' : 2, background: item.color, flexShrink: 0 }} />}
          {item.icon && <span>{item.icon}</span>}
          {item.label}
        </div>
      ))}
    </div>
  )
}

function findFolderPath(tree, targetId) {
  for (const node of tree) {
    if (node.id === targetId) return node.path || node.name
    if (node.children?.length) {
      const found = findFolderPath(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

export default function CaseDetail() {
  const { projectId, caseId } = useParams()
  const navigate = useNavigate()

  // branchId 从 URL query string 获取
  const searchParams = new URLSearchParams(window.location.search)
  const branchId = searchParams.get('branchId')

  const [loading, setLoading] = useState(true)
  const [caseData, setCaseData] = useState(null)
  const [environments, setEnvironments] = useState([])
  const [folders, setFolders] = useState([])

  const [runModalOpen, setRunModalOpen] = useState(false)
  const [runStatus, setRunStatus] = useState('idle')
  const [runEnv, setRunEnv] = useState(null)

  // 编辑状态
  const [title, setTitle] = useState('')
  const [type, setType] = useState('api')
  const [priority, setPriority] = useState('P1')
  const [module, setModule] = useState('')
  const [subModule, setSubModule] = useState('')
  const [automationStatus, setAutomationStatus] = useState('pending')
  const [flaky, setFlaky] = useState(false)
  const [preconditions, setPreconditions] = useState('')
  const [expectedResult, setExpectedResult] = useState('')
  const [scriptRefFile, setScriptRefFile] = useState('')
  const [scriptRefFunc, setScriptRefFunc] = useState('')
  const [remark, setRemark] = useState('')
  const [steps, setSteps] = useState([{ seq: 1, action: '' }])

  const savedRef = useRef('')

  useEffect(() => {
    if (branchId) loadData()
  }, [projectId, branchId, caseId])

  async function loadData() {
    if (!branchId) {
      message.error('缺少分支信息')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [caseRes, envRes, folderRes] = await Promise.all([
        api.get(`/projects/${projectId}/branches/${branchId}/cases/${caseId}`),
        api.get('/environments'),
        api.get(`/projects/${projectId}/branches/${branchId}/folders`),
      ])

      const c = caseRes.data
      setCaseData(c)

      const newTitle = c.title || ''
      const newType = c.type || 'api'
      const newPriority = c.priority || 'P1'
      const allFolders = folderRes.data || []
      setFolders(allFolders)
      const folderPath = c.folderId ? findFolderPath(allFolders, c.folderId) : ''
      let newModule = c.module || ''
      let newSubModule = c.subModule || ''
      if (folderPath) {
        const parts = folderPath.split('/')
        newModule = parts.slice(0, -1).join('/') || parts[0] || ''
        newSubModule = parts.length > 1 ? parts[parts.length - 1] : ''
      }
      const newAutomationStatus = c.automationStatus || 'pending'
      const newFlaky = c.isFlaky || false
      const newPreconditions = c.preconditions || ''
      const newExpectedResult = c.expectedResult || ''
      const newScriptRefFile = c.scriptRefFile || ''
      const newScriptRefFunc = c.scriptRefFunc || ''
      const newRemark = c.remark || ''
      const newSteps = c.steps?.length ? c.steps.map((s, i) => ({ ...s, seq: s.seq || i + 1 })) : [{ seq: 1, action: '' }]

      setTitle(newTitle)
      setType(newType)
      setPriority(newPriority)
      setModule(newModule)
      setSubModule(newSubModule)
      setAutomationStatus(newAutomationStatus)
      setFlaky(newFlaky)
      setPreconditions(newPreconditions)
      setExpectedResult(newExpectedResult)
      setScriptRefFile(newScriptRefFile)
      setScriptRefFunc(newScriptRefFunc)
      setRemark(newRemark)
      setSteps(newSteps)

      savedRef.current = JSON.stringify({ title: newTitle, type: newType, priority: newPriority, module: newModule, subModule: newSubModule, automationStatus: newAutomationStatus, flaky: newFlaky, preconditions: newPreconditions, expectedResult: newExpectedResult, scriptRefFile: newScriptRefFile, scriptRefFunc: newScriptRefFunc, remark: newRemark, steps: newSteps })

      setEnvironments(envRes.data || [])
      if (envRes.data?.length) setRunEnv(envRes.data[0].id)
    } catch (err) {
      message.error('加载用例详情失败')
    } finally {
      setLoading(false)
    }
  }

  const currentSnap = JSON.stringify({ title, type, priority, module, subModule, automationStatus, flaky, preconditions, expectedResult, scriptRefFile, scriptRefFunc, remark, steps })
  const isDirty = caseData && currentSnap !== savedRef.current

  // 离开未保存确认
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleBack = () => {
    if (isDirty) {
      Modal.confirm({
        title: '未保存的修改',
        content: '当前有未保存的修改，确定离开吗？',
        okText: '离开',
        cancelText: '继续编辑',
        onOk: () => navigate(-1),
      })
    } else {
      navigate(-1)
    }
  }

  const addStep = () => setSteps(prev => [...prev, { seq: prev.length + 1, action: '' }])
  const removeStep = (idx) => setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))
  const updateStep = (idx, value) => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, action: value } : s))

  const handleSave = async () => {
    try {
      await api.put(`/projects/${projectId}/branches/${branchId}/cases/${caseId}`, {
        title, type, priority, module, subModule, automationStatus,
        isFlaky: flaky, preconditions, expectedResult, scriptRefFile, scriptRefFunc, remark, steps,
      })
      // 重新计算快照确保 isDirty 变为 false
      const newSnap = JSON.stringify({ title, type, priority, module, subModule, automationStatus, flaky, preconditions, expectedResult, scriptRefFile, scriptRefFunc, remark, steps })
      savedRef.current = newSnap
      setCaseData(prev => ({ ...prev }))  // 触发重渲染
      message.success('保存成功')
    } catch {
      message.error('保存失败')
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (!caseData) return <div style={{ textAlign: 'center', padding: 80, color: '#86909c' }}>用例不存在</div>

  const caseCode = caseData.caseCode || caseData.id?.substring(0, 8)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} size="small"
          onClick={handleBack} style={{ color: '#86909c' }} />
        <span style={{ fontSize: 12, color: '#c9cdd4' }}>用例管理</span>
        <span style={{ color: '#e5e6eb', fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>{caseCode}</span>
      </div>

      <Card styles={{ body: { padding: '16px 20px' } }} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Button type="primary" size="small" icon={<SaveOutlined />}
            disabled={!isDirty} onClick={handleSave}>保存</Button>
          <Input value={title} onChange={e => setTitle(e.target.value)} variant="borderless"
            style={{ fontSize: 16, fontWeight: 600, flex: 1, padding: '2px 4px' }} />
          <Select value={runEnv} onChange={setRunEnv} size="small" style={{ width: 170, flexShrink: 0 }}
            placeholder="选择环境"
            options={environments.map(e => ({ value: e.id, label: e.name }))} />
          <Button type="primary" size="small" icon={<PlayCircleOutlined />}
            onClick={() => { setRunModalOpen(true); setRunStatus('idle') }}>执行</Button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <ReadonlyProp icon={<TagOutlined />} value={caseCode} />

          <InlineProp icon={<FlagOutlined />} value={priority} color={priorityColors[priority]} bg={priorityBg[priority]}>
            <DropdownList activeKey={priority} onSelect={setPriority}
              items={['P0','P1','P2','P3'].map(p => ({ key: p, label: p, dot: 'square', color: dotColors[p] }))} />
          </InlineProp>

          <InlineProp icon={<ApiOutlined />} value={type?.toUpperCase()} color={type==='api'?'#1890ff':'#00b96b'} bg={type==='api'?'#e6f7ff':'#f6ffed'}>
            <DropdownList activeKey={type} onSelect={setType}
              items={['api','e2e'].map(t => ({ key: t, label: t.toUpperCase() }))} />
          </InlineProp>

          <ReadonlyProp icon={<AppstoreOutlined />} label="模块" value={[module, subModule].filter(Boolean).join(' / ') || '未分类'} />

          <InlineProp icon={<ThunderboltOutlined />} value={statusLabels[automationStatus] || automationStatus}
            color={statusColors[automationStatus]} bg={statusBg[automationStatus]}>
            <DropdownList activeKey={automationStatus} onSelect={setAutomationStatus}
              items={['automated','pending','removed'].map(s => ({ key: s, label: statusLabels[s], dot: 'circle', color: dotColors[s] }))} />
          </InlineProp>

          <InlineProp icon={<WarningOutlined />} value={flaky ? 'Flaky' : '正常'} color={flaky ? '#faad14' : '#86909c'} bg={flaky ? '#fffbe6' : '#f7f8fa'}>
            <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 13 }}>Flaky 标记</span>
              <Switch size="small" checked={flaky} onChange={v => setFlaky(v)} />
            </div>
          </InlineProp>

          <ReadonlyProp label="来源" value={caseData.source || 'manual'} />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Tabs defaultActiveKey="info" items={[
            { key: 'info', label: '用例信息', children: (
              <Card styles={{ body: { padding: '16px 20px' } }}>
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>前置条件</h4>
                  <Input.TextArea rows={2} value={preconditions} onChange={e => setPreconditions(e.target.value)}
                    style={{ background: '#f7f8fa', borderColor: '#f2f3f5' }}
                    autoSize={{ minRows: 2, maxRows: 6 }} />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ fontSize: 13, color: '#86909c', margin: 0 }}>测试步骤</h4>
                    <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addStep}>添加步骤</Button>
                  </div>
                  <div style={{ borderRadius: 10, border: '1px solid #f2f3f5', overflow: 'hidden' }}>
                    {steps.map((s, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '8px 14px', fontSize: 13,
                        background: i % 2 === 0 ? '#fff' : '#f7f8fa',
                        borderBottom: i < steps.length - 1 ? '1px solid #f8f8f8' : 'none',
                        alignItems: 'center',
                      }}>
                        <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', flexShrink: 0 }} />
                        <span style={{
                          width: 24, height: 24, borderRadius: 6, background: '#e6f7ff', color: '#1890ff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0,
                        }}>{s.seq}</span>
                        <Input value={s.action} onChange={e => updateStep(i, e.target.value)}
                          placeholder="描述操作步骤..." variant="borderless"
                          style={{ flex: 1, fontSize: 13 }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && i === steps.length - 1 && s.action.trim()) {
                              e.preventDefault()
                              addStep()
                              setTimeout(() => {
                                const inputs = document.querySelectorAll('[placeholder="描述操作步骤..."]')
                                inputs[inputs.length - 1]?.focus()
                              }, 50)
                            }
                          }} />
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

                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>预期结果</h4>
                  <Input.TextArea value={expectedResult} onChange={e => setExpectedResult(e.target.value)}
                    style={{ background: '#f7f8fa', borderColor: '#f2f3f5' }}
                    autoSize={{ minRows: 2, maxRows: 6 }} />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>脚本引用</h4>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input value={scriptRefFile} onChange={e => setScriptRefFile(e.target.value)} size="small"
                      placeholder="脚本文件路径，如 tests/api/test_user.py" style={{ flex: 2, fontFamily: 'monospace', fontSize: 12, background: '#f7f8fa', borderColor: '#f2f3f5' }} />
                    <Input value={scriptRefFunc} onChange={e => setScriptRefFunc(e.target.value)} size="small"
                      placeholder="函数名，如 test_create_user" style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, background: '#f7f8fa', borderColor: '#f2f3f5' }} />
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>备注</h4>
                  <Input.TextArea value={remark} onChange={e => setRemark(e.target.value)}
                    placeholder="可选备注信息"
                    style={{ background: '#f7f8fa', borderColor: '#f2f3f5' }}
                    autoSize={{ minRows: 2, maxRows: 4 }} />
                </div>
              </Card>
            )},
            { key: 'history', label: '执行历史', children: (
              <Card styles={{ body: { padding: '16px 24px' } }}>
                <div style={{ color: '#86909c', textAlign: 'center', padding: 24 }}>
                  暂无执行记录
                </div>
              </Card>
            )},
          ]} />
        </div>

        <div style={{ width: 260, flexShrink: 0 }}>
          <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 12 }}>快速操作</h4>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Button block type="primary" icon={<PlayCircleOutlined />}
                onClick={() => { setRunModalOpen(true); setRunStatus('idle') }}>执行此用例</Button>
              <Button block icon={<BugOutlined />}
                onClick={async () => {
                  const newFlaky = !flaky
                  setFlaky(newFlaky)
                  try {
                    await api.put(`/projects/${projectId}/branches/${branchId}/cases/${caseId}`, { isFlaky: newFlaky })
                    message.success(newFlaky ? '已标记为 Flaky' : '已取消 Flaky')
                  } catch { message.error('操作失败') }
                }}>
                {flaky ? '取消 Flaky 标记' : '标记为 Flaky'}
              </Button>
              <Button block icon={<ExperimentOutlined />} danger ghost
                onClick={async () => {
                  try {
                    await api.post(`/projects/${projectId}/branches/${branchId}/cases/batch`, { caseIds: [caseId], action: 'archive' })
                    message.success('已归档')
                    navigate(-1)
                  } catch { message.error('归档失败') }
                }}>归档</Button>
            </Space>
          </Card>
        </div>
      </div>

      <Modal open={runModalOpen} onCancel={() => setRunModalOpen(false)} footer={null} title="执行用例" width={480}>
        <div style={{ padding: '12px 0' }}>
          <div style={{ padding: '12px 16px', background: '#f7f8fa', borderRadius: 10, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>{caseCode}</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>选择执行环境</div>
            <Select value={runEnv} onChange={setRunEnv} style={{ width: '100%' }}
              options={environments.map(e => ({ value: e.id, label: e.name }))} />
          </div>
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#86909c' }}>
            单条用例执行请通过测试计划
          </div>
        </div>
      </Modal>
    </div>
  )
}
