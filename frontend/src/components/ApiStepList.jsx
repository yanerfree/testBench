import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Input, Select, Button, Tag, Space, Tooltip, Dropdown, Popover, Checkbox, Spin } from 'antd'
import {
  PlusOutlined, DeleteOutlined, HolderOutlined, CaretRightOutlined, CaretDownOutlined,
  FolderOutlined, RetweetOutlined, BranchesOutlined, ApiOutlined,
  ClockCircleOutlined, UnorderedListOutlined, ThunderboltOutlined, CopyOutlined,
  CodeOutlined, EditOutlined, CheckCircleOutlined, FieldStringOutlined, GlobalOutlined,
  SendOutlined, FormatPainterOutlined, LockOutlined, LoadingOutlined,
} from '@ant-design/icons'
import { api } from '../utils/request'

const methodColors = {
  GET: { color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' },
  POST: { color: '#fa8c16', bg: '#fff7e6', border: '#ffd591' },
  PUT: { color: '#faad14', bg: '#fffbe6', border: '#ffe58f' },
  PATCH: { color: '#722ed1', bg: '#f9f0ff', border: '#d3adf7' },
  DELETE: { color: '#ff4d4f', bg: '#fff2f0', border: '#ffa39e' },
}

// ---- 动态变量 ----
const dynamicVars = [
  { key: '$uuid', label: 'UUID', desc: '随机 UUID v4', example: 'a1b2c3d4-...' },
  { key: '$timestamp', label: '时间戳', desc: '当前 Unix 时间戳（秒）', example: '1717488000' },
  { key: '$timestampMs', label: '毫秒时间戳', desc: '当前 Unix 时间戳（毫秒）', example: '1717488000123' },
  { key: '$isoDate', label: 'ISO 日期', desc: 'ISO 8601 格式', example: '2026-06-04T12:00:00Z' },
  { key: '$randomInt', label: '随机整数', desc: '0-99999 随机数', example: '42731' },
  { key: '$randomFloat', label: '随机浮点', desc: '0-1 随机浮点数', example: '0.7823' },
  { key: '$randomEmail', label: '随机邮箱', desc: '随机邮箱地址', example: 'user_38271@test.com' },
  { key: '$randomPhone', label: '随机手机号', desc: '随机 11 位手机号', example: '138xxxx1234' },
  { key: '$randomString', label: '随机字符串', desc: '8 位随机字符', example: 'aB3kP9mZ' },
  { key: '$randomName', label: '随机姓名', desc: '随机中文姓名', example: '张三' },
]

// ---- 前置脚本片段 ----
const preScriptSnippets = [
  { key: 'setHeader', label: '设置请求头', desc: '添加 Authorization 等 Header',
    code: '# 设置请求头\nheaders["Authorization"] = f"Bearer {token}"' },
  { key: 'genSign', label: '生成签名', desc: 'MD5 签名计算',
    code: 'import hashlib\ntimestamp_str = str(int(time.time()))\nraw = f"{timestamp_str}{secret_key}"\nsign = hashlib.md5(raw.encode()).hexdigest()\nheaders["X-Timestamp"] = timestamp_str\nheaders["X-Sign"] = sign' },
  { key: 'dynamicParam', label: '动态参数', desc: '生成动态值供请求使用',
    code: '# 动态参数\norder_no = f"ORD_{int(time.time())}_{random.randint(1000,9999)}"' },
  { key: 'debugPrint', label: '打印调试', desc: '输出调试日志',
    code: 'print(f"[PRE] 请求即将发送: {url}")' },
  { key: 'readEnv', label: '读取环境变量', desc: '从系统环境变量获取配置',
    code: 'import os\napi_key = os.environ.get("API_KEY", "default_key")' },
  { key: 'setBody', label: '构造请求体', desc: '动态构造 JSON Body',
    code: 'import json\nrequest_body = json.dumps({\n    "username": f"user_{random.randint(1000,9999)}",\n    "timestamp": int(time.time()),\n})' },
]

const postScriptSnippets = [
  { key: 'printResp', label: '打印响应', desc: '输出状态码 + 响应体',
    code: 'print(f"[POST] 状态码: {response.status_code}")\nprint(f"[POST] 响应体: {response.text[:500]}")' },
  { key: 'extractData', label: '提取数据', desc: '从响应 JSON 提取字段',
    code: '# 提取响应数据\ndata = response.json()\nuser_id = data["data"]["id"]\ntoken = data["data"]["token"]' },
  { key: 'condCheck', label: '条件检查', desc: '根据响应执行不同逻辑',
    code: 'if response.status_code == 200:\n    print(f"[POST] 成功")\nelse:\n    print(f"[POST] 失败: {response.status_code}")' },
  { key: 'cleanup', label: '清理数据', desc: 'DELETE 请求清理资源',
    code: '# 清理测试数据\nif response.status_code in (200, 201):\n    resource_id = response.json()["data"]["id"]\n    client.delete(f"/api/resources/{resource_id}")' },
  { key: 'delay', label: '延时等待', desc: '请求后等待',
    code: 'import time\ntime.sleep(1)  # 等待 1 秒' },
]

// ---- 工具组件 ----
function insertAtCursor(ref, cur, snippet, onChange) {
  const el = ref.current?.resizableTextArea?.textArea
  if (el) {
    const s = el.selectionStart, e = el.selectionEnd
    const before = cur.slice(0, s), after = cur.slice(e)
    const sep = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    onChange(before + sep + snippet + '\n' + after)
    requestAnimationFrame(() => { const p = (before + sep + snippet + '\n').length; el.setSelectionRange(p, p); el.focus() })
  } else {
    const sep = cur && !cur.endsWith('\n') ? '\n' : ''
    onChange(cur + sep + snippet + '\n')
  }
}

function SnippetPicker({ snippets, onInsert }) {
  return (
    <Popover trigger="click" placement="bottomRight" arrow={false}
      content={
        <div style={{ width: 340, maxHeight: 400, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: '#86909c', padding: '4px 8px 6px', fontWeight: 600 }}>点击插入代码片段</div>
          {snippets.map(s => (
            <div key={s.key} onClick={() => onInsert(s.code)}
              style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 6, marginBottom: 2 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f5ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <CodeOutlined style={{ fontSize: 11, color: '#1890ff' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1d2129' }}>{s.label}</span>
                <span style={{ fontSize: 10, color: '#86909c' }}>{s.desc}</span>
              </div>
              <pre style={{ margin: 0, padding: '4px 8px', background: '#fafafa', borderRadius: 4, fontSize: 10, color: '#4e5969', fontFamily: 'monospace', lineHeight: 1.5, whiteSpace: 'pre-wrap', border: '1px solid #f0f0f0', maxHeight: 80, overflow: 'hidden' }}>{s.code}</pre>
            </div>
          ))}
        </div>
      }>
      <Tooltip title="插入代码片段">
        <Button type="text" size="small" icon={<CodeOutlined />} style={{ color: '#1890ff', fontSize: 12 }}>片段</Button>
      </Tooltip>
    </Popover>
  )
}

function VarPicker({ onInsert }) {
  return (
    <Popover trigger="click" placement="bottomRight" arrow={false}
      content={
        <div style={{ width: 260, maxHeight: 300, overflow: 'auto' }}>
          <div style={{ fontSize: 11, color: '#86909c', padding: '4px 8px', fontWeight: 600 }}>点击插入动态变量</div>
          {dynamicVars.map(v => (
            <div key={v.key} onClick={() => onInsert(`{{${v.key}}}`)}
              style={{ padding: '6px 8px', cursor: 'pointer', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f5ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#1890ff' }}>{`{{${v.key}}}`}</div>
                <div style={{ fontSize: 10, color: '#86909c' }}>{v.desc}</div>
              </div>
              <span style={{ fontSize: 10, color: '#c9cdd4', fontFamily: 'monospace' }}>{v.example}</span>
            </div>
          ))}
        </div>
      }>
      <Tooltip title="插入动态变量">
        <Button type="text" size="small" icon={<ThunderboltOutlined />} style={{ color: '#faad14', fontSize: 12 }} />
      </Tooltip>
    </Popover>
  )
}

// ---- KvEditor (Apifox 风格：checkbox + key + value + desc) ----
function KvEditor({ items = [], onChange, keyPh = 'Key', valPh = 'Value' }) {
  const up = (i, f, v) => onChange(items.map((r, j) => j === i ? { ...r, [f]: v } : r))
  const typeName = keyPh === 'Header' ? '请求头' : '参数'
  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 4, padding: '0 4px', fontSize: 10, color: '#c9cdd4', fontWeight: 600 }}>
          <span style={{ width: 20 }}></span>
          <span style={{ flex: 3 }}>{keyPh}</span>
          <span style={{ flex: 4 }}>{valPh}</span>
          <span style={{ flex: 3 }}>描述</span>
          <span style={{ width: 24 }}></span>
        </div>
      )}
      {items.length === 0 && (
        <div style={{ padding: '16px 0', textAlign: 'center', color: '#c9cdd4', fontSize: 12 }}>
          暂无{typeName}，点击下方按钮添加
        </div>
      )}
      {items.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center', opacity: r.enabled === false ? 0.45 : 1, transition: 'opacity 0.15s' }}>
          <Checkbox checked={r.enabled !== false} onChange={e => up(i, 'enabled', e.target.checked)} style={{ marginRight: -2 }} />
          <Input size="small" value={r.key} placeholder={keyPh} onChange={e => up(i, 'key', e.target.value)} style={{ flex: 3, fontFamily: 'monospace', fontSize: 11 }} />
          <Input size="small" value={r.value} placeholder={valPh} onChange={e => up(i, 'value', e.target.value)} style={{ flex: 4, fontFamily: 'monospace', fontSize: 11 }} />
          <Input size="small" value={r.desc || ''} placeholder="描述" onChange={e => up(i, 'desc', e.target.value)} style={{ flex: 3, fontSize: 11, color: '#86909c' }} />
          <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => onChange([...items, { key: '', value: '', enabled: true, desc: '' }])}>添加</Button>
    </div>
  )
}

