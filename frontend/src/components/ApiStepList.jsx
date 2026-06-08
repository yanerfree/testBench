import { useState, useRef, useCallback } from 'react'
import { Input, Select, Button, Tag, Space, Tooltip, Dropdown, Popover, Drawer } from 'antd'
import {
  PlusOutlined, DeleteOutlined, HolderOutlined, CaretRightOutlined, CaretDownOutlined,
  SendOutlined, FolderOutlined, RetweetOutlined, BranchesOutlined, ApiOutlined,
  ClockCircleOutlined, UnorderedListOutlined, ThunderboltOutlined, CopyOutlined,
  CodeOutlined, EditOutlined,
} from '@ant-design/icons'

const methodColors = {
  GET: { color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' },
  POST: { color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff' },
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

// ---- 前置脚本代码片段 ----
const preScriptSnippets = [
  {
    key: 'setHeader', label: '设置请求头',
    desc: '添加 Authorization 等 Header',
    code: '# 设置请求头（在 headers 参数中生效）\nheaders["Authorization"] = f"Bearer {token}"',
  },
  {
    key: 'genSign', label: '生成签名',
    desc: 'MD5 签名计算，结果写入 Header',
    code: 'import hashlib\ntimestamp_str = str(int(time.time()))\nraw = f"{timestamp_str}{secret_key}"\nsign = hashlib.md5(raw.encode()).hexdigest()\nheaders["X-Timestamp"] = timestamp_str\nheaders["X-Sign"] = sign',
  },
  {
    key: 'dynamicParam', label: '动态参数',
    desc: '生成动态值供请求使用',
    code: '# 动态参数 — 后续可在 URL/Body 中引用\norder_no = f"ORD_{int(time.time())}_{random.randint(1000,9999)}"',
  },
  {
    key: 'debugPrint', label: '打印调试信息',
    desc: '输出当前变量状态',
    code: 'print(f"[PRE] 当前 token = {token}")\nprint(f"[PRE] 请求即将发送: {url}")',
  },
  {
    key: 'readEnv', label: '读取环境变量',
    desc: '从系统环境变量获取配置',
    code: 'import os\napi_key = os.environ.get("API_KEY", "default_key")\nbase_url = os.environ.get("BASE_URL", "http://localhost:8000")',
  },
  {
    key: 'setBody', label: '构造请求体',
    desc: '动态构造 JSON Body',
    code: '# 动态构造请求体\nimport json\nrequest_body = json.dumps({\n    "username": f"user_{random.randint(1000,9999)}",\n    "timestamp": int(time.time()),\n})',
  },
]

// ---- 后置脚本代码片段 ----
const postScriptSnippets = [
  {
    key: 'printResp', label: '打印响应信息',
    desc: '输出状态码 + 响应体摘要',
    code: 'print(f"[POST] 状态码: {response.status_code}")\nprint(f"[POST] 响应体: {response.text[:500]}")',
  },
  {
    key: 'extractData', label: '提取并保存数据',
    desc: '从响应 JSON 中提取字段到变量',
    code: '# 提取响应数据到变量（后续步骤可直接使用）\ndata = response.json()\nuser_id = data["data"]["id"]\ntoken = data["data"]["token"]',
  },
  {
    key: 'condCheck', label: '条件检查',
    desc: '根据响应数据执行不同逻辑',
    code: 'if response.status_code == 200:\n    result = response.json()\n    print(f"[POST] 成功: {result.get(\'message\', \'OK\')}")\nelse:\n    print(f"[POST] 失败: {response.status_code} - {response.text[:200]}")',
  },
  {
    key: 'cleanup', label: '清理测试数据',
    desc: '发送 DELETE 请求清理刚创建的资源',
    code: '# 清理本步骤创建的测试数据\nif response.status_code in (200, 201):\n    resource_id = response.json()["data"]["id"]\n    client.delete(f"/api/resources/{resource_id}")',
  },
  {
    key: 'delay', label: '延时等待',
    desc: '请求后等待（限流/异步场景）',
    code: 'import time\ntime.sleep(1)  # 等待 1 秒，适用于限流或异步处理场景',
  },
  {
    key: 'saveToFile', label: '保存到文件',
    desc: '将响应数据写入文件备查',
    code: 'import json\nwith open("/tmp/response_debug.json", "w") as f:\n    json.dump(response.json(), f, ensure_ascii=False, indent=2)\nprint("[POST] 响应已保存到 /tmp/response_debug.json")',
  },
]

// ---- 片段插入工具 ----
function insertAtCursor(textareaRef, currentValue, snippet, onChange) {
  const el = textareaRef.current?.resizableTextArea?.textArea
  if (el) {
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = currentValue.slice(0, start)
    const after = currentValue.slice(end)
    const sep = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    const newValue = before + sep + snippet + '\n' + after
    onChange(newValue)
    requestAnimationFrame(() => {
      const pos = (before + sep + snippet + '\n').length
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  } else {
    const sep = currentValue && !currentValue.endsWith('\n') ? '\n' : ''
    onChange(currentValue + sep + snippet + '\n')
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
              <pre style={{
                margin: 0, padding: '4px 8px', background: '#fafafa', borderRadius: 4,
                fontSize: 10, color: '#4e5969', fontFamily: 'monospace', lineHeight: 1.5,
                whiteSpace: 'pre-wrap', border: '1px solid #f0f0f0', maxHeight: 80, overflow: 'hidden',
              }}>{s.code}</pre>
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

// ---- API 步骤折叠卡片（仅摘要行） ----
function ApiStepCardCollapsed({ step, index, onRemove, canRemove, onOpenDrawer }) {
  const method = step.method || 'GET'
  const mc = methodColors[method] || methodColors.GET

  const badges = []
  if (step.params?.some(p => p.key)) badges.push({ label: `${step.params.filter(p => p.key).length} 参数`, color: '#86909c' })
  if (step.body?.trim()) badges.push({ label: 'Body', color: '#722ed1' })
  if (step.assertions?.length) badges.push({ label: `${step.assertions.length} 断言`, color: '#52c41a' })
  if (step.extractors?.length) badges.push({ label: `${step.extractors.length} 变量`, color: '#1890ff' })
  if (step.preScript?.trim()) badges.push({ label: '前置', color: '#13c2c2' })
  if (step.postScript?.trim()) badges.push({ label: '后置', color: '#fa8c16' })

  return (
    <div style={{
      border: '1px solid #f2f3f5', borderRadius: 8, marginBottom: 6,
      background: '#fff', transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = mc.border; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#f2f3f5'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div onClick={onOpenDrawer} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer', userSelect: 'none',
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
        <EditOutlined style={{ fontSize: 11, color: '#c9cdd4' }} />
      </div>
    </div>
  )
}

// ---- API 步骤抽屉内容（左右布局 + 增强脚本编辑） ----
function ApiStepDrawerContent({ step, index, onChange }) {
  const [activeTab, setActiveTab] = useState('params')
  const preScriptRef = useRef(null)
  const postScriptRef = useRef(null)
  const method = step.method || 'GET'
  const mc = methodColors[method] || methodColors.GET
  const up = (f, v) => onChange({ ...step, [f]: v })

  const tabs = [
    { key: 'params', label: 'Params' }, { key: 'headers', label: 'Headers' },
    { key: 'body', label: 'Body' }, { key: 'assertions', label: '断言' },
    { key: 'extractors', label: '变量' }, { key: 'preScript', label: '前置脚本' },
    { key: 'postScript', label: '后置脚本' },
  ]

  const tabCounts = {
    params: step.params?.filter(p => p.key).length || 0,
    headers: step.headers?.filter(h => h.key).length || 0,
    assertions: step.assertions?.length || 0,
    extractors: step.extractors?.length || 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部标识栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px',
        borderBottom: '1px solid #f2f3f5', background: '#fafbfc', flexShrink: 0,
      }}>
        <span style={{
          width: 24, height: 22, borderRadius: 4, background: mc.bg, color: mc.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0,
          border: `1px solid ${mc.border}`,
        }}>{index + 1}</span>
        <Tag style={{ margin: 0, fontWeight: 700, fontSize: 11, background: mc.bg, color: mc.color, border: `1px solid ${mc.border}`, padding: '1px 8px', lineHeight: '20px' }}>{method}</Tag>
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#1d2129', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {step.url || '/api/...'}
        </span>
        {step.action && <span style={{ fontSize: 12, color: '#86909c' }}>{step.action}</span>}
      </div>

      {/* 主体：左右布局 */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* 左侧：Method + URL + 描述 */}
        <div style={{ width: 260, borderRight: '1px solid #f2f3f5', padding: '14px 16px', flexShrink: 0, overflow: 'auto' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4, fontWeight: 500 }}>请求方法</div>
            <Select size="small" value={method} onChange={v => up('method', v)} style={{ width: '100%' }}
              options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({
                value: m, label: <span style={{ color: methodColors[m]?.color, fontWeight: 600 }}>{m}</span>
              }))} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#86909c', fontWeight: 500 }}>请求路径</span>
              <VarPicker onInsert={v => up('url', (step.url || '') + v)} />
            </div>
            <Input size="small" value={step.url || ''} onChange={e => up('url', e.target.value)}
              placeholder="/api/auth/login" style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4, fontWeight: 500 }}>步骤描述</div>
            <Input.TextArea size="small" value={step.action || ''} onChange={e => up('action', e.target.value)}
              placeholder="用户登录获取 token" autoSize={{ minRows: 2, maxRows: 5 }} style={{ fontSize: 12 }} />
          </div>

          {/* 执行流程可视化 */}
          <div style={{ marginTop: 16, padding: '10px 12px', background: '#f7f8fa', borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: '#86909c', fontWeight: 600, marginBottom: 8 }}>执行顺序</div>
            {['1. 前置脚本', '2. 发送请求', '3. 断言检查', '4. 提取变量', '5. 后置脚本'].map((item, i) => (
              <div key={i} style={{
                fontSize: 10, color: '#4e5969', padding: '3px 0', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{
                  width: 4, height: 4, borderRadius: 2, flexShrink: 0,
                  background: i === 0 ? '#1890ff' : i === 1 ? '#52c41a' : i === 2 ? '#faad14' : i === 3 ? '#722ed1' : '#fa8c16',
                }} />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：Tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #f2f3f5', background: '#fafbfc', flexShrink: 0 }}>
            {tabs.map(t => {
              const count = tabCounts[t.key]
              return (
                <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '8px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  color: activeTab === t.key ? '#1890ff' : '#86909c',
                  fontWeight: activeTab === t.key ? 600 : 400,
                  borderBottom: activeTab === t.key ? '2px solid #1890ff' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                  {t.label}
                  {count > 0 && <span style={{ fontSize: 9, marginLeft: 3, color: activeTab === t.key ? '#1890ff' : '#c9cdd4' }}>({count})</span>}
                  {t.key === 'preScript' && step.preScript?.trim() && <span style={{ marginLeft: 3, width: 5, height: 5, borderRadius: 3, background: '#1890ff', display: 'inline-block', verticalAlign: 'middle' }} />}
                  {t.key === 'postScript' && step.postScript?.trim() && <span style={{ marginLeft: 3, width: 5, height: 5, borderRadius: 3, background: '#fa8c16', display: 'inline-block', verticalAlign: 'middle' }} />}
                </div>
              )
            })}
          </div>
          <div style={{ padding: '12px 14px', flex: 1, overflow: 'auto' }}>
            {activeTab === 'params' && <KvEditor items={step.params || []} onChange={v => up('params', v)} keyPh="参数名" valPh="参数值" />}
            {activeTab === 'headers' && <KvEditor items={step.headers || []} onChange={v => up('headers', v)} keyPh="Header" valPh="Value" />}
            {activeTab === 'body' && (
              <div>
                <Select size="small" value={step.bodyType || 'json'} onChange={v => up('bodyType', v)} style={{ width: 90, marginBottom: 6 }}
                  options={[{ value: 'json', label: 'JSON' }, { value: 'form', label: 'Form' }, { value: 'none', label: '无' }]} />
                {(step.bodyType || 'json') !== 'none' && (
                  <Input.TextArea value={step.body || ''} onChange={e => up('body', e.target.value)}
                    placeholder='{\n  "username": "admin"\n}' autoSize={{ minRows: 6, maxRows: 16 }}
                    style={{ fontFamily: 'monospace', fontSize: 11 }} />
                )}
              </div>
            )}
            {activeTab === 'assertions' && <AssertEditor items={step.assertions || []} onChange={v => up('assertions', v)} />}
            {activeTab === 'extractors' && <ExtractEditor items={step.extractors || []} onChange={v => up('extractors', v)} />}

            {/* 前置脚本 Tab */}
            {activeTab === 'preScript' && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                  background: '#e6f7ff', borderRadius: 6, marginBottom: 10, border: '1px solid #bae7ff',
                }}>
                  <span style={{ fontSize: 14 }}>{"⚡"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#1890ff', fontWeight: 600 }}>请求前执行</div>
                    <div style={{ fontSize: 10, color: '#4e5969', marginTop: 1 }}>可修改请求参数、设置 Header、生成签名、准备测试数据</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#86909c', fontWeight: 500 }}>Python 代码</span>
                  <Space size={4}>
                    <VarPicker onInsert={v => {
                      const cur = step.preScript || ''
                      const sep = cur && !cur.endsWith('\n') ? '\n' : ''
                      up('preScript', cur + sep + v)
                    }} />
                    <SnippetPicker snippets={preScriptSnippets}
                      onInsert={code => insertAtCursor(preScriptRef, step.preScript || '', code, v => up('preScript', v))} />
                  </Space>
                </div>
                <Input.TextArea ref={preScriptRef} value={step.preScript || ''} onChange={e => up('preScript', e.target.value)}
                  placeholder="# 在此编写前置脚本，或点击右上角「片段」快速插入常用代码"
                  autoSize={{ minRows: 8, maxRows: 20 }} style={{ fontFamily: 'monospace', fontSize: 11 }} />
              </div>
            )}

            {/* 后置脚本 Tab */}
            {activeTab === 'postScript' && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                  background: '#fff7e6', borderRadius: 6, marginBottom: 10, border: '1px solid #ffd591',
                }}>
                  <span style={{ fontSize: 14 }}>{"📋"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#fa8c16', fontWeight: 600 }}>断言和变量提取之后执行</div>
                    <div style={{ fontSize: 10, color: '#4e5969', marginTop: 1 }}>可做数据清理、日志输出、条件逻辑、保存响应数据</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#86909c', fontWeight: 500 }}>Python 代码</span>
                  <Space size={4}>
                    <VarPicker onInsert={v => {
                      const cur = step.postScript || ''
                      const sep = cur && !cur.endsWith('\n') ? '\n' : ''
                      up('postScript', cur + sep + v)
                    }} />
                    <SnippetPicker snippets={postScriptSnippets}
                      onInsert={code => insertAtCursor(postScriptRef, step.postScript || '', code, v => up('postScript', v))} />
                  </Space>
                </div>
                <Input.TextArea ref={postScriptRef} value={step.postScript || ''} onChange={e => up('postScript', e.target.value)}
                  placeholder="# 在此编写后置脚本，或点击右上角「片段」快速插入常用代码"
                  autoSize={{ minRows: 8, maxRows: 20 }} style={{ fontFamily: 'monospace', fontSize: 11 }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- 编排节点：分组 ----
function GroupNode({ node, index, onChange, onRemove, onOpenDrawer }) {
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
          <StepListInner steps={node.children || []} onChange={ch => onChange({ ...node, children: ch })} onOpenDrawer={onOpenDrawer} />
        </div>
      )}
    </div>
  )
}

// ---- 编排节点：循环 ----
function LoopNode({ node, index, onChange, onRemove, onOpenDrawer }) {
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
          <StepListInner steps={node.children || []} onChange={ch => onChange({ ...node, children: ch })} onOpenDrawer={onOpenDrawer} />
        </div>
      )}
    </div>
  )
}

// ---- 编排节点：条件 ----
function ConditionNode({ node, index, onChange, onRemove, onOpenDrawer }) {
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
            <StepListInner steps={node.thenSteps || []} onChange={ch => onChange({ ...node, thenSteps: ch })} onOpenDrawer={onOpenDrawer} />
          </div>
          <div style={{ padding: '6px 8px 6px 20px', borderTop: '1px dashed #ffc069' }}>
            <div style={{ fontSize: 10, color: '#ff4d4f', fontWeight: 600, marginBottom: 4 }}>ELSE</div>
            <StepListInner steps={node.elseSteps || []} onChange={ch => onChange({ ...node, elseSteps: ch })} onOpenDrawer={onOpenDrawer} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- 编排节点：等待 ----
function WaitNode({ node, onChange, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      border: '1px solid #d9d9d9', borderRadius: 8, marginBottom: 6, background: '#fafafa',
    }}>
      <ClockCircleOutlined style={{ color: '#86909c', fontSize: 12 }} />
      <span style={{ fontSize: 12, color: '#86909c', fontWeight: 500 }}>等待</span>
      <Input size="small" value={node.delay ?? 1000} type="number" style={{ width: 80, textAlign: 'center', fontSize: 11 }}
        onChange={e => onChange({ ...node, delay: parseInt(e.target.value) || 0 })} />
      <span style={{ fontSize: 11, color: '#86909c' }}>毫秒</span>
      <Input size="small" value={node.label || ''} placeholder="等待描述（可选）" variant="borderless"
        onChange={e => onChange({ ...node, label: e.target.value })} style={{ flex: 1, fontSize: 12, color: '#86909c' }} />
      <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={onRemove} />
    </div>
  )
}

// ---- 编排节点：ForEach 循环 ----
function ForEachNode({ node, onChange, onRemove, onOpenDrawer }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ border: '1px solid #87e8de', borderRadius: 8, marginBottom: 6, background: '#f6fffb' }}>
      <div onClick={() => setCollapsed(!collapsed)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer',
        background: '#e6fffb', borderRadius: collapsed ? 8 : '8px 8px 0 0', userSelect: 'none',
      }}>
        <UnorderedListOutlined style={{ color: '#13c2c2', fontSize: 12 }} />
        <span style={{ fontSize: 12, color: '#13c2c2', fontWeight: 500 }}>ForEach</span>
        <Input size="small" value={node.iterVar || 'item'} onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); onChange({ ...node, iterVar: e.target.value }) }}
          placeholder="item" style={{ width: 60, textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#86909c' }}>in</span>
        <Input size="small" value={node.dataSource || ''} onClick={e => e.stopPropagation()}
          onChange={e => { e.stopPropagation(); onChange({ ...node, dataSource: e.target.value }) }}
          placeholder='{{users}} 或 ["a","b","c"]' style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
        <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={e => { e.stopPropagation(); onRemove() }} />
        {collapsed ? <CaretRightOutlined style={{ fontSize: 10 }} /> : <CaretDownOutlined style={{ fontSize: 10 }} />}
      </div>
      {!collapsed && (
        <div style={{ padding: '8px 8px 8px 20px', borderTop: '1px solid #b5f5ec' }}>
          <StepListInner steps={node.children || []} onChange={ch => onChange({ ...node, children: ch })} onOpenDrawer={onOpenDrawer} />
        </div>
      )}
    </div>
  )
}

