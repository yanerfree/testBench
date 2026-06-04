import { useState } from 'react'
import { Input, Select, Button, Tag, Space, Tooltip, Collapse } from 'antd'
import { PlusOutlined, DeleteOutlined, HolderOutlined, CaretRightOutlined, SendOutlined } from '@ant-design/icons'

const methodColors = {
  GET: { color: '#52c41a', bg: '#f6ffed' },
  POST: { color: '#1890ff', bg: '#e6f7ff' },
  PUT: { color: '#faad14', bg: '#fffbe6' },
  PATCH: { color: '#722ed1', bg: '#f9f0ff' },
  DELETE: { color: '#ff4d4f', bg: '#fff2f0' },
}

function KvEditor({ items = [], onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
  const update = (idx, field, val) => {
    const next = items.map((r, i) => i === idx ? { ...r, [field]: val } : r)
    onChange(next)
  }
  const add = () => onChange([...items, { key: '', value: '' }])
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div>
      {items.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <Input size="small" value={r.key} placeholder={keyPlaceholder}
            onChange={e => update(i, 'key', e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
          <Input size="small" value={r.value} placeholder={valuePlaceholder}
            onChange={e => update(i, 'value', e.target.value)}
            style={{ flex: 2, fontFamily: 'monospace', fontSize: 12 }} />
          <Button type="text" size="small" icon={<DeleteOutlined />} danger
            onClick={() => remove(i)} style={{ flexShrink: 0 }} />
        </div>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={add}
        style={{ width: '100%', marginTop: 2 }}>添加</Button>
    </div>
  )
}

function AssertionEditor({ items = [], onChange }) {
  const typeOptions = [
    { value: 'status', label: '状态码' },
    { value: 'jsonPath', label: 'JSON 路径' },
    { value: 'contains', label: '包含文本' },
    { value: 'header', label: '响应头' },
  ]
  const opOptions = [
    { value: 'eq', label: '等于' },
    { value: 'ne', label: '不等于' },
    { value: 'gt', label: '大于' },
    { value: 'lt', label: '小于' },
    { value: 'contains', label: '包含' },
    { value: 'notEmpty', label: '不为空' },
    { value: 'exists', label: '存在' },
  ]
  const update = (idx, field, val) => {
    const next = items.map((r, i) => i === idx ? { ...r, [field]: val } : r)
    onChange(next)
  }
  const add = () => onChange([...items, { type: 'status', path: '', operator: 'eq', expected: '200' }])
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div>
      {items.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <Select size="small" value={r.type} onChange={v => update(i, 'type', v)}
            options={typeOptions} style={{ width: 100 }} />
          {(r.type === 'jsonPath' || r.type === 'header') && (
            <Input size="small" value={r.path || ''} placeholder={r.type === 'jsonPath' ? '$.data.token' : 'Content-Type'}
              onChange={e => update(i, 'path', e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
          )}
          <Select size="small" value={r.operator} onChange={v => update(i, 'operator', v)}
            options={opOptions} style={{ width: 80 }} />
          {r.operator !== 'notEmpty' && r.operator !== 'exists' && (
            <Input size="small" value={r.expected || ''} placeholder="期望值"
              onChange={e => update(i, 'expected', e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
          )}
          <Button type="text" size="small" icon={<DeleteOutlined />} danger
            onClick={() => remove(i)} style={{ flexShrink: 0 }} />
        </div>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={add}
        style={{ width: '100%', marginTop: 2 }}>添加断言</Button>
    </div>
  )
}

function ExtractorEditor({ items = [], onChange }) {
  const sourceOptions = [
    { value: 'jsonPath', label: 'JSON 路径' },
    { value: 'header', label: '响应头' },
    { value: 'cookie', label: 'Cookie' },
  ]
  const update = (idx, field, val) => {
    const next = items.map((r, i) => i === idx ? { ...r, [field]: val } : r)
    onChange(next)
  }
  const add = () => onChange([...items, { variable: '', source: 'jsonPath', path: '' }])
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div>
      {items.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
          <Input size="small" value={r.variable} placeholder="变量名 如 token"
            onChange={e => update(i, 'variable', e.target.value)}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} />
          <Select size="small" value={r.source} onChange={v => update(i, 'source', v)}
            options={sourceOptions} style={{ width: 100 }} />
          <Input size="small" value={r.path || ''} placeholder="$.data.token"
            onChange={e => update(i, 'path', e.target.value)}
            style={{ flex: 2, fontFamily: 'monospace', fontSize: 12 }} />
          <Button type="text" size="small" icon={<DeleteOutlined />} danger
            onClick={() => remove(i)} style={{ flexShrink: 0 }} />
        </div>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={add}
        style={{ width: '100%', marginTop: 2 }}>提取变量</Button>
    </div>
  )
}

function ApiStepCard({ step, index, onChange, onRemove, canRemove }) {
  const method = step.method || 'GET'
  const mc = methodColors[method] || methodColors.GET

  const update = (field, val) => onChange({ ...step, [field]: val })

  const tabItems = [
    { key: 'params', label: `Params${step.params?.length ? ` (${step.params.length})` : ''}`,
      children: <KvEditor items={step.params || []} onChange={v => update('params', v)} keyPlaceholder="参数名" valuePlaceholder="参数值" /> },
    { key: 'headers', label: `Headers${step.headers?.length ? ` (${step.headers.length})` : ''}`,
      children: <KvEditor items={step.headers || []} onChange={v => update('headers', v)} keyPlaceholder="Header" valuePlaceholder="Value" /> },
    { key: 'body', label: 'Body',
      children: (
        <div>
          <Select size="small" value={step.bodyType || 'json'} onChange={v => update('bodyType', v)}
            options={[{ value: 'json', label: 'JSON' }, { value: 'form', label: 'Form' }, { value: 'none', label: '无' }]}
            style={{ width: 100, marginBottom: 6 }} />
          {(step.bodyType || 'json') !== 'none' && (
            <Input.TextArea value={step.body || ''} onChange={e => update('body', e.target.value)}
              placeholder={step.bodyType === 'form' ? 'key1=value1&key2=value2' : '{\n  "username": "admin",\n  "password": "123456"\n}'}
              autoSize={{ minRows: 3, maxRows: 10 }}
              style={{ fontFamily: 'monospace', fontSize: 12 }} />
          )}
        </div>
      ) },
    { key: 'assertions', label: `断言${step.assertions?.length ? ` (${step.assertions.length})` : ''}`,
      children: <AssertionEditor items={step.assertions || []} onChange={v => update('assertions', v)} /> },
    { key: 'extractors', label: `提取变量${step.extractors?.length ? ` (${step.extractors.length})` : ''}`,
      children: <ExtractorEditor items={step.extractors || []} onChange={v => update('extractors', v)} /> },
  ]

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab' }} />
      <span style={{
        width: 24, height: 22, borderRadius: 4, background: '#e6f7ff', color: '#1890ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 11, flexShrink: 0,
      }}>{index + 1}</span>
      <Tag style={{ margin: 0, fontWeight: 600, fontSize: 11, background: mc.bg, color: mc.color, border: 'none', minWidth: 50, textAlign: 'center' }}>
        {method}
      </Tag>
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#4e5969', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {step.url || '/api/...'}
      </span>
      <span style={{ fontSize: 12, color: '#86909c', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {step.action || ''}
      </span>
      {step.assertions?.length > 0 && <Tag style={{ fontSize: 10, margin: 0, background: '#f6ffed', color: '#52c41a', border: 'none' }}>{step.assertions.length} 断言</Tag>}
      {step.extractors?.length > 0 && <Tag style={{ fontSize: 10, margin: 0, background: '#e6f7ff', color: '#1890ff', border: 'none' }}>{step.extractors.length} 变量</Tag>}
      {canRemove && (
        <Button type="text" size="small" icon={<DeleteOutlined />} danger
          onClick={e => { e.stopPropagation(); onRemove() }}
          style={{ flexShrink: 0 }} />
      )}
    </div>
  )

  return (
    <div style={{ marginBottom: 8 }}>
      <Collapse
        size="small"
        expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: 10 }} />}
        items={[{
          key: '1',
          label: header,
          children: (
            <div>
              {/* Method + URL + Description */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <Select size="small" value={method} onChange={v => update('method', v)}
                  style={{ width: 90 }}
                  options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({
                    value: m, label: <span style={{ color: methodColors[m]?.color, fontWeight: 600 }}>{m}</span>
                  }))} />
                <Input size="small" value={step.url || ''} onChange={e => update('url', e.target.value)}
                  placeholder="/api/auth/login" prefix={<SendOutlined style={{ color: '#86909c' }} />}
                  style={{ flex: 2, fontFamily: 'monospace' }} />
                <Input size="small" value={step.action || ''} onChange={e => update('action', e.target.value)}
                  placeholder="步骤描述" style={{ flex: 1 }} />
              </div>
              {/* Tabs: Params / Headers / Body / Assertions / Extractors */}
              <div style={{ border: '1px solid #f2f3f5', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid #f2f3f5' }}>
                  <ApiStepTabs items={tabItems} />
                </div>
              </div>
            </div>
          ),
        }]}
      />
    </div>
  )
}

function ApiStepTabs({ items }) {
  const [activeKey, setActiveKey] = useState('params')
  const active = items.find(i => i.key === activeKey) || items[0]
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #f2f3f5', background: '#fafbfc' }}>
        {items.map(item => (
          <div key={item.key} onClick={() => setActiveKey(item.key)}
            style={{
              padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              color: activeKey === item.key ? '#1890ff' : '#86909c',
              fontWeight: activeKey === item.key ? 600 : 400,
              borderBottom: activeKey === item.key ? '2px solid #1890ff' : '2px solid transparent',
            }}>
            {item.label}
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 12px' }}>
        {active?.children}
      </div>
    </div>
  )
}

export default function ApiStepList({ steps, onChange, accentColor }) {
  const updateStep = (idx, newStep) => {
    const next = steps.map((s, i) => i === idx ? { ...newStep, seq: i + 1 } : s)
    onChange(next)
  }
  const addStep = () => {
    onChange([...steps, {
      seq: steps.length + 1, method: 'GET', url: '', action: '',
      params: [], headers: [], body: '', bodyType: 'json',
      assertions: [{ type: 'status', operator: 'eq', expected: '200' }],
      extractors: [],
    }])
  }
  const removeStep = (idx) => {
    onChange(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))
  }

  return (
    <div>
      {steps.map((s, i) => (
        <ApiStepCard key={i} step={s} index={i}
          onChange={ns => updateStep(i, ns)}
          onRemove={() => removeStep(i)}
          canRemove={steps.length > 1} />
      ))}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={addStep}
        style={{ borderRadius: 8 }}>添加 API 步骤</Button>
    </div>
  )
}

export function generateApiCodeFromSteps(steps, title) {
  const lines = ['import httpx', 'import pytest', '', '', `BASE_URL = "http://localhost:8000"`, '', '']
  const fnName = 'test_' + (title || 'scenario').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40).toLowerCase()
  lines.push(`def ${fnName}():`)
  lines.push(`    """${title || '接口测试'}"""`)
  lines.push(`    client = httpx.Client(base_url=BASE_URL)`)

  const varsDeclared = new Set()

  for (const s of steps) {
    lines.push('')
    lines.push(`    # Step ${s.seq}: ${s.action || s.method + ' ' + s.url}`)

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
      if (s.bodyType === 'form') {
        kwargs.push(`data="${s.body}"`)
      } else {
        kwargs.push(`json=${s.body}`)
      }
    }

    const argStr = kwargs.length ? `, ${kwargs.join(', ')}` : ''
    lines.push(`    response = client.${method}("${url}"${argStr})`)

    for (const a of (s.assertions || [])) {
      if (a.type === 'status') {
        lines.push(`    assert response.status_code == ${a.expected || 200}`)
      } else if (a.type === 'jsonPath' && a.path) {
        const parts = a.path.replace('$.', '').split('.')
        let expr = 'response.json()'
        for (const p of parts) expr += `["${p}"]`
        if (a.operator === 'notEmpty') {
          lines.push(`    assert ${expr}`)
        } else if (a.operator === 'exists') {
          lines.push(`    assert "${parts[parts.length - 1]}" in response.json()`)
        } else if (a.operator === 'eq') {
          const val = isNaN(a.expected) ? `"${a.expected}"` : a.expected
          lines.push(`    assert ${expr} == ${val}`)
        } else if (a.operator === 'contains') {
          lines.push(`    assert "${a.expected}" in str(${expr})`)
        }
      } else if (a.type === 'contains' && a.expected) {
        lines.push(`    assert "${a.expected}" in response.text`)
      }
    }

    for (const e of (s.extractors || [])) {
      if (e.variable && e.path) {
        const parts = e.path.replace('$.', '').split('.')
        let expr = 'response.json()'
        for (const p of parts) expr += `["${p}"]`
        lines.push(`    ${e.variable} = ${expr}`)
        varsDeclared.add(e.variable)
      }
    }
  }

  lines.push('')
  return lines.join('\n')
}
