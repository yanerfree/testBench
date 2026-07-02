import { useState, useMemo, useEffect } from 'react'
import { Input, Button, Space, Tag, message, Radio, Switch, InputNumber } from 'antd'
import {
  ToolOutlined, FormatPainterOutlined, SwapOutlined, ClockCircleOutlined,
  FileSearchOutlined, DatabaseOutlined, DiffOutlined, CopyOutlined,
  ReloadOutlined, ThunderboltOutlined, LoadingOutlined
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { TextArea } = Input
const MONO = "'SF Mono', Monaco, Menlo, Consolas, monospace"

const THEMES = {
  json:      { primary: '#43a047', light: '#e8f5e9', bg: 'rgba(232,245,233,0.5)', pale: 'rgba(232,245,233,0.25)', border: 'rgba(67,160,71,0.25)' },
  codec:     { primary: '#00897b', light: '#e0f7fa', bg: 'rgba(224,242,241,0.5)', pale: 'rgba(224,242,241,0.25)', border: 'rgba(0,137,123,0.25)' },
  timestamp: { primary: '#ef6c00', light: '#fff3e0', bg: 'rgba(255,243,224,0.5)', pale: 'rgba(255,243,224,0.25)', border: 'rgba(239,108,0,0.25)' },
  regex:     { primary: '#8e24aa', light: '#f3e5f5', bg: 'rgba(243,229,245,0.5)', pale: 'rgba(243,229,245,0.25)', border: 'rgba(142,36,170,0.25)' },
  datagen:   { primary: '#1e88e5', light: '#e3f2fd', bg: 'rgba(227,242,253,0.5)', pale: 'rgba(227,242,253,0.25)', border: 'rgba(30,136,229,0.25)' },
  diff:      { primary: '#d81b60', light: '#fce4ec', bg: 'rgba(252,228,236,0.5)', pale: 'rgba(252,228,236,0.25)', border: 'rgba(216,27,96,0.25)' },
}

const TOOLS = [
  { key: 'json', icon: <FormatPainterOutlined />, label: 'JSON 工具', desc: '格式化 · 压缩 · 转义' },
  { key: 'codec', icon: <SwapOutlined />, label: '编解码 / Hash', desc: 'Base64 · URL · Hash' },
  { key: 'timestamp', icon: <ClockCircleOutlined />, label: '时间戳转换', desc: '秒 ↔ 日期时间' },
  { key: 'regex', icon: <FileSearchOutlined />, label: '正则测试', desc: '实时匹配 · AI 生成' },
  { key: 'datagen', icon: <DatabaseOutlined />, label: '数据生成', desc: '手机 · 身份证 · UUID' },
  { key: 'diff', icon: <DiffOutlined />, label: '文本对比', desc: 'LCS 逐行差异' },
]

const copy = (text) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => message.success('已复制')).catch(() => fallbackCopy(text))
  } else { fallbackCopy(text) }
}
const fallbackCopy = (text) => {
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy'); message.success('已复制') } catch { message.error('复制失败') }
  document.body.removeChild(ta)
}

const Dot = ({ color }) => (
  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: color, marginRight: 6, verticalAlign: 'middle', opacity: 0.7 }} />
)