function StepListInner({ steps, onChange, onOpenDrawer }) {
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
      { type: 'divider' },
      { key: 'group', icon: <FolderOutlined />, label: '分组' },
      { key: 'loop', icon: <RetweetOutlined />, label: '循环 (N 次)' },
      { key: 'forEach', icon: <UnorderedListOutlined />, label: 'ForEach 遍历' },
      { key: 'condition', icon: <BranchesOutlined />, label: '条件判断 (IF)' },
      { key: 'wait', icon: <ClockCircleOutlined />, label: '等待' },
    ],
    onClick: ({ key }) => {
      if (key === 'api') addApi()
      else if (key === 'group') onChange([...steps, { nodeType: 'group', seq: steps.length + 1, label: '', children: [] }])
      else if (key === 'loop') onChange([...steps, { nodeType: 'loop', seq: steps.length + 1, label: '', times: 3, children: [] }])
      else if (key === 'forEach') onChange([...steps, { nodeType: 'forEach', seq: steps.length + 1, iterVar: 'item', dataSource: '', children: [] }])
      else if (key === 'condition') onChange([...steps, { nodeType: 'condition', seq: steps.length + 1, condition: '', thenSteps: [], elseSteps: [] }])
      else if (key === 'wait') onChange([...steps, { nodeType: 'wait', seq: steps.length + 1, delay: 1000, label: '' }])
    },
  }

  return (
    <div>
      {steps.map((s, i) => {
        const nt = s.nodeType || 'api'
        if (nt === 'group') return <GroupNode key={i} node={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} onOpenDrawer={onOpenDrawer} />
        if (nt === 'loop') return <LoopNode key={i} node={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} onOpenDrawer={onOpenDrawer} />
        if (nt === 'forEach') return <ForEachNode key={i} node={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} onOpenDrawer={onOpenDrawer} />
        if (nt === 'condition') return <ConditionNode key={i} node={s} index={i} onChange={ns => update(i, ns)} onRemove={() => remove(i)} onOpenDrawer={onOpenDrawer} />
        if (nt === 'wait') return <WaitNode key={i} node={s} onChange={ns => update(i, ns)} onRemove={() => remove(i)} />
        return <ApiStepCardCollapsed key={i} step={s} index={i}
          onRemove={() => remove(i)} canRemove={steps.length > 1}
          onOpenDrawer={() => onOpenDrawer(s, ns => update(i, ns), i)} />
      })}
      <Dropdown menu={addMenu} trigger={['click']}>
        <Button type="dashed" block icon={<PlusOutlined />} style={{ borderRadius: 8 }}>添加步骤</Button>
      </Dropdown>
    </div>
  )
}

