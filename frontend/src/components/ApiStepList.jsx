import { useState } from 'react'
import { Input, Select, Button, Tag, Space, Tooltip, Dropdown } from 'antd'
import {
  PlusOutlined, DeleteOutlined, HolderOutlined, CaretRightOutlined, CaretDownOutlined,
  SendOutlined, FolderOutlined, RetweetOutlined, BranchesOutlined, ApiOutlined,
} from '@ant-design/icons'

const methodColors = {
  GET: { color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' },
  POST: { color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff' },
  PUT: { color: '#faad14', bg: '#fffbe6', border: '#ffe58f' },
  PATCH: { color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7' },
  DELETE: { color: '#ff4d4f', bg: '#fff2f0', border: '#ffa39e' },
}

// ---- 子编辑器 ----
function KvEditor({ items = [], onChange, keyPh = 'Key', valPh = 'Value' }) {
  const up = (i, f, v) => onChange(items.map((r, j) => j === i ? { ...r, [f]: v } : r))
  return (
    <div>
      {items.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
          <Input size="small" value={r.key} placeholder={keyPh} onChange={e => up(i, 'key', e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
          <Input size="small" value={r.value} placeholder={valPh} onChange={e => up(i, 'value', e.target.value)}
            style={{ flex: 2, fontFamily: 'monospace', fontSize: 11 }} />
          <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => onChange([...items, { key: '', value: '' }])}>添加</Button>
    </div>
  )
}

function AssertEditor({ items = [], onChange }) {
  const types = [{ value: 'status', label: '状态码' }, { value: 'jsonPath', label: 'JSON Path' }, { value: 'contains', label: '包含' }, { value: 'header', label: '响应头' }]
  const ops = [{ value: 'eq', label: '=' }, { value: 'ne', label: '≠' }, { value: 'gt', label: '>' }, { value: 'lt', label: '<' }, { value: 'contains', label: '包含' }, { value: 'notEmpty', label: '非空' }]
  const up = (i, f, v) => onChange(items.map((r, j) => j === i ? { ...r, [f]: v } : r))
  return (
    <div>
      {items.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
          <Select size="small" value={r.type} onChange={v => up(i, 'type', v)} options={types} style={{ width: 90 }} />
          {(r.type === 'jsonPath' || r.type === 'header') && (
            <Input size="small" value={r.path || ''} placeholder="$.data.id" onChange={e => up(i, 'path', e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
          )}
          <Select size="small" value={r.operator} onChange={v => up(i, 'operator', v)} options={ops} style={{ width: 60 }} />
          {r.operator !== 'notEmpty' && <Input size="small" value={r.expected || ''} placeholder="200" onChange={e => up(i, 'expected', e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />}
          <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => onChange([...items, { type: 'status', operator: 'eq', expected: '200' }])}>添加断言</Button>
    </div>
  )
}

function ExtractEditor({ items = [], onChange }) {
  const up = (i, f, v) => onChange(items.map((r, j) => j === i ? { ...r, [f]: v } : r))
  return (
    <div>
      {items.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
          <Input size="small" value={r.variable} placeholder="变量名" onChange={e => up(i, 'variable', e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
          <span style={{ fontSize: 11, color: '#86909c' }}>=</span>
          <Input size="small" value={r.path || ''} placeholder="$.data.token" onChange={e => up(i, 'path', e.target.value)} style={{ flex: 2, fontFamily: 'monospace', fontSize: 11 }} />
          <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => onChange([...items, { variable: '', path: '' }])}>提取变量</Button>
    </div>
  )
}

// ---- API 步骤卡片（左右布局） ----
function ApiStepCard({ step, index, onChange, onRemove, canRemove }) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('params')
  const method = step.method || 'GET'
  const mc = methodColors[method] || methodColors.GET
  const up = (f, v) => onChange({ ...step, [f]: v })

  const badges = []
  if (step.params?.some(p => p.key)) badges.push({ label: `${step.params.filter(p => p.key).length} 参数`, color: '#86909c' })
  if (step.body?.trim()) badges.push({ label: 'Body', color: '#722ed1' })
  if (step.assertions?.length) badges.push({ label: `${step.assertions.length} 断言`, color: '#52c41a' })
  if (step.extractors?.length) badges.push({ label: `${step.extractors.length} 变量`, color: '#1890ff' })

  const tabs = [
    { key: 'params', label: 'Params' }, { key: 'headers', label: 'Headers' },
    { key: 'body', label: 'Body' }, { key: 'assertions', label: '断言' }, { key: 'extractors', label: '变量' },
  ]

  return (
    <div style={{
      border: `1px solid ${expanded ? mc.border : '#f2f3f5'}`, borderRadius: 8, marginBottom: 6,
      background: '#fff', transition: 'border-color 0.15s',
    }}>
      {/* 折叠头 */}
      <div onClick={() => setExpanded(!expanded)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer',
        borderBottom: expanded ? `1px solid ${mc.border}` : 'none', userSelect: 'none',
      }}>
        <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', fontSize: 10 }} />
        <span style={{
          width: 20, height: 18, borderRadius: 3, background: '#f0f0f0', color: '#86909c',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 10, flexShrink: 0,
        }}>{index + 1}</span>
        <Tag style={{ margin: 0, fontWeight: 700, fontSize: 10, background: mc.bg, color: mc.color, border: 'none', padding: '0 6px', lineHeight: '18px' }}>{method}</Tag>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1d2129', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {step.url || '/api/...'}
        </span>
        <span style={{ fontSize: 11, color: '#86909c', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.action}</span>
        {badges.map((b, i) => <Tag key={i} style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '16px', background: '#f7f8fa', color: b.color, border: 'none' }}>{b.label}</Tag>)}
        {canRemove && <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} style={{ marginLeft: 4 }} />}
        {expanded ? <CaretDownOutlined style={{ fontSize: 10, color: '#86909c' }} /> : <CaretRightOutlined style={{ fontSize: 10, color: '#86909c' }} />}
      </div>

      {/* 展开内容 — 左右布局 */}
      {expanded && (
        <div style={{ display: 'flex', minHeight: 200 }}>
          {/* 左侧：Method + URL + 描述 */}
          <div style={{ width: 280, borderRight: '1px solid #f2f3f5', padding: '10px 12px', flexShrink: 0 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>请求方法</div>
              <Select size="small" value={method} onChange={v => up('method', v)} style={{ width: '100%' }}
                options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({
                  value: m, label: <span style={{ color: methodColors[m]?.color, fontWeight: 600 }}>{m}</span>
                }))} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>请求路径</div>
              <Input size="small" value={step.url || ''} onChange={e => up('url', e.target.value)}
                placeholder="/api/auth/login" style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>步骤描述</div>
              <Input.TextArea size="small" value={step.action || ''} onChange={e => up('action', e.target.value)}
                placeholder="用户登录获取 token" autoSize={{ minRows: 2, maxRows: 4 }} style={{ fontSize: 12 }} />
            </div>
          </div>

          {/* 右侧：Tabs */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #f2f3f5', background: '#fafbfc', flexShrink: 0 }}>
              {tabs.map(t => (
                <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '6px 12px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                  color: activeTab === t.key ? '#1890ff' : '#86909c',
                  fontWeight: activeTab === t.key ? 600 : 400,
                  borderBottom: activeTab === t.key ? '2px solid #1890ff' : '2px solid transparent',
                }}>{t.label}{t.key === 'assertions' && step.assertions?.length ? ` (${step.assertions.length})` : ''}{t.key === 'extractors' && step.extractors?.length ? ` (${step.extractors.length})` : ''}</div>
              ))}
            </div>
            <div style={{ padding: '8px 10px', flex: 1, overflow: 'auto' }}>
              {activeTab === 'params' && <KvEditor items={step.params || []} onChange={v => up('params', v)} keyPh="参数名" valPh="参数值" />}
              {activeTab === 'headers' && <KvEditor items={step.headers || []} onChange={v => up('headers', v)} keyPh="Header" valPh="Value" />}
              {activeTab === 'body' && (
                <div>
                  <Select size="small" value={step.bodyType || 'json'} onChange={v => up('bodyType', v)} style={{ width: 90, marginBottom: 6 }}
                    options={[{ value: 'json', label: 'JSON' }, { value: 'form', label: 'Form' }, { value: 'none', label: '无' }]} />
                  {(step.bodyType || 'json') !== 'none' && (
                    <Input.TextArea value={step.body || ''} onChange={e => up('body', e.target.value)}
                      placeholder='{\n  "username": "admin"\n}' autoSize={{ minRows: 4, maxRows: 12 }}
                      style={{ fontFamily: 'monospace', fontSize: 11 }} />
                  )}
                </div>
              )}
              {activeTab === 'assertions' && <AssertEditor items={step.assertions || []} onChange={v => up('assertions', v)} />}
              {activeTab === 'extractors' && <ExtractEditor items={step.extractors || []} onChange={v => up('extractors', v)} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- 编排节点：分组 ----
function GroupNode({ node, index, onChange, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ border: '1px solid #d3adf7', borderRadius: 8, marginBottom: 6, background: '#fafafe' }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer',
        background: '#f9f0ff', borderRadius: collapsed ? 8 : '8px 8px 0 0', userSelect: 'none',
      }}>
        <FolderOutlined style={{ color: '#722ed1', fontSize: 12 }} />
        <Input size="small" value={node.label || ''} onChange={e => { e.stopPropagation(); onChange({ ...node, label: e.target.value }) }}
          onClick={e => e.stopPropagation()} placeholder="分组名称"
          variant="borderless" style={{ flex: 1, fontWeight: 500, fontSize: 12, color: '#722ed1' }} />
        <Tag style={{ fontSize: 10, margin: 0, background: '#f0e6ff', color: '#722ed1', border: 'none' }}>{(node.children || []).length} 步</Tag>
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} />
        {collapsed ? <CaretRightOutlined style={{ fontSize: 10, color: '#722ed1' }} /> : <CaretDownOutlined style={{ fontSize: 10, color: '#722ed1' }} />}
      </div>
      {!collapsed && (
        <div style={{ padding: '8px 8px 8px 20px', borderTop: '1px solid #f0e6ff' }}>
          <StepListInner steps={node.children || []} onChange={ch => onChange({ ...node, children: ch })} />
        </div>
      )}
    </div>
  )
}

// ---- 编排节点：循环 ----
function LoopNode({ node, index, onChange, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ border: '1px solid #91d5ff', borderRadius: 8, marginBottom: 6, background: '#fafeff' }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer',
        background: '#e6f7ff', borderRadius: collapsed ? 8 : '8px 8px 0 0', userSelect: 'none',
      }}>
        <RetweetOutlined style={{ color: '#1890ff', fontSize: 12 }} />
        <span style={{ fontSize: 12, color: '#1890ff', fontWeight: 500 }}>循环</span>
        <Input size="small" value={node.times ?? 3} type="number" onChange={e => { e.stopPropagation(); onChange({ ...node, times: parseInt(e.target.value) || 1 }) }}
          onClick={e => e.stopPropagation()} style={{ width: 50, textAlign: 'center', fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#86909c' }}>次</span>
        <Input size="small" value={node.label || ''} onChange={e => { e.stopPropagation(); onChange({ ...node, label: e.target.value }) }}
          onClick={e => e.stopPropagation()} placeholder="循环描述" variant="borderless"
          style={{ flex: 1, fontSize: 12, color: '#1890ff' }} />
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} />
        {collapsed ? <CaretRightOutlined style={{ fontSize: 10 }} /> : <CaretDownOutlined style={{ fontSize: 10 }} />}
      </div>
      {!collapsed && (
        <div style={{ padding: '8px 8px 8px 20px', borderTop: '1px solid #d6edff' }}>
          <StepListInner steps={node.children || []} onChange={ch => onChange({ ...node, children: ch })} />
        </div>
      )}
    </div>
  )
}

// ---- 编排节点：条件 ----
function ConditionNode({ node, index, onChange, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ border: '1px solid #ffc069', borderRadius: 8, marginBottom: 6, background: '#fffef8' }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer',
        background: '#fffbe6', borderRadius: collapsed ? 8 : '8px 8px 0 0', userSelect: 'none',
      }}>
        <BranchesOutlined style={{ color: '#faad14', fontSize: 12 }} />
        <span style={{ fontSize: 12, color: '#faad14', fontWeight: 500 }}>IF</span>
        <Input size="small" value={node.condition || ''} onChange={e => { e.stopPropagation(); onChange({ ...node, condition: e.target.value }) }}
          onClick={e => e.stopPropagation()} placeholder='response.status_code == 200'
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} />
        {collapsed ? <CaretRightOutlined style={{ fontSize: 10 }} /> : <CaretDownOutlined style={{ fontSize: 10 }} />}
      </div>
      {!collapsed && (
        <div>
          <div style={{ padding: '6px 8px 6px 20px', borderTop: '1px solid #fff1b8' }}>
            <div style={{ fontSize: 10, color: '#52c41a', fontWeight: 600, marginBottom: 4 }}>THEN</div>
            <StepListInner steps={node.thenSteps || []} onChange={ch => onChange({ ...node, thenSteps: ch })} />
          </div>
          <div style={{ padding: '6px 8px 6px 20px', borderTop: '1px dashed #ffc069' }}>
            <div style={{ fontSize: 10, color: '#ff4d4f', fontWeight: 600, marginBottom: 4 }}>ELSE</div>
            <StepListInner steps={node.elseSteps || []} onChange={ch => onChange({ ...node, elseSteps: ch })} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- 内部递归列表（支持嵌套） ----
function StepListInner({ steps, onChange }) {
  const update = (i, ns) => onChange(steps.map((s, j) => j === i ? { ...ns, seq: j + 1 } : s))
  const remove = (i) => onChange(steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, seq: j + 1 })))
  const addApi = () => onChange([...steps, {
    nodeType: 'api', seq: steps.length + 1, method: 'GET', url: '', action: '',
    params: [], headers: [], body: '', bodyType: 'json',
    assertions: [{ type: 'status', operator: 'eq', expected: '200' }], extractors: [],
  }])

  const addMenu = {
    items: [
      { key: 'api', icon: <ApiOutlined />, label: 'API 请求' },
      { key: 'group', icon: <FolderOutlined />, label: '分组' },
      { key: 'loop', icon: <RetweetOutlined />, label: '循环' },
      { key: 'condition', icon: <BranchesOutlined />, label: '条件判断' },
    ],
    onClick: ({ key }) => {
      if (key === 'api') addApi()
      else if (key === 'group') onChange([...steps, { nodeType: 'group', seq: steps.length + 1, label: '', children: [] }])
      else if (key === 'loop') onChange([...steps, { nodeType: 'loop', seq: steps.length + 1, label: '', times: 3, children: [] }])
      else if (key === 'condition') onChange([...steps, { nodeType: 'condition', seq: steps.length + 1, condition: '', thenSteps: [], elseSteps: [] }])
    },
  }

  return (
    <div>
      {steps.map((s, i) => {
        const nt = s.nodeType || 'api'
        if (nt === 'group') return <GroupNode key={i} node={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} />
        if (nt === 'loop') return <LoopNode key={i} node={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} />
        if (nt === 'condition') return <ConditionNode key={i} node={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} />
        return <ApiStepCard key={i} step={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} canRemove={steps.length > 1} />
      })}
      <Dropdown menu={addMenu} trigger={['click']}>
        <Button type="dashed" block icon={<PlusOutlined />} style={{ borderRadius: 8 }}>添加步骤</Button>
      </Dropdown>
    </div>
  )
}

// ---- 主导出组件 ----
export default function ApiStepList({ steps, onChange }) {
  return <StepListInner steps={steps} onChange={onChange} />
}

// ---- 代码生成（支持分组/循环/条件） ----
function genStepsCode(steps, indent = '    ') {
  const lines = []
  for (const s of steps) {
    const nt = s.nodeType || 'api'

    if (nt === 'group') {
      lines.push(`${indent}# ── ${s.label || '分组'} ──`)
      lines.push(...genStepsCode(s.children || [], indent))
      lines.push(`${indent}# ── /${s.label || '分组'} ──`)
      lines.push('')
      continue
    }

    if (nt === 'loop') {
      lines.push(`${indent}for _i in range(${s.times || 3}):  # ${s.label || '循环'}`)
      lines.push(...genStepsCode(s.children || [], indent + '    '))
      lines.push('')
      continue
    }

    if (nt === 'condition') {
      lines.push(`${indent}if ${s.condition || 'True'}:`)
      if ((s.thenSteps || []).length) lines.push(...genStepsCode(s.thenSteps, indent + '    '))
      else lines.push(`${indent}    pass`)
      if ((s.elseSteps || []).length) {
        lines.push(`${indent}else:`)
        lines.push(...genStepsCode(s.elseSteps, indent + '    '))
      }
      lines.push('')
      continue
    }

    // api node
    lines.push(`${indent}# Step ${s.seq}: ${s.action || s.method + ' ' + s.url}`)
    const method = (s.method || 'GET').toLowerCase()
    const url = s.url || '/'
    let kwargs = []
    if (s.params?.filter(p => p.key).length) {
      const obj = s.params.filter(p => p.key).map(p => `"${p.key}": "${p.value || ''}"`).join(', ')
      kwargs.push(`params={${obj}}`)
    }
    if (s.headers?.filter(h => h.key).length) {
      const obj = s.headers.filter(h => h.key).map(h => `"${h.key}": "${h.value || ''}"`).join(', ')
      kwargs.push(`headers={${obj}}`)
    }
    if ((s.bodyType || 'json') !== 'none' && s.body?.trim()) {
      kwargs.push(s.bodyType === 'form' ? `data="${s.body}"` : `json=${s.body}`)
    }
    const argStr = kwargs.length ? `, ${kwargs.join(', ')}` : ''
    lines.push(`${indent}response = client.${method}("${url}"${argStr})`)

    for (const a of (s.assertions || [])) {
      if (a.type === 'status') lines.push(`${indent}assert response.status_code == ${a.expected || 200}`)
      else if (a.type === 'jsonPath' && a.path) {
        const expr = 'response.json()' + a.path.replace('$.', '').split('.').map(p => `["${p}"]`).join('')
        if (a.operator === 'notEmpty') lines.push(`${indent}assert ${expr}`)
        else if (a.operator === 'eq') { const v = isNaN(a.expected) ? `"${a.expected}"` : a.expected; lines.push(`${indent}assert ${expr} == ${v}`) }
        else if (a.operator === 'contains') lines.push(`${indent}assert "${a.expected}" in str(${expr})`)
      } else if (a.type === 'contains' && a.expected) lines.push(`${indent}assert "${a.expected}" in response.text`)
    }

    for (const e of (s.extractors || [])) {
      if (e.variable && e.path) {
        const expr = 'response.json()' + e.path.replace('$.', '').split('.').map(p => `["${p}"]`).join('')
        lines.push(`${indent}${e.variable} = ${expr}`)
      }
    }
    lines.push('')
  }
  return lines
}

export function generateApiCodeFromSteps(steps, title) {
  const fnName = 'test_' + (title || 'scenario').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40).toLowerCase()
  const header = [
    'import httpx', 'import pytest', '', '',
    'BASE_URL = "http://localhost:8000"', '', '',
    `def ${fnName}():`,
    `    """${title || '接口测试'}"""`,
    '    client = httpx.Client(base_url=BASE_URL)', '',
  ]
  const body = genStepsCode(steps)
  return [...header, ...body].join('\n')
}