// ===========================================================================
// 左侧面板：紧凑步骤列表（Apifox 风格）
// ===========================================================================

function CompactApiRow({ step, index, isSelected, onClick, onRemove, onCopy, onDragStart, onDragOver, onDrop }) {
  const method = step.method || 'GET'
  const mc = methodColors[method] || methodColors.GET
  const label = step.action || step.url || '未命名请求'
  const subLabel = step.action && step.url ? step.url : null
  const postOps = getOps(step, 'postOperations')
  const assertCount = postOps.filter(o => o.type === 'assertion').length
  const extractCount = postOps.filter(o => o.type === 'extractor').length
  const [hovered, setHovered] = useState(false)

  return (
    <div draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(index) }}
      onDragOver={e => { e.preventDefault(); onDragOver?.(index) }}
      onDrop={e => { e.preventDefault(); onDrop?.(index) }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer',
        background: isSelected ? mc.bg : hovered ? '#f7f8fa' : 'transparent',
        borderLeft: isSelected ? `3px solid ${mc.color}` : '3px solid transparent',
        transition: 'all 0.12s',
      }}>
      <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', fontSize: 9, flexShrink: 0, opacity: hovered ? 1 : 0, transition: 'opacity 0.1s' }} />
      <Tag style={{ margin: 0, fontWeight: 700, fontSize: 9, background: mc.bg, color: mc.color, border: 'none', padding: '0 5px', lineHeight: '16px', minWidth: 38, textAlign: 'center' }}>{method}</Tag>
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#1d2129', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        {subLabel && <div style={{ fontSize: 10, color: '#c9cdd4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{subLabel}</div>}
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'center' }}>
        {assertCount > 0 && <span title={`${assertCount} 个断言`} style={{ fontSize: 9, background: '#f6ffed', color: '#52c41a', borderRadius: 8, padding: '0 4px', lineHeight: '16px', fontWeight: 600 }}>{assertCount}</span>}
        {extractCount > 0 && <span title={`${extractCount} 个提取`} style={{ fontSize: 9, background: '#f9f0ff', color: '#722ed1', borderRadius: 8, padding: '0 4px', lineHeight: '16px', fontWeight: 600 }}>{extractCount}</span>}
      </div>
      {hovered && (
        <div style={{ display: 'flex', gap: 0, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <Tooltip title="复制"><Button type="text" size="small" icon={<CopyOutlined />} onClick={onCopy} style={{ width: 20, height: 20, fontSize: 10, color: '#86909c' }} /></Tooltip>
          <Tooltip title="删除"><Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={onRemove} style={{ width: 20, height: 20, fontSize: 10 }} /></Tooltip>
        </div>
      )}
    </div>
  )
}