// ---- 主导出组件 ----
export default function ApiStepList({ steps, onChange }) {
  const [drawerState, setDrawerState] = useState(null)

  const openDrawer = useCallback((step, onStepChange, index) => {
    setDrawerState({ step, onStepChange, index })
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerState(null)
  }, [])

  const handleDrawerChange = useCallback((newStep) => {
    if (drawerState) {
      drawerState.onStepChange(newStep)
      setDrawerState(prev => prev ? { ...prev, step: newStep } : null)
    }
  }, [drawerState])

  return (
    <>
      <StepListInner steps={steps} onChange={onChange} onOpenDrawer={openDrawer} />
      <Drawer
        open={!!drawerState}
        onClose={closeDrawer}
        width={760}
        destroyOnClose={false}
        closable={true}
        styles={{ header: { display: 'none' }, body: { padding: 0 } }}
      >
        {drawerState && (
          <ApiStepDrawerContent
            step={drawerState.step}
            index={drawerState.index}
            onChange={handleDrawerChange}
          />
        )}
      </Drawer>
    </>
  )
}

// ---- 代码生成（支持全部编排节点） ----
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
      const src = s.dataSource || '[]'
      lines.push(`${indent}for ${s.iterVar || 'item'} in ${src}:`)
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

    if (nt === 'wait') {
      lines.push(`${indent}time.sleep(${(s.delay || 1000) / 1000})  # ${s.label || '等待'}`)
      lines.push('')
      continue
    }

    // api node
    lines.push(`${indent}# Step ${s.seq}: ${s.action || s.method + ' ' + s.url}`)
    if (s.preScript?.trim()) {
      lines.push(`${indent}# 前置脚本`)
      for (const line of s.preScript.trim().split('\n')) lines.push(`${indent}${line}`)
    }

    const method = (s.method || 'GET').toLowerCase()
    const url = resolveVars(s.url || '/')
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
    lines.push(`${indent}response = client.${method}(f"${url}"${argStr})`)

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

    if (s.postScript?.trim()) {
      lines.push(`${indent}# 后置脚本`)
      for (const line of s.postScript.trim().split('\n')) lines.push(`${indent}${line}`)
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
    '', '',
    'BASE_URL = "http://localhost:8000"', '', '',
    `def ${fnName}():`,
    `    """${title || '接口测试'}"""`,
    '    client = httpx.Client(base_url=BASE_URL)', '',
  ]
  const body = genStepsCode(steps)
  return [...header, ...body].join('\n')
}