const TOOLBOX_CSS = `
.toolbox-page .ant-btn {
  border-radius: 20px !important;
  transition: all 0.2s ease !important;
  font-weight: 500 !important;
  box-shadow: none !important;
}
.toolbox-page .ant-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
}
.toolbox-page .ant-btn-primary:not(:disabled) {
  background: var(--tb-primary) !important;
  border-color: var(--tb-primary) !important;
}
.toolbox-page .ant-btn-primary:not(:disabled):hover {
  filter: brightness(1.08);
}
.toolbox-page .ant-btn:not(.ant-btn-primary):not(.ant-btn-text):not(.ant-btn-link):not(:disabled) {
  color: var(--tb-primary) !important;
  border-color: var(--tb-border) !important;
}
.toolbox-page .ant-btn:not(.ant-btn-primary):not(.ant-btn-text):not(.ant-btn-link):not(:disabled):hover {
  background: var(--tb-pale) !important;
  border-color: var(--tb-primary) !important;
}
.toolbox-page textarea.ant-input,
.toolbox-page .ant-input,
.toolbox-page .ant-input-affix-wrapper {
  border-radius: 12px !important;
  border-width: 1.5px !important;
  transition: border-color 0.2s, box-shadow 0.2s !important;
}
.toolbox-page textarea.ant-input:focus,
.toolbox-page .ant-input:focus,
.toolbox-page .ant-input-affix-wrapper-focused {
  border-color: var(--tb-primary) !important;
  box-shadow: 0 0 0 3px var(--tb-pale) !important;
}
.toolbox-page .ant-input-number {
  border-radius: 12px !important;
  border-width: 1.5px !important;
}
.toolbox-page .ant-tag {
  border-radius: 12px !important;
}
.toolbox-page .ant-radio-group .ant-radio-button-wrapper:first-child {
  border-radius: 14px 0 0 14px !important;
}
.toolbox-page .ant-radio-group .ant-radio-button-wrapper:last-child {
  border-radius: 0 14px 14px 0 !important;
}
.toolbox-page .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled) {
  background: var(--tb-primary) !important;
  border-color: var(--tb-primary) !important;
}
.toolbox-page .ant-switch-checked {
  background: var(--tb-primary) !important;
}
.tb-nav-item {
  transition: all 0.25s ease !important;
  cursor: pointer;
}
.tb-nav-item:hover {
  transform: translateX(3px);
}
.tb-content-fade {
  animation: tbFadeIn 0.25s ease;
}
@keyframes tbFadeIn {
  from { opacity: 0.5; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
`

// ━━━ JSON 工具 ━━━
function JsonTool({ theme }) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [autoFormat, setAutoFormat] = useState(false)

  useEffect(() => {
    if (!autoFormat || !input.trim()) { setOutput(''); setError(''); return }
    try { setOutput(JSON.stringify(JSON.parse(input), null, 2)); setError('') }
    catch (e) { setOutput(''); setError(e.message) }
  }, [input, autoFormat])

  const handleFormat = () => {
    if (!input.trim()) return
    try { const o = JSON.stringify(JSON.parse(input), null, 2); setOutput(o); setError('') }
    catch (e) { setError(e.message) }
  }
  const handleCompress = () => {
    if (!input.trim()) return
    try { const o = JSON.stringify(JSON.parse(input)); setOutput(o); setError('') }
    catch (e) { setError(e.message) }
  }
  const handleEscape = () => {
    if (!input) return
    setOutput(JSON.stringify(input))
  }
  const handleUnescape = () => {
    if (!input.trim()) return
    try {
      const parsed = JSON.parse(input)
      setOutput(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2))
      setError('')
    } catch (e) { setError(e.message) }
  }

  const stats = useMemo(() => {
    if (!input) return null
    return { chars: input.length, lines: input.split('\n').length, bytes: new Blob([input]).size }
  }, [input])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space size={8}>
          <Button type="primary" size="small" onClick={handleFormat}>格式化</Button>
          <Button size="small" onClick={handleCompress}>压缩</Button>
          <Button size="small" onClick={handleEscape}>转义</Button>
          <Button size="small" onClick={handleUnescape}>去转义</Button>
          <span style={{ fontSize: 12, color: theme.primary, opacity: 0.8 }}>
            <Switch size="small" checked={autoFormat} onChange={setAutoFormat} style={{ marginRight: 4 }} />实时格式化
          </span>
        </Space>
        {stats && <span style={{ fontSize: 11, color: theme.primary, opacity: 0.6 }}>{stats.chars} 字符 · {stats.lines} 行 · {stats.bytes} B</span>}
      </div>
      {error && <div style={{ color: '#e53935', fontSize: 12, marginBottom: 10, padding: '6px 12px', background: '#fff5f5', borderRadius: 12, border: '1px solid #ffcdd2' }}>{error}</div>}
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: theme.primary, fontWeight: 600 }}>
              <Dot color={theme.primary} />输入
            </span>
            <Button type="link" size="small" style={{ padding: 0, fontSize: 11, height: 'auto', color: theme.primary }}
              onClick={() => setInput('')}>清空</Button>
          </div>
          <TextArea value={input} onChange={e => { setInput(e.target.value); setError('') }}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', borderColor: theme.border }}
            placeholder={'粘贴 JSON 试试看 ~\n\n支持：对象、数组、转义字符串 "{\\"key\\":\\"val\\"}"'} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: theme.primary, fontWeight: 600 }}>
              <Dot color={theme.primary} />输出
            </span>
            <Button type="link" size="small" icon={<CopyOutlined />} style={{ padding: 0, fontSize: 11, height: 'auto', color: theme.primary }}
              disabled={!output} onClick={() => copy(output)}>复制</Button>
          </div>
          <TextArea value={output} readOnly
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', background: theme.pale, borderColor: theme.border }}
            placeholder="结果会出现在这里 ✨" />
        </div>
      </div>
    </div>
  )
}