function CompactGroupRow({ node, children, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', background: '#f9f0ff',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#f0e6ff'}
        onMouseLeave={e => e.currentTarget.style.background = '#f9f0ff'}>
        {collapsed ? <CaretRightOutlined style={{ fontSize: 9, color: '#722ed1' }} /> : <CaretDownOutlined style={{ fontSize: 9, color: '#722ed1' }} />}
        <FolderOutlined style={{ color: '#722ed1', fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#722ed1', fontWeight: 500 }}>Group</span>
        <span style={{ fontSize: 12, color: '#722ed1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label || '分组'}</span>
        <span style={{ fontSize: 10, color: '#b37feb' }}>({(node.children || []).length})</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} style={{ fontSize: 10, width: 20, height: 20 }} />
      </div>
      {!collapsed && <div style={{ paddingLeft: 16 }}>{children}</div>}
    </div>
  )
}

function CompactLoopRow({ node, children, onChange, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', background: '#e6f7ff',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#d6edff'}
        onMouseLeave={e => e.currentTarget.style.background = '#e6f7ff'}>
        {collapsed ? <CaretRightOutlined style={{ fontSize: 9, color: '#1890ff' }} /> : <CaretDownOutlined style={{ fontSize: 9, color: '#1890ff' }} />}
        <RetweetOutlined style={{ color: '#1890ff', fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#1890ff', fontWeight: 500 }}>循环 {node.times || 3} 次</span>
        <span style={{ fontSize: 12, color: '#1890ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label || ''}</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} style={{ fontSize: 10, width: 20, height: 20 }} />
      </div>
      {!collapsed && <div style={{ paddingLeft: 16 }}>{children}</div>}
    </div>
  )
}

function CompactForEachRow({ node, children, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', background: '#e6fffb',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#b5f5ec'}
        onMouseLeave={e => e.currentTarget.style.background = '#e6fffb'}>
        {collapsed ? <CaretRightOutlined style={{ fontSize: 9, color: '#13c2c2' }} /> : <CaretDownOutlined style={{ fontSize: 9, color: '#13c2c2' }} />}
        <UnorderedListOutlined style={{ color: '#13c2c2', fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#13c2c2', fontWeight: 500 }}>ForEach</span>
        <span style={{ fontSize: 11, color: '#13c2c2', fontFamily: 'monospace' }}>{node.iterVar || 'item'}</span>
        <span style={{ fontSize: 10, color: '#86909c' }}>in</span>
        <span style={{ fontSize: 11, color: '#13c2c2', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{node.dataSource || '[]'}</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} style={{ fontSize: 10, width: 20, height: 20 }} />
      </div>
      {!collapsed && <div style={{ paddingLeft: 16 }}>{children}</div>}
    </div>
  )
}

function CompactConditionRow({ node, onRemove, thenChildren, elseChildren }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', cursor: 'pointer', background: '#fffbe6',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#fff1b8'}
        onMouseLeave={e => e.currentTarget.style.background = '#fffbe6'}>
        {collapsed ? <CaretRightOutlined style={{ fontSize: 9, color: '#faad14' }} /> : <CaretDownOutlined style={{ fontSize: 9, color: '#faad14' }} />}
        <BranchesOutlined style={{ color: '#faad14', fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#faad14', fontWeight: 500 }}>IF</span>
        <span style={{ fontSize: 11, color: '#faad14', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{node.condition || 'True'}</span>
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} style={{ fontSize: 10, width: 20, height: 20 }} />
      </div>
      {!collapsed && (
        <div>
          <div style={{ paddingLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#52c41a', padding: '2px 10px', fontWeight: 600 }}>THEN</div>
            {thenChildren}
          </div>
          <div style={{ paddingLeft: 16 }}>
            <div style={{ fontSize: 10, color: '#ff4d4f', padding: '2px 10px', fontWeight: 600 }}>ELSE</div>
            {elseChildren}
          </div>
        </div>
      )}
    </div>
  )
}

function CompactWaitRow({ node, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#f7f8fa' }}>
      <ClockCircleOutlined style={{ color: '#86909c', fontSize: 11 }} />
      <span style={{ fontSize: 11, color: '#86909c' }}>等待 {node.delay || 1000}ms</span>
      <span style={{ fontSize: 11, color: '#c9cdd4', flex: 1 }}>{node.label || ''}</span>
      <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={onRemove} style={{ fontSize: 10, width: 20, height: 20 }} />
    </div>
  )
}

function CompactStepList({ steps, onChange, selectedId, onSelect }) {
  const [dragIdx, setDragIdx] = useState(null)
  const update = (i, ns) => onChange(steps.map((s, j) => j === i ? { ...ns, seq: j + 1 } : s))
  const remove = (i) => onChange(steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, seq: j + 1 })))
  const copy = (i) => {
    const clone = JSON.parse(JSON.stringify(steps[i]))
    clone.action = (clone.action || '') + ' (副本)'
    onChange([...steps.slice(0, i + 1), { ...clone, seq: i + 2 }, ...steps.slice(i + 1).map((s, j) => ({ ...s, seq: i + j + 3 }))])
  }
  const handleDragOver = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    const newSteps = [...steps]
    const [moved] = newSteps.splice(dragIdx, 1)
    newSteps.splice(targetIdx, 0, moved)
    onChange(newSteps.map((s, j) => ({ ...s, seq: j + 1 })))
    setDragIdx(targetIdx)
  }

  return (
    <div>
      {steps.map((s, i) => {
        const nt = s.nodeType || 'api'
        if (nt === 'group') return (
          <CompactGroupRow key={i} node={s} onRemove={() => remove(i)}>
            <CompactStepList steps={s.children || []} onChange={ch => update(i, { ...s, children: ch })} selectedId={selectedId} onSelect={onSelect} />
          </CompactGroupRow>
        )
        if (nt === 'loop') return (
          <CompactLoopRow key={i} node={s} onChange={ns => update(i, ns)} onRemove={() => remove(i)}>
            <CompactStepList steps={s.children || []} onChange={ch => update(i, { ...s, children: ch })} selectedId={selectedId} onSelect={onSelect} />
          </CompactLoopRow>
        )
        if (nt === 'forEach') return (
          <CompactForEachRow key={i} node={s} onRemove={() => remove(i)}>
            <CompactStepList steps={s.children || []} onChange={ch => update(i, { ...s, children: ch })} selectedId={selectedId} onSelect={onSelect} />
          </CompactForEachRow>
        )
        if (nt === 'condition') return (
          <CompactConditionRow key={i} node={s} onRemove={() => remove(i)}
            thenChildren={<CompactStepList steps={s.thenSteps || []} onChange={ch => update(i, { ...s, thenSteps: ch })} selectedId={selectedId} onSelect={onSelect} />}
            elseChildren={<CompactStepList steps={s.elseSteps || []} onChange={ch => update(i, { ...s, elseSteps: ch })} selectedId={selectedId} onSelect={onSelect} />}
          />
        )
        if (nt === 'wait') return <CompactWaitRow key={i} node={s} onRemove={() => remove(i)} />
        return <CompactApiRow key={i} step={s} index={i} isSelected={selectedId === s}
          onClick={() => onSelect(s, ns => update(i, ns))}
          onRemove={() => remove(i)} onCopy={() => copy(i)}
          onDragStart={setDragIdx} onDragOver={handleDragOver} onDrop={() => setDragIdx(null)} />
      })}
    </div>
  )
}

// ===========================================================================
// 数据格式迁移（旧格式 → 新格式）
// ===========================================================================
function getOps(step, key) {
  if (step[key]) return step[key]
  if (key === 'preOperations') {
    const ops = []
    if (step.preScript?.trim()) ops.push({ type: 'script', code: step.preScript })
    return ops
  }
  const ops = []
  for (const a of (step.assertions || [])) ops.push({ type: 'assertion', assertType: a.type, path: a.path, operator: a.operator, expected: a.expected })
  for (const e of (step.extractors || [])) ops.push({ type: 'extractor', variable: e.variable, path: e.path })
  if (step.postScript?.trim()) ops.push({ type: 'script', code: step.postScript })
  return ops
}

// ===========================================================================
// 操作条目摘要文本
// ===========================================================================
const opMeta = {
  assertion: { icon: <CheckCircleOutlined />, color: '#52c41a', label: '断言' },
  extractor: { icon: <FieldStringOutlined />, color: '#722ed1', label: '提取变量' },
  script: { icon: <CodeOutlined />, color: '#1890ff', label: '脚本' },
  wait: { icon: <ClockCircleOutlined />, color: '#86909c', label: '等待' },
}

const assertTypes = [{ value: 'status', label: '状态码' }, { value: 'jsonPath', label: 'Response JSON' }, { value: 'contains', label: '包含' }, { value: 'header', label: '响应头' }]
const assertOps = [{ value: 'eq', label: '等于' }, { value: 'ne', label: '不等于' }, { value: 'gt', label: '大于' }, { value: 'lt', label: '小于' }, { value: 'contains', label: '包含' }, { value: 'notEmpty', label: '非空' }]

function opSummary(op) {
  if (op.type === 'assertion') {
    const t = assertTypes.find(x => x.value === op.assertType)?.label || op.assertType
    const o = assertOps.find(x => x.value === op.operator)?.label || op.operator
    if (op.assertType === 'status') return `${t} ${o} ${op.expected || ''}`
    return `${t} (${op.path || '...'}) ${o} ${op.expected || ''}`
  }
  if (op.type === 'extractor') return `${op.variable || '...'} 临时变量 Response JSON (${op.path || '...'})`
  if (op.type === 'script') { const l = (op.code || '').trim().split('\n')[0]; return l ? (l.length > 50 ? l.slice(0, 50) + '...' : l) : '(空脚本)' }
  if (op.type === 'wait') return `${op.delay || 1000}ms${op.label ? '  ' + op.label : ''}`
  return ''
}

// ===========================================================================
// 单个操作条目（可展开编辑 + 可拖拽）
// ===========================================================================
function OperationItem({ op, index, onChange, onRemove, onDragStart, onDragOver, onDrop, snippets }) {
  const [expanded, setExpanded] = useState(false)
  const scriptRef = useRef(null)
  const meta = opMeta[op.type] || opMeta.script
  const up = (f, v) => onChange({ ...op, [f]: v })

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(index) }}
      onDragOver={e => { e.preventDefault(); onDragOver(index) }}
      onDrop={e => { e.preventDefault(); onDrop(index) }}
      style={{ border: '1px solid #f0f0f0', borderRadius: 6, marginBottom: 4, background: '#fff', transition: 'box-shadow 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div onClick={() => setExpanded(!expanded)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', userSelect: 'none',
      }}>
        <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', fontSize: 10, flexShrink: 0 }} />
        <span style={{ color: meta.color, fontSize: 11, flexShrink: 0 }}>{meta.icon}</span>
        <span style={{ fontSize: 11, color: meta.color, fontWeight: 500, flexShrink: 0 }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: '#86909c', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: op.type === 'script' ? 'monospace' : 'inherit' }}>
          {opSummary(op)}
        </span>
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} style={{ width: 20, height: 20 }} />
        {expanded ? <CaretDownOutlined style={{ fontSize: 9, color: '#c9cdd4' }} /> : <CaretRightOutlined style={{ fontSize: 9, color: '#c9cdd4' }} />}
      </div>

      {expanded && (
        <div style={{ padding: '6px 10px 10px 28px', borderTop: '1px solid #f5f5f5' }}>
          {op.type === 'assertion' && (
            <div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select size="small" value={op.assertType || 'status'} onChange={v => up('assertType', v)} options={assertTypes} style={{ width: 120 }} />
                {(op.assertType === 'jsonPath' || op.assertType === 'header') && (
                  <Tooltip title="JSONPath 示例：$.data.id, $.list[0].name, $.total"><Input size="small" value={op.path || ''} placeholder="$.data.id" onChange={e => up('path', e.target.value)} style={{ width: 160, fontFamily: 'monospace', fontSize: 11 }} /></Tooltip>
                )}
                <Select size="small" value={op.operator || 'eq'} onChange={v => up('operator', v)} options={assertOps} style={{ width: 80 }} />
                {op.operator !== 'notEmpty' && (
                  <Input size="small" value={op.expected || ''} placeholder={op.assertType === 'status' ? '200' : '期望值'} onChange={e => up('expected', e.target.value)} style={{ flex: 1, minWidth: 80, fontFamily: 'monospace', fontSize: 11 }} />
                )}
              </div>
              <div style={{ fontSize: 10, color: '#c9cdd4', marginTop: 4 }}>
                {op.assertType === 'status' && '验证接口返回的 HTTP 状态码，如 200、201、404'}
                {op.assertType === 'jsonPath' && '用 JSONPath 定位响应 JSON 中的字段，如 $.data.token'}
                {op.assertType === 'contains' && '检查响应体文本是否包含指定字符串'}
                {op.assertType === 'header' && '检查响应头中指定字段的值，如 Content-Type'}
              </div>
            </div>
          )}
          {op.type === 'extractor' && (
            <div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <Tooltip title="后续步骤可用 {{变量名}} 引用"><Input size="small" value={op.variable || ''} placeholder="如: token" onChange={e => up('variable', e.target.value)} style={{ width: 100, fontFamily: 'monospace', fontSize: 11 }} /></Tooltip>
                <Tag style={{ margin: 0, fontSize: 10, background: '#e6f7ff', color: '#1890ff', border: 'none' }}>临时变量</Tag>
                <span style={{ fontSize: 11, color: '#86909c' }}>Response JSON</span>
                <Tooltip title="JSONPath 示例：$.data.token, $.list[0].id"><Input size="small" value={op.path || ''} placeholder="$.data.token" onChange={e => up('path', e.target.value)} style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} /></Tooltip>
              </div>
              <div style={{ fontSize: 10, color: '#c9cdd4', marginTop: 4 }}>从响应 JSON 中提取值存为临时变量，后续步骤用 {'{{变量名}}'} 引用</div>
            </div>
          )}
          {op.type === 'script' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <Space size={4}>
                  <VarPicker onInsert={v => { const c = op.code || ''; up('code', c + (c && !c.endsWith('\n') ? '\n' : '') + v) }} />
                  {snippets && <SnippetPicker snippets={snippets} onInsert={code => insertAtCursor(scriptRef, op.code || '', code, v => up('code', v))} />}
                </Space>
              </div>
              <Input.TextArea ref={scriptRef} value={op.code || ''} onChange={e => up('code', e.target.value)}
                placeholder="# 在此编写脚本，或点击「片段」快速插入" autoSize={{ minRows: 3, maxRows: 16 }}
                style={{ fontFamily: 'monospace', fontSize: 11 }} />
            </div>
          )}
          {op.type === 'wait' && (
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input size="small" value={op.delay ?? 1000} type="number" onChange={e => up('delay', parseInt(e.target.value) || 0)} style={{ width: 80, textAlign: 'center', fontSize: 11 }} />
                <span style={{ fontSize: 11, color: '#86909c' }}>ms</span>
                <Input size="small" value={op.label || ''} placeholder="描述（可选）" onChange={e => up('label', e.target.value)} style={{ flex: 1, fontSize: 11 }} />
              </div>
              <div style={{ fontSize: 10, color: '#c9cdd4', marginTop: 4 }}>在两个操作之间暂停指定毫秒数，1000ms = 1秒</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// 操作列表（扁平、可拖拽排序）
// ===========================================================================
function OperationList({ operations, onChange, addItems, snippets, infoBg, infoBorder, infoColor, infoIcon, infoTitle, infoDesc }) {
  const [dragIdx, setDragIdx] = useState(null)

  const handleDragOver = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return
    const newOps = [...operations]
    const [moved] = newOps.splice(dragIdx, 1)
    newOps.splice(targetIdx, 0, moved)
    onChange(newOps)
    setDragIdx(targetIdx)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: infoBg, borderRadius: 6, marginBottom: 10, border: `1px solid ${infoBorder}` }}>
        <span style={{ fontSize: 13 }}>{infoIcon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: infoColor, fontWeight: 600 }}>{infoTitle}</div>
          <div style={{ fontSize: 10, color: '#4e5969', marginTop: 1 }}>{infoDesc}</div>
        </div>
      </div>

      {operations.length === 0 && (
        <div style={{ padding: '16px 12px', textAlign: 'center', color: '#c9cdd4', fontSize: 11, border: '1px dashed #e5e6eb', borderRadius: 6, marginBottom: 8 }}>
          暂无操作，点击下方按钮添加断言、提取变量或自定义脚本
        </div>
      )}
      {operations.map((op, i) => (
        <OperationItem key={i} op={op} index={i}
          onChange={newOp => onChange(operations.map((o, j) => j === i ? newOp : o))}
          onRemove={() => onChange(operations.filter((_, j) => j !== i))}
          onDragStart={setDragIdx} onDragOver={handleDragOver} onDrop={() => setDragIdx(null)}
          snippets={snippets} />
      ))}

      <Dropdown menu={{ items: addItems, onClick: ({ key }) => {
        const newOp = key === 'assertion' ? { type: 'assertion', assertType: 'status', operator: 'eq', expected: '200' }
          : key === 'extractor' ? { type: 'extractor', variable: '', path: '' }
          : key === 'script' ? { type: 'script', code: '# 在此编写脚本，点击右上角「片段」可快速插入常用模板\n' }
          : { type: 'wait', delay: 1000, label: '' }
        onChange([...operations, newOp])
      }}} trigger={['click']}>
        <Button type="link" icon={<PlusOutlined />} style={{ padding: '4px 0', marginTop: 4 }}>
          添加{infoTitle.replace('执行', '操作')}
        </Button>
      </Dropdown>
    </div>
  )
}

const preAddItems = [
  { key: 'script', icon: <CodeOutlined />, label: <span>自定义脚本<span style={{ fontSize: 10, color: '#86909c', marginLeft: 6 }}>修改请求参数、生成签名等</span></span> },
  { key: 'wait', icon: <ClockCircleOutlined />, label: <span>等待时间<span style={{ fontSize: 10, color: '#86909c', marginLeft: 6 }}>暂停指定毫秒数</span></span> },
]
const postAddItems = [
  { key: 'assertion', icon: <CheckCircleOutlined />, label: <span>断言<span style={{ fontSize: 10, color: '#86909c', marginLeft: 6 }}>验证状态码、响应体字段</span></span> },
  { key: 'extractor', icon: <FieldStringOutlined />, label: <span>提取变量<span style={{ fontSize: 10, color: '#86909c', marginLeft: 6 }}>从响应中提取值供后续步骤使用</span></span> },
  { key: 'script', icon: <CodeOutlined />, label: <span>自定义脚本<span style={{ fontSize: 10, color: '#86909c', marginLeft: 6 }}>编写自定义逻辑</span></span> },
  { key: 'wait', icon: <ClockCircleOutlined />, label: <span>等待时间<span style={{ fontSize: 10, color: '#86909c', marginLeft: 6 }}>暂停指定毫秒数</span></span> },
]

// ===========================================================================
// Auth 编辑器
// ===========================================================================
function AuthEditor({ auth, onChange }) {
  const a = auth || { type: 'none' }
  const up = (f, v) => onChange({ ...a, [f]: v })
  return (
    <div>
      <Select size="small" value={a.type || 'none'} onChange={v => up('type', v)} style={{ width: 200, marginBottom: 12 }}
        options={[
          { value: 'none', label: '无认证 (No Auth)' },
          { value: 'bearer', label: 'Bearer Token' },
          { value: 'basic', label: 'Basic Auth' },
          { value: 'apikey', label: 'API Key' },
        ]} />
      {a.type === 'bearer' && (
        <div>
          <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>Token</div>
          <Input size="small" value={a.token || ''} onChange={e => up('token', e.target.value)}
            placeholder="输入 Token，支持 {{variable}}" style={{ fontFamily: 'monospace', fontSize: 11 }} />
          <div style={{ fontSize: 10, color: '#c9cdd4', marginTop: 6 }}>会自动添加 Authorization: Bearer {'<token>'} 请求头</div>
        </div>
      )}
      {a.type === 'basic' && (
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <div>
            <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>用户名</div>
            <Input size="small" value={a.username || ''} onChange={e => up('username', e.target.value)} placeholder="Username" style={{ fontSize: 11 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>密码</div>
            <Input.Password size="small" value={a.password || ''} onChange={e => up('password', e.target.value)} placeholder="Password" style={{ fontSize: 11 }} />
          </div>
          <div style={{ fontSize: 10, color: '#c9cdd4' }}>自动进行 Base64 编码并添加 Authorization: Basic 请求头</div>
        </div>
      )}
      {a.type === 'apikey' && (
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>Key 名称</div>
              <Input size="small" value={a.keyName || ''} onChange={e => up('keyName', e.target.value)} placeholder="X-API-Key" style={{ fontSize: 11 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>Key 值</div>
              <Input size="small" value={a.keyValue || ''} onChange={e => up('keyValue', e.target.value)} placeholder="your-api-key" style={{ fontFamily: 'monospace', fontSize: 11 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>添加到</div>
            <Select size="small" value={a.keyIn || 'header'} onChange={v => up('keyIn', v)} style={{ width: 160 }}
              options={[{ value: 'header', label: 'Header' }, { value: 'query', label: 'Query Params' }]} />
          </div>
        </div>
      )}
      {a.type === 'none' && (
        <div style={{ padding: '16px 0', textAlign: 'center', color: '#c9cdd4', fontSize: 12 }}>
          此请求不使用认证
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// Response 面板
// ===========================================================================
function ResponsePanel({ response }) {
  const [viewTab, setViewTab] = useState('body')
  if (!response) return null
  const r = response
  const sc = r.status_code || r.statusCode || 0
  const isOk = sc >= 200 && sc < 300
  const statusColor = sc === 0 ? '#ff4d4f' : isOk ? '#52c41a' : sc < 400 ? '#faad14' : '#ff4d4f'

  let prettyBody = r.body || ''
  try {
    const parsed = JSON.parse(prettyBody)
    prettyBody = JSON.stringify(parsed, null, 2)
  } catch {}

  const sizeStr = r.size > 1024 ? `${(r.size / 1024).toFixed(1)} KB` : `${r.size || 0} B`
  const respHeaders = r.headers || []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', marginBottom: 8, borderBottom: '1px solid #f2f3f5' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: statusColor }}>{sc} {r.status_text || r.statusText || ''}</span>
        <span style={{ fontSize: 11, color: '#86909c' }}>{r.duration_ms || r.durationMs || 0} ms</span>
        <span style={{ fontSize: 11, color: '#86909c' }}>{sizeStr}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 0 }}>
          {['body', 'headers'].map(t => (
            <div key={t} onClick={() => setViewTab(t)} style={{
              padding: '2px 10px', fontSize: 11, cursor: 'pointer',
              color: viewTab === t ? '#1890ff' : '#86909c', fontWeight: viewTab === t ? 600 : 400,
              borderBottom: viewTab === t ? '2px solid #1890ff' : '2px solid transparent',
            }}>{t === 'body' ? 'Body' : `Headers (${respHeaders.length})`}</div>
          ))}
        </div>
      </div>
      {viewTab === 'body' && (
        <Input.TextArea value={prettyBody} readOnly autoSize={{ minRows: 4, maxRows: 20 }}
          style={{ fontFamily: 'monospace', fontSize: 11, background: '#fafbfc', border: '1px solid #f0f0f0' }} />
      )}
      {viewTab === 'headers' && (
        <div>
          {respHeaders.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', borderBottom: '1px solid #f8f8f8', fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: '#4e5969', width: 180, flexShrink: 0, fontFamily: 'monospace' }}>{h.key}</span>
              <span style={{ color: '#86909c', fontFamily: 'monospace', wordBreak: 'break-all' }}>{h.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// 右侧面板：步骤详情编辑器
// ===========================================================================

function StepDetailPanel({ step, onChange, baseUrl }) {
  const [activeTab, setActiveTab] = useState('params')
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState(null)
  const method = step.method || 'GET'
  const mc = methodColors[method] || methodColors.GET
  const up = (f, v) => onChange({ ...step, [f]: v })

  const paramCount = (step.params || []).filter(p => p.key && p.enabled !== false).length
  const headerCount = (step.headers || []).filter(h => h.key && h.enabled !== false).length
  const bodyHas = step.body?.trim() ? 1 : 0
  const preOps = getOps(step, 'preOperations')
  const postOps = getOps(step, 'postOperations')
  const preCount = preOps.length
  const postCount = postOps.length
  const hasAuth = step.auth?.type && step.auth.type !== 'none'

  // Params ↔ URL 同步
  const syncParamsFromUrl = (url) => {
    const qIdx = url.indexOf('?')
    if (qIdx < 0) return
    const path = url.slice(0, qIdx)
    const qs = url.slice(qIdx + 1)
    const newParams = qs.split('&').filter(Boolean).map(p => {
      const [k, ...rest] = p.split('=')
      return { key: decodeURIComponent(k), value: decodeURIComponent(rest.join('=')), enabled: true, desc: '' }
    })
    const existing = (step.params || []).filter(p => p.key && !newParams.find(np => np.key === p.key))
    onChange({ ...step, url: path, params: [...newParams, ...existing] })
  }

  const resolvedUrl = useMemo(() => {
    const base = baseUrl || ''
    const path = step.url || ''
    const enabledParams = (step.params || []).filter(p => p.key && p.enabled !== false)
    const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`).join('&')
    return base + path + (qs ? '?' + qs : '')
  }, [baseUrl, step.url, step.params])

  const handleSend = async () => {
    setSending(true)
    setResponse(null)
    setActiveTab('response')
    try {
      const fullUrl = (baseUrl || '') + (step.url || '')
      const res = await api.post('/debug/send', {
        method: step.method || 'GET',
        url: fullUrl,
        params: step.params || [],
        headers: step.headers || [],
        body: step.body || '',
        bodyType: step.bodyType || 'json',
        auth: step.auth || null,
      })
      setResponse(res.data)
    } catch (e) {
      setResponse({ statusCode: 0, statusText: '请求失败', headers: [], body: e.message, durationMs: 0, size: 0 })
    }
    setSending(false)
  }

  const tabs = [
    { key: 'params', label: 'Params', count: paramCount },
    { key: 'body', label: 'Body', count: bodyHas },
    { key: 'headers', label: 'Headers', count: headerCount },
    { key: 'auth', label: 'Auth', count: hasAuth ? 1 : 0, icon: <LockOutlined style={{ fontSize: 10, marginRight: 2 }} /> },
    { key: 'pre', label: '前置操作', count: preCount },
    { key: 'post', label: '后置操作', count: postCount },
    ...(response ? [{ key: 'response', label: 'Response', count: 0, highlight: true }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 步骤名称 */}
      <div style={{ padding: '8px 16px 0', flexShrink: 0 }}>
        <Input size="small" variant="borderless" value={step.action || ''} onChange={e => up('action', e.target.value)}
          placeholder="步骤名称（如：登录、获取用户信息）"
          style={{ fontSize: 12, color: '#1d2129', padding: '0 4px' }} />
      </div>

      {/* Method + URL + Send */}
      <div style={{ padding: '6px 16px 8px', borderBottom: '1px solid #f2f3f5', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Select size="small" value={method} onChange={v => up('method', v)} style={{ width: 90 }}
            popupMatchSelectWidth={false}
            options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({
              value: m, label: <span style={{ color: methodColors[m]?.color, fontWeight: 700 }}>{m}</span>
            }))} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            {baseUrl && (
              <Tooltip title={baseUrl}>
                <span style={{ fontSize: 11, color: '#86909c', background: '#f7f8fa', border: '1px solid #e5e6eb', borderRight: 'none',
                  borderRadius: '4px 0 0 4px', padding: '3px 8px', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: 'inline-block', lineHeight: '16px', fontFamily: 'monospace', flexShrink: 0 }}>
                  <GlobalOutlined style={{ marginRight: 4, fontSize: 10 }} />{baseUrl}
                </span>
              </Tooltip>
            )}
            <Input size="small" value={step.url || ''} style={{ fontFamily: 'monospace', fontSize: 12, borderRadius: baseUrl ? '0 4px 4px 0' : undefined }}
              placeholder="/api/auth/login"
              onChange={e => {
                const v = e.target.value
                if (v.includes('?')) syncParamsFromUrl(v)
                else up('url', v)
              }} />
            <VarPicker onInsert={v => up('url', (step.url || '') + v)} />
          </div>
          <Button type="primary" size="small" icon={sending ? <LoadingOutlined /> : <SendOutlined />}
            loading={sending} onClick={handleSend}
            style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 600, minWidth: 64 }}>
            发送
          </Button>
        </div>
        {/* 完整 URL 预览 */}
        {(paramCount > 0 || baseUrl) && (
          <div style={{ fontSize: 10, color: '#c9cdd4', marginTop: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={resolvedUrl}>
            {resolvedUrl}
          </div>
        )}
      </div>

      {/* Tab 栏 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f2f3f5', background: '#fafbfc', flexShrink: 0, paddingLeft: 4, overflowX: 'auto' }}>
        {tabs.map(t => (
          <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '7px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
            color: t.highlight ? '#52c41a' : activeTab === t.key ? '#1890ff' : '#86909c',
            fontWeight: activeTab === t.key ? 600 : 400,
            borderBottom: activeTab === t.key ? `2px solid ${t.highlight ? '#52c41a' : '#1890ff'}` : '2px solid transparent',
            transition: 'all 0.12s',
          }}>
            {t.icon}{t.label}
            {t.count > 0 && <span style={{ fontSize: 10, marginLeft: 3, color: activeTab === t.key ? '#1890ff' : '#c9cdd4' }}>{t.count}</span>}
          </div>
        ))}
      </div>

      {/* Tab 内容 */}
      <div style={{ padding: '12px 16px', flex: 1, overflow: 'auto' }}>
        {activeTab === 'params' && <KvEditor items={step.params || []} onChange={v => up('params', v)} keyPh="参数名" valPh="参数值" />}
        {activeTab === 'headers' && <KvEditor items={step.headers || []} onChange={v => up('headers', v)} keyPh="Header" valPh="Value" />}
        {activeTab === 'body' && (
          <div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <Select size="small" value={step.bodyType || 'json'} onChange={v => up('bodyType', v)} style={{ width: 140 }}
                options={[
                  { value: 'json', label: 'JSON' },
                  { value: 'form', label: 'x-www-form-urlencoded' },
                  { value: 'form-data', label: 'form-data' },
                  { value: 'raw', label: 'Raw' },
                  { value: 'none', label: '无 Body' },
                ]} />
              {(step.bodyType || 'json') === 'json' && (
                <Tooltip title="格式化 JSON">
                  <Button size="small" type="text" icon={<FormatPainterOutlined />} onClick={() => {
                    try { up('body', JSON.stringify(JSON.parse(step.body || '{}'), null, 2)) } catch {}
                  }}>格式化</Button>
                </Tooltip>
              )}
            </div>
            {(step.bodyType || 'json') === 'none' && (
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#c9cdd4', fontSize: 12 }}>此请求不包含 Body</div>
            )}
            {((step.bodyType || 'json') === 'json' || step.bodyType === 'raw') && (
              <Input.TextArea value={step.body || ''} onChange={e => up('body', e.target.value)}
                placeholder='{\n  "username": "admin"\n}' autoSize={{ minRows: 6, maxRows: 18 }}
                style={{ fontFamily: 'monospace', fontSize: 11 }} />
            )}
            {step.bodyType === 'form' && (
              <KvEditor items={step.formParams || []} onChange={v => up('formParams', v)} keyPh="字段名" valPh="字段值" />
            )}
            {step.bodyType === 'form-data' && (
              <KvEditor items={step.formDataParams || []} onChange={v => up('formDataParams', v)} keyPh="字段名" valPh="字段值" />
            )}
          </div>
        )}
        {activeTab === 'auth' && <AuthEditor auth={step.auth} onChange={v => up('auth', v)} />}
        {activeTab === 'pre' && (
          <OperationList
            operations={preOps}
            onChange={ops => onChange({ ...step, preOperations: ops })}
            addItems={preAddItems}
            snippets={preScriptSnippets}
            infoBg="#e6f7ff" infoBorder="#bae7ff" infoColor="#1890ff"
            infoIcon="⚡" infoTitle="请求前执行"
            infoDesc="可修改请求参数、设置 Header、生成签名、准备数据"
          />
        )}
        {activeTab === 'post' && (
          <OperationList
            operations={postOps}
            onChange={ops => onChange({ ...step, postOperations: ops })}
            addItems={postAddItems}
            snippets={postScriptSnippets}
            infoBg="#fff7e6" infoBorder="#ffd591" infoColor="#fa8c16"
            infoIcon="📋" infoTitle="请求后执行"
            infoDesc="执行顺序按列表排列，可拖拽调整"
          />
        )}
        {activeTab === 'response' && (
          sending
            ? <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="发送中..." /></div>
            : <ResponsePanel response={response} />
        )}
      </div>
    </div>
  )
}

// ===========================================================================
// 主组件：Apifox 风格左右分栏
// ===========================================================================

const addMenuItems = [
  { key: 'api', icon: <ApiOutlined />, label: 'API 请求' },
  { type: 'divider' },
  { key: 'group', icon: <FolderOutlined />, label: '分组' },
  { key: 'loop', icon: <RetweetOutlined />, label: '循环 (N 次)' },
  { key: 'forEach', icon: <UnorderedListOutlined />, label: 'ForEach 遍历' },
  { key: 'condition', icon: <BranchesOutlined />, label: '条件判断 (IF)' },
  { key: 'wait', icon: <ClockCircleOutlined />, label: '等待' },
]

function makeNewStep(key, seq) {
  if (key === 'api') return { nodeType: 'api', seq, method: 'GET', url: '', action: '', params: [], headers: [], body: '', bodyType: 'json', auth: { type: 'none' }, preOperations: [], postOperations: [{ type: 'assertion', assertType: 'status', operator: 'eq', expected: '200' }] }
  if (key === 'group') return { nodeType: 'group', seq, label: '', children: [] }
  if (key === 'loop') return { nodeType: 'loop', seq, label: '', times: 3, children: [] }
  if (key === 'forEach') return { nodeType: 'forEach', seq, iterVar: 'item', dataSource: '', children: [] }
  if (key === 'condition') return { nodeType: 'condition', seq, condition: '', thenSteps: [], elseSteps: [] }
  if (key === 'wait') return { nodeType: 'wait', seq, delay: 1000, label: '' }
}

export default function ApiStepList({ steps, onChange, environments, runEnv }) {
  const [selected, setSelected] = useState(null)

  const baseUrl = useMemo(() => {
    if (!runEnv || !environments?.length) return ''
    const env = environments.find(e => e.id === runEnv)
    if (!env?.variables) return ''
    const v = env.variables.find(v => v.key === 'BASE_URL')
    return v?.value || ''
  }, [runEnv, environments])

  const handleSelect = useCallback((step, onStepChange) => {
    setSelected({ step, onStepChange })
  }, [])

  const handleDetailChange = useCallback((newStep) => {
    if (selected) {
      selected.onStepChange(newStep)
      setSelected(prev => prev ? { ...prev, step: newStep } : null)
    }
  }, [selected])

  useEffect(() => {
    if (!selected && steps.length > 0) {
      const firstApi = steps.findIndex(s => (s.nodeType || 'api') === 'api')
      if (firstApi >= 0) {
        const s = steps[firstApi]
        handleSelect(s, ns => onChange(steps.map((ss, j) => j === firstApi ? { ...ns, seq: j + 1 } : ss)))
      }
    }
  }, [steps.length])

  const handleAdd = ({ key }) => {
    const newSteps = [...steps, makeNewStep(key, steps.length + 1)]
    onChange(newSteps)
    if (key === 'api') {
      const newStep = newSteps[newSteps.length - 1]
      handleSelect(newStep, ns => {
        const idx = newSteps.length - 1
        onChange(newSteps.map((s, j) => j === idx ? { ...ns, seq: j + 1 } : s))
      })
    }
  }

  return (
    <div style={{ display: 'flex', border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', minHeight: 480, height: 'calc(100vh - 340px)', maxHeight: 800, background: '#fff' }}>
      {/* 左侧：紧凑步骤列表 */}
      <div style={{ width: 300, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafbfc' }}>
          <span style={{ fontSize: 12, color: '#1d2129', fontWeight: 600 }}>步骤 ({steps.length})</span>
          <Dropdown menu={{ items: addMenuItems, onClick: handleAdd }} trigger={['click']}>
            <Button type="primary" size="small" icon={<PlusOutlined />} ghost>添加</Button>
          </Dropdown>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <CompactStepList steps={steps} onChange={onChange} selectedId={selected?.step} onSelect={handleSelect} />
        </div>
      </div>

      {/* 右侧：步骤详情 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {selected ? (
          <StepDetailPanel step={selected.step} onChange={handleDetailChange} baseUrl={baseUrl} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9cdd4' }}>
            <div style={{ textAlign: 'center' }}>
              <ApiOutlined style={{ fontSize: 40, marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>请选择一个 API 步骤查看详情</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===========================================================================
// 代码生成（不变）
// ===========================================================================
function resolveVars(s) {
  return s.replace(/\{\{\$uuid\}\}/g, 'str(uuid.uuid4())')
    .replace(/\{\{\$timestamp\}\}/g, 'str(int(time.time()))')
    .replace(/\{\{\$timestampMs\}\}/g, 'str(int(time.time() * 1000))')
    .replace(/\{\{\$isoDate\}\}/g, 'datetime.now(timezone.utc).isoformat()')
    .replace(/\{\{\$randomInt\}\}/g, 'str(random.randint(0, 99999))')
    .replace(/\{\{\$randomFloat\}\}/g, 'str(round(random.random(), 4))')
    .replace(/\{\{\$randomEmail\}\}/g, 'f"user_{random.randint(1000,9999)}@test.com"')
    .replace(/\{\{\$randomPhone\}\}/g, 'f"138{random.randint(10000000,99999999)}"')
    .replace(/\{\{\$randomString\}\}/g, '"".join(random.choices(string.ascii_letters + string.digits, k=8))')
    .replace(/\{\{\$randomName\}\}/g, 'random.choice(["张三","李四","王五","赵六"])')
    .replace(/\{\{(\w+)\}\}/g, '{$1}')
}

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
    if (nt === 'forEach') {
      lines.push(`${indent}for ${s.iterVar || 'item'} in ${s.dataSource || '[]'}:`)
      lines.push(...genStepsCode(s.children || [], indent + '    '))
      lines.push('')
      continue
    }
    if (nt === 'condition') {
      lines.push(`${indent}if ${s.condition || 'True'}:`)
      if ((s.thenSteps || []).length) lines.push(...genStepsCode(s.thenSteps, indent + '    '))
      else lines.push(`${indent}    pass`)
      if ((s.elseSteps || []).length) { lines.push(`${indent}else:`); lines.push(...genStepsCode(s.elseSteps, indent + '    ')) }
      lines.push('')
      continue
    }
    if (nt === 'wait') {
      lines.push(`${indent}time.sleep(${(s.delay || 1000) / 1000})  # ${s.label || '等待'}`)
      lines.push('')
      continue
    }
    lines.push(`${indent}# Step ${s.seq}: ${s.action || s.method + ' ' + s.url}`)
    const preOps = getOps(s, 'preOperations')
    for (const op of preOps) {
      if (op.type === 'script' && op.code?.trim()) {
        lines.push(`${indent}# 前置脚本`)
        for (const line of op.code.trim().split('\n')) lines.push(`${indent}${line}`)
      }
      if (op.type === 'wait') lines.push(`${indent}time.sleep(${(op.delay || 1000) / 1000})`)
    }
    const method = (s.method || 'GET').toLowerCase()
    const url = resolveVars(s.url || '/')
    let kwargs = []
    if (s.params?.filter(p => p.key && p.enabled !== false).length) { const obj = s.params.filter(p => p.key && p.enabled !== false).map(p => `"${p.key}": "${p.value || ''}"`).join(', '); kwargs.push(`params={${obj}}`) }
    if (s.headers?.filter(h => h.key && h.enabled !== false).length) { const obj = s.headers.filter(h => h.key && h.enabled !== false).map(h => `"${h.key}": "${h.value || ''}"`).join(', '); kwargs.push(`headers={${obj}}`) }
    if ((s.bodyType || 'json') !== 'none' && s.body?.trim()) { kwargs.push(s.bodyType === 'form' ? `data="${s.body}"` : `json=${s.body}`) }
    const argStr = kwargs.length ? `, ${kwargs.join(', ')}` : ''
    lines.push(`${indent}response = client.${method}(f"${url}"${argStr})`)
    const postOps = getOps(s, 'postOperations')
    for (const op of postOps) {
      if (op.type === 'assertion') {
        const a = op
        if (a.assertType === 'status') lines.push(`${indent}assert response.status_code == ${a.expected || 200}`)
        else if (a.assertType === 'jsonPath' && a.path) {
          const expr = 'response.json()' + a.path.replace('$.', '').split('.').map(p => `["${p}"]`).join('')
          if (a.operator === 'notEmpty') lines.push(`${indent}assert ${expr}`)
          else if (a.operator === 'eq') { const v = isNaN(a.expected) ? `"${a.expected}"` : a.expected; lines.push(`${indent}assert ${expr} == ${v}`) }
          else if (a.operator === 'contains') lines.push(`${indent}assert "${a.expected}" in str(${expr})`)
        } else if (a.assertType === 'contains' && a.expected) lines.push(`${indent}assert "${a.expected}" in response.text`)
      }
      if (op.type === 'extractor' && op.variable && op.path) {
        const expr = 'response.json()' + op.path.replace('$.', '').split('.').map(p => `["${p}"]`).join('')
        lines.push(`${indent}${op.variable} = ${expr}`)
      }
      if (op.type === 'script' && op.code?.trim()) {
        lines.push(`${indent}# 后置脚本`)
        for (const line of op.code.trim().split('\n')) lines.push(`${indent}${line}`)
      }
      if (op.type === 'wait') lines.push(`${indent}time.sleep(${(op.delay || 1000) / 1000})`)
    }
    lines.push('')
  }
  return lines
}

export function generateApiCodeFromSteps(steps, title) {
  const fnName = 'test_' + (title || 'scenario').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').substring(0, 40).toLowerCase()
  const needsExtras = JSON.stringify(steps).includes('{{$')
  const header = [
    'import httpx', 'import pytest', 'import time',
    ...(needsExtras ? ['import uuid', 'import random', 'import string', 'from datetime import datetime, timezone'] : []),
    '', '', 'BASE_URL = "http://localhost:8000"', '', '',
    `def ${fnName}():`, `    """${title || '接口测试'}"""`, '    client = httpx.Client(base_url=BASE_URL)', '',
  ]
  return [...header, ...genStepsCode(steps)].join('\n')
}