// ━━━ 编解码 / Hash ━━━
function CodecTool({ theme }) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState('base64')

  const actions = {
    base64: {
      encode: () => btoa(unescape(encodeURIComponent(input))),
      decode: () => decodeURIComponent(escape(atob(input))),
    },
    url: {
      encode: () => encodeURIComponent(input),
      decode: () => decodeURIComponent(input),
    },
    unicode: {
      encode: () => Array.from(input).map(c => {
        const cp = c.codePointAt(0)
        if (cp <= 127) return c
        return cp > 0xFFFF ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`
      }).join(''),
      decode: () => input.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, p1, p2) => String.fromCodePoint(parseInt(p1 || p2, 16))),
    },
    sha1: { encode: () => simpleHash(input, 'SHA-1') },
    sha256: { encode: () => simpleHash(input, 'SHA-256') },
  }

  const handleAction = async (action) => {
    if (!input) { message.warning('请先输入内容'); return }
    try {
      const fn = actions[mode]?.[action]
      if (!fn) return
      const result = await fn()
      setOutput(result)
    } catch (e) { message.error('操作失败：' + (e.message || '格式不正确')) }
  }

  const isHash = mode === 'sha1' || mode === 'sha256'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Radio.Group value={mode} onChange={e => { setMode(e.target.value); setOutput('') }} size="small" buttonStyle="solid">
          <Radio.Button value="base64">Base64</Radio.Button>
          <Radio.Button value="url">URL</Radio.Button>
          <Radio.Button value="unicode">Unicode</Radio.Button>
          <Radio.Button value="sha1">SHA-1</Radio.Button>
          <Radio.Button value="sha256">SHA-256</Radio.Button>
        </Radio.Group>
        <Button type="primary" size="small" onClick={() => handleAction('encode')}>{isHash ? '计算' : '编码 →'}</Button>
        {!isHash && <Button size="small" onClick={() => handleAction('decode')}>← 解码</Button>}
        <Button size="small" icon={<CopyOutlined />} disabled={!output} onClick={() => copy(output)}>复制</Button>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
            <Dot color={theme.primary} />输入
          </div>
          <TextArea value={input} onChange={e => setInput(e.target.value)}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', borderColor: theme.border }}
            placeholder="输入要处理的内容 ~" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
            <Dot color={theme.primary} />输出
          </div>
          <TextArea value={output} readOnly
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', background: theme.pale, borderColor: theme.border }} />
        </div>
      </div>
    </div>
  )
}

async function simpleHash(text, algo) {
  const data = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest(algo, data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ━━━ 时间戳转换 ━━━
function TimestampTool({ theme }) {
  const [ts, setTs] = useState('')
  const [dt, setDt] = useState('')
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const tsToDate = () => {
    if (!ts) return
    const n = Number(ts)
    const d = ts.length > 10 ? new Date(n) : new Date(n * 1000)
    if (isNaN(d.getTime())) { message.error('无效时间戳'); return }
    setDt(formatDate(d))
  }
  const dateToTs = () => {
    if (!dt) return
    const d = new Date(dt)
    if (isNaN(d.getTime())) { message.error('无效日期'); return }
    setTs(String(Math.floor(d.getTime() / 1000)))
  }

  const quickOffset = (days) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + days)
    setTs(String(Math.floor(d.getTime() / 1000)))
    setDt(formatDate(d))
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        padding: '14px 18px', background: theme.bg, borderRadius: 16,
        border: `1.5px solid ${theme.border}`,
      }}>
        <span style={{ fontSize: 13, color: theme.primary, fontWeight: 600 }}>⏱ 当前</span>
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: '#262626', minWidth: 110 }}>{now}</span>
        <span style={{ fontSize: 12, color: '#4e5969' }}>{new Date(now * 1000).toLocaleString('zh-CN', { hour12: false })}</span>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copy(String(now))}>复制</Button>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copy(String(now * 1000))}>复制毫秒</Button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
            <Dot color={theme.primary} />时间戳（秒/毫秒）
          </div>
          <Input value={ts} onChange={e => setTs(e.target.value)} placeholder="1719820800"
            style={{ fontFamily: MONO, borderColor: theme.border }} onPressEnter={tsToDate} allowClear />
        </div>
        <Button type="primary" onClick={tsToDate}>→ 转日期</Button>
        <Button onClick={dateToTs}>← 转时间戳</Button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
            <Dot color={theme.primary} />日期时间
          </div>
          <Input value={dt} onChange={e => setDt(e.target.value)} placeholder="2024-07-01 12:00:00"
            style={{ borderColor: theme.border }} onPressEnter={dateToTs} allowClear />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 10 }}>
          <Dot color={theme.primary} />快捷选择
        </div>
        <Space size={8} wrap>
          {[
            { label: '7天前', d: -7 }, { label: '3天前', d: -3 }, { label: '昨天', d: -1 },
            { label: '今天 0:00', d: 0 },
            { label: '明天', d: 1 }, { label: '3天后', d: 3 }, { label: '7天后', d: 7 }, { label: '30天后', d: 30 },
          ].map(q => (
            <Button key={q.label} size="small" onClick={() => {
              if (q.d === 0) {
                const d = new Date(); d.setHours(0,0,0,0)
                setTs(String(Math.floor(d.getTime() / 1000))); setDt(formatDate(d))
              } else quickOffset(q.d)
            }}>{q.label}</Button>
          ))}
        </Space>
      </div>

      <div style={{ fontSize: 11, color: theme.primary, opacity: 0.5 }}>
        支持 10 位（秒）和 13 位（毫秒）时间戳
      </div>
    </div>
  )
}

function formatDate(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ━━━ 正则测试 ━━━
function RegexTool({ theme }) {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiExplanation, setAiExplanation] = useState('')

  const { highlighted, matchCount, groups, regexError } = useMemo(() => {
    if (!pattern) return { highlighted: null, matchCount: 0, groups: [], regexError: null }
    try { new RegExp(pattern, flags) } catch (e) {
      return { highlighted: null, matchCount: 0, groups: [], regexError: e.message }
    }
    if (!text) return { highlighted: null, matchCount: 0, groups: [], regexError: null }
    try {
      const tempRe = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
      let count = 0
      const parts = []
      const grps = []
      let lastIndex = 0
      let match
      while ((match = tempRe.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index), matched: false })
        parts.push({ text: match[0], matched: true, index: count })
        if (match.length > 1) grps.push({ index: count, full: match[0], groups: match.slice(1) })
        lastIndex = tempRe.lastIndex
        count++
        if (!match[0].length) { tempRe.lastIndex++; if (tempRe.lastIndex > text.length) break }
      }
      if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), matched: false })
      return { highlighted: parts, matchCount: count, groups: grps, regexError: null }
    } catch (e) { return { highlighted: null, matchCount: 0, groups: [], regexError: e.message } }
  }, [pattern, flags, text])

  const handleAiGenerate = async () => {
    if (!aiInput.trim()) return
    setAiLoading(true)
    setAiExplanation('')
    try {
      const res = await api.post('/toolbox/generate-regex', { description: aiInput.trim() })
      const d = res.data?.data || res.data || res
      if (d.error) { message.error(d.error); return }
      if (d.regex) { setPattern(d.regex); if (d.flags) setFlags(d.flags) }
      if (d.explanation) setAiExplanation(d.explanation)
    } catch (e) { message.error('生成失败') } finally { setAiLoading(false) }
  }

  const COMMON = [
    { label: '手机号', re: '1[3-9]\\d{9}' },
    { label: '邮箱', re: '[\\w.-]+@[\\w.-]+\\.\\w+' },
    { label: 'IP地址', re: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}' },
    { label: 'URL', re: 'https?://[\\w./\\-?=&#%]+' },
    { label: '身份证', re: '\\d{17}[\\dXx]' },
    { label: '日期', re: '\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}' },
    { label: '中文', re: '[\\u4e00-\\u9fa5]+' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 16, color: theme.primary, flexShrink: 0, fontWeight: 300 }}>/</span>
        <Input value={pattern} onChange={e => setPattern(e.target.value)}
          style={{ flex: 1, fontFamily: MONO, borderColor: theme.border }} placeholder="输入正则表达式..." />
        <span style={{ fontSize: 16, color: theme.primary, flexShrink: 0, fontWeight: 300 }}>/</span>
        <Input value={flags} onChange={e => setFlags(e.target.value)}
          style={{ width: 54, fontFamily: MONO, textAlign: 'center', borderColor: theme.border }} placeholder="g" />
        {matchCount > 0 && <Tag color="green" style={{ borderRadius: 12 }}>{matchCount} 个匹配</Tag>}
        {pattern && matchCount === 0 && !regexError && text && <Tag color="orange" style={{ borderRadius: 12 }}>无匹配</Tag>}
        {regexError && <Tag color="red" style={{ borderRadius: 12 }}>语法错误</Tag>}
      </div>
      {regexError && (
        <div style={{ color: '#e53935', fontSize: 12, marginBottom: 10, padding: '6px 12px', background: '#fff5f5', borderRadius: 12, border: '1px solid #ffcdd2' }}>{regexError}</div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Input value={aiInput} onChange={e => setAiInput(e.target.value)}
          placeholder="用自然语言描述，AI 帮你写正则 ~"
          style={{ width: 280, borderColor: theme.border }} size="small"
          onPressEnter={handleAiGenerate}
          suffix={
            <Button type="text" size="small" loading={aiLoading}
              icon={aiLoading ? <LoadingOutlined /> : <ThunderboltOutlined style={{ color: theme.primary }} />}
              onClick={handleAiGenerate} style={{ margin: '-4px -7px' }} />
          }
        />
        <span style={{ fontSize: 11, color: '#d9d9d9' }}>|</span>
        <span style={{ fontSize: 11, color: theme.primary, opacity: 0.6 }}>常用:</span>
        {COMMON.map(c => (
          <Tag key={c.label} style={{ cursor: 'pointer', fontSize: 11, borderRadius: 12, color: theme.primary, borderColor: theme.border }}
            onClick={() => setPattern(c.re)}>{c.label}</Tag>
        ))}
      </div>
      {aiExplanation && (
        <div style={{ fontSize: 12, color: theme.primary, marginBottom: 10, padding: '8px 12px', background: theme.pale, borderRadius: 12, border: `1px solid ${theme.border}` }}>
          {aiExplanation}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
            <Dot color={theme.primary} />测试文本
          </div>
          <TextArea value={text} onChange={e => setText(e.target.value)}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', borderColor: theme.border }}
            placeholder="输入要匹配的文本 ~" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
            <Dot color={theme.primary} />匹配结果
          </div>
          <div style={{
            flex: 1, overflow: 'auto', padding: 14, background: theme.pale, borderRadius: 12,
            border: `1.5px solid ${theme.border}`, fontFamily: MONO, fontSize: 12, lineHeight: 1.8,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {highlighted ? highlighted.map((p, i) => p.matched
              ? <mark key={i} style={{ background: theme.light, padding: '2px 4px', borderRadius: 4, color: theme.primary }}>{p.text}</mark>
              : <span key={i}>{p.text}</span>
            ) : <span style={{ color: '#c9cdd4' }}>{regexError ? '请修正正则语法' : text ? '输入正则后实时匹配' : '等待输入...'}</span>}
          </div>
          {groups.length > 0 && (
            <div style={{ marginTop: 10, maxHeight: 80, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: theme.primary, opacity: 0.7, marginBottom: 4 }}>捕获组</div>
              {groups.map((g, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: MONO, padding: '2px 0' }}>
                  <span style={{ color: theme.primary, opacity: 0.6 }}>#{g.index + 1}</span> {g.groups.map((v, j) => (
                    <Tag key={j} style={{ fontSize: 10, margin: '0 2px', borderRadius: 10, color: theme.primary, borderColor: theme.border }}>${j + 1}: {v}</Tag>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ━━━ 数据生成 ━━━
function DataGenTool({ theme }) {
  const [results, setResults] = useState([])
  const [count, setCount] = useState(10)
  const [activeType, setActiveType] = useState(null)

  const randomPhone = () => {
    const pre = ['130','131','132','133','134','135','136','137','138','139','150','151','152','153','155','156','157','158','159','176','177','178','180','181','182','183','185','186','187','188','189']
    return pre[Math.floor(Math.random() * pre.length)] + String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
  }
  const randomIdCard = () => {
    const area = ['110101','310101','440305','330102','510107','420106','320105','500103','610104','370202']
    const a = area[Math.floor(Math.random() * area.length)]
    const y = 1970 + Math.floor(Math.random() * 40)
    const m = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
    const d = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
    const base = `${a}${y}${m}${d}${seq}`
    const w = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]
    let sum = 0; for (let i = 0; i < 17; i++) sum += parseInt(base[i]) * w[i]
    return base + '10X98765432'[sum % 11]
  }
  const randomEmail = () => {
    const n = ['test','user','dev','qa','mock','zhang','wang','li','zhao','hello','admin']
    const d = ['example.com','test.com','mock.org','gmail.com','qq.com','163.com']
    return `${n[Math.floor(Math.random() * n.length)]}${Math.floor(Math.random() * 9999)}@${d[Math.floor(Math.random() * d.length)]}`
  }
  const randomName = () => {
    const f = ['张','王','李','赵','刘','陈','杨','黄','周','吴','徐','孙','马','朱','胡','林','郭','何','高','罗']
    const s = ['伟','芳','秀英','敏','静','丽','强','磊','洋','勇','艳','杰','娟','涛','明','超','霞','平','刚','建国','小红','志强']
    return f[Math.floor(Math.random() * f.length)] + s[Math.floor(Math.random() * s.length)]
  }
  const randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
  const randomAddr = () => {
    const city = ['北京市朝阳区','上海市浦东新区','广州市天河区','深圳市南山区','杭州市西湖区','成都市武侯区','武汉市江汉区','南京市鼓楼区']
    const road = ['长安街','南京路','中山路','人民路','建设路','解放路','光华大道','科技路']
    return `${city[Math.floor(Math.random() * city.length)]}${road[Math.floor(Math.random() * road.length)]}${Math.floor(Math.random() * 999) + 1}号`
  }
  const randomMixed = () => `${randomName()}\t${randomPhone()}\t${randomEmail()}\t${randomIdCard()}`

  const generators = [
    { key: 'phone', label: '手机号', fn: randomPhone },
    { key: 'idcard', label: '身份证', fn: randomIdCard },
    { key: 'email', label: '邮箱', fn: randomEmail },
    { key: 'name', label: '姓名', fn: randomName },
    { key: 'uuid', label: 'UUID', fn: randomUUID },
    { key: 'addr', label: '地址', fn: randomAddr },
    { key: 'mixed', label: '综合（姓名+手机+邮箱+身份证）', fn: randomMixed },
  ]

  const generate = (g) => {
    setActiveType(g.key)
    setResults(Array.from({ length: count }, () => g.fn()))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: theme.primary, fontWeight: 600 }}>
          <Dot color={theme.primary} />数量
        </span>
        <InputNumber value={count} onChange={v => v != null && setCount(Math.max(1, Math.min(200, v)))}
          min={1} max={200} size="small" style={{ width: 65 }} />
        {generators.map(g => (
          <Button key={g.key} size="small" type={activeType === g.key ? 'primary' : 'default'}
            onClick={() => generate(g)}>{g.label}</Button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {results.length > 0 && <>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copy(results.join('\n'))}>复制全部</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => {
            const g = generators.find(x => x.key === activeType)
            if (g) setResults(Array.from({ length: count }, () => g.fn()))
          }}>重新生成</Button>
        </>}
      </div>
      <div style={{ flex: 1, overflow: 'auto', borderRadius: 14 }}>
        {results.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 14px', background: i % 2 === 0 ? theme.pale : 'rgba(255,255,255,0.6)',
                borderRadius: 10,
              }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: '#262626', whiteSpace: 'pre' }}>{r}</span>
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(r)}
                  style={{ flexShrink: 0, color: theme.primary, opacity: 0.6 }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 50, color: theme.primary, opacity: 0.4, fontSize: 13 }}>
            选择数据类型开始生成 ✨
          </div>
        )}
      </div>
    </div>
  )
}

// ━━━ 文本对比（LCS diff）━━━
function DiffTool({ theme }) {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [diffResult, setDiffResult] = useState(null)

  const handleDiff = () => {
    const a = left.split('\n'), b = right.split('\n')
    const lcs = computeLCS(a, b)
    const result = []
    let ai = 0, bi = 0
    for (const [la, lb] of lcs) {
      while (ai < la) result.push({ type: 'removed', left: a[ai++], right: '' })
      while (bi < lb) result.push({ type: 'added', left: '', right: b[bi++] })
      result.push({ type: 'same', left: a[ai], right: b[bi] })
      ai++; bi++
    }
    while (ai < a.length) result.push({ type: 'removed', left: a[ai++], right: '' })
    while (bi < b.length) result.push({ type: 'added', left: '', right: b[bi++] })
    setDiffResult(result)
  }

  const diffCount = diffResult ? diffResult.filter(r => r.type !== 'same').length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Button type="primary" size="small" onClick={handleDiff} disabled={!left && !right}>对比</Button>
        {diffResult && <Button size="small" onClick={() => setDiffResult(null)}>返回编辑</Button>}
        <Button size="small" onClick={() => { setLeft(''); setRight(''); setDiffResult(null) }}>清空</Button>
        {diffResult && (
          <span style={{ fontSize: 12, color: theme.primary, opacity: 0.7 }}>
            {diffResult.length} 行，
            {diffCount > 0
              ? <span style={{ color: '#e53935' }}>{diffCount} 处差异</span>
              : <span style={{ color: '#43a047' }}>完全一致 ✓</span>}
          </span>
        )}
      </div>
      {!diffResult ? (
        <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
              <Dot color={theme.primary} />文本 A
            </div>
            <TextArea value={left} onChange={e => setLeft(e.target.value)}
              style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', borderColor: theme.border }}
              placeholder="粘贴文本 A ~" />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600, marginBottom: 6 }}>
              <Dot color={theme.primary} />文本 B
            </div>
            <TextArea value={right} onChange={e => setRight(e.target.value)}
              style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', borderColor: theme.border }}
              placeholder="粘贴文本 B ~" />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', border: `1.5px solid ${theme.border}`, borderRadius: 14 }}>
          {diffResult.map((r, i) => {
            const bg = r.type === 'removed' ? 'rgba(255,205,210,0.4)' : r.type === 'added' ? 'rgba(200,230,201,0.5)' : 'transparent'
            const sign = r.type === 'removed' ? '−' : r.type === 'added' ? '+' : ' '
            const signColor = r.type === 'removed' ? '#e53935' : r.type === 'added' ? '#43a047' : '#d9d9d9'
            const content = r.type === 'removed' ? r.left : r.type === 'added' ? r.right : r.left
            return (
              <div key={i} style={{
                display: 'flex', fontFamily: MONO, fontSize: 12, lineHeight: 1.7,
                background: bg, borderBottom: '1px solid rgba(0,0,0,0.03)', minHeight: 22,
              }}>
                <span style={{ width: 35, textAlign: 'right', padding: '0 6px', color: '#c9cdd4', fontSize: 10, flexShrink: 0, lineHeight: '22px' }}>{i + 1}</span>
                <span style={{ width: 18, textAlign: 'center', color: signColor, fontWeight: 600, flexShrink: 0, lineHeight: '22px' }}>{sign}</span>
                <span style={{ padding: '0 8px', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{content}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function computeLCS(a, b) {
  const m = a.length, n = b.length
  if (m > 5000 || n > 5000) {
    const result = []
    let i = 0, j = 0
    while (i < m && j < n) {
      if (a[i] === b[j]) { result.push([i, j]); i++; j++ }
      else {
        let fi = -1, fj = -1
        for (let k = 1; k <= 3 && i + k < m; k++) { if (a[i + k] === b[j]) { fi = k; break } }
        for (let k = 1; k <= 3 && j + k < n; k++) { if (a[i] === b[j + k]) { fj = k; break } }
        if (fi >= 0 && (fj < 0 || fi <= fj)) i += fi
        else if (fj >= 0) j += fj
        else { i++; j++ }
      }
    }
    return result
  }
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  const result = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) { result.unshift([i-1, j-1]); i--; j-- }
    else if (dp[i-1][j] > dp[i][j-1]) i--
    else j--
  }
  return result
}

// ━━━ 主页面 ━━━
const TOOL_MAP = { json: JsonTool, codec: CodecTool, timestamp: TimestampTool, regex: RegexTool, datagen: DataGenTool, diff: DiffTool }

export default function Toolbox() {
  const [activeTool, setActiveTool] = useState('json')
  const theme = THEMES[activeTool]
  const ActiveComponent = TOOL_MAP[activeTool]

  const gradient = `linear-gradient(135deg, ${theme.light} 0%, #f0ecfb 50%, #edf5f0 100%)`

  return (
    <div className="toolbox-page" style={{
      '--tb-primary': theme.primary,
      '--tb-light': theme.light,
      '--tb-bg': theme.bg,
      '--tb-pale': theme.pale,
      '--tb-border': theme.border,
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 70px)',
      background: gradient,
      transition: 'background 0.5s ease',
    }}>
      <style>{TOOLBOX_CSS}</style>

      <div style={{
        padding: '12px 24px',
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.6)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 11,
          background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}bb)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 3px 10px ${theme.primary}33`,
          transition: 'all 0.3s ease',
        }}>
          <ToolOutlined style={{ fontSize: 17, color: '#fff' }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#1d2129', lineHeight: 1.3 }}>工具箱</div>
          <div style={{ fontSize: 11.5, color: '#86909c', lineHeight: 1.2 }}>开发者的随身百宝箱</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 10, gap: 10 }}>
        <div style={{
          width: 200, flexShrink: 0,
          background: 'rgba(255,255,255,0.65)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 16,
          overflow: 'auto',
          padding: '14px 8px 8px',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <div style={{ flex: 1 }}>
            {TOOLS.map(t => {
              const tt = THEMES[t.key]
              const active = activeTool === t.key
              return (
                <div key={t.key} className="tb-nav-item" onClick={() => setActiveTool(t.key)} style={{
                  padding: '10px 12px', borderRadius: 12, marginBottom: 4,
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: active ? tt.bg : 'transparent',
                  borderLeft: active ? `4px solid ${tt.primary}` : '4px solid transparent',
                  boxShadow: active ? `0 2px 8px ${tt.primary}15` : 'none',
                }}>
                  <span style={{
                    fontSize: 18, color: active ? tt.primary : '#86909c',
                    transition: 'color 0.25s',
                  }}>{t.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: active ? 600 : 400,
                      color: active ? tt.primary : '#4e5969',
                      transition: 'all 0.25s', lineHeight: 1.3,
                    }}>{t.label}</div>
                    <div style={{
                      fontSize: 10.5, color: active ? `${tt.primary}99` : '#c9cdd4',
                      transition: 'color 0.25s', lineHeight: 1.4,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{t.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#c9cdd4', padding: '10px 0', letterSpacing: 3 }}>
            ✿ 宁静致远
          </div>
        </div>

        <div style={{
          flex: 1, minWidth: 0, overflow: 'hidden',
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <div key={activeTool} className="tb-content-fade" style={{ height: '100%' }}>
            <ActiveComponent theme={theme} />
          </div>
        </div>
      </div>
    </div>
  )
}
