import { useState, useMemo } from 'react'
import { Input, Button, Space, Tag, message, Radio, Tooltip } from 'antd'
import {
  ToolOutlined, FormatPainterOutlined, SwapOutlined, ClockCircleOutlined,
  FileSearchOutlined, DatabaseOutlined, DiffOutlined, CopyOutlined
} from '@ant-design/icons'

const { TextArea } = Input
const MONO = "'SF Mono', Monaco, Menlo, Consolas, monospace"

const TOOLS = [
  { key: 'json', icon: <FormatPainterOutlined />, label: 'JSON 工具' },
  { key: 'codec', icon: <SwapOutlined />, label: '编解码' },
  { key: 'timestamp', icon: <ClockCircleOutlined />, label: '时间戳转换' },
  { key: 'regex', icon: <FileSearchOutlined />, label: '正则测试' },
  { key: 'datagen', icon: <DatabaseOutlined />, label: '数据生成' },
  { key: 'diff', icon: <DiffOutlined />, label: '文本对比' },
]

const copyText = (text) => {
  navigator.clipboard.writeText(text).then(() => message.success('已复制'))
}

// ━━━ JSON 工具 ━━━
function JsonTool() {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const handleFormat = () => {
    try { setInput(JSON.stringify(JSON.parse(input), null, 2)); setError('') }
    catch (e) { setError(e.message) }
  }
  const handleCompress = () => {
    try { setInput(JSON.stringify(JSON.parse(input))); setError('') }
    catch (e) { setError(e.message) }
  }
  const handleValidate = () => {
    try { JSON.parse(input); setError(''); message.success('JSON 格式正确') }
    catch (e) { setError(e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" size="small" onClick={handleFormat}>格式化</Button>
        <Button size="small" onClick={handleCompress}>压缩</Button>
        <Button size="small" onClick={handleValidate}>校验</Button>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(input)}>复制</Button>
      </Space>
      {error && <div style={{ color: '#ff4d4f', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <TextArea value={input} onChange={e => { setInput(e.target.value); setError('') }}
        style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }}
        placeholder='粘贴 JSON 内容...' />
    </div>
  )
}

// ━━━ 编解码 ━━━
function CodecTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [mode, setMode] = useState('base64')

  const handleEncode = () => {
    try {
      if (mode === 'base64') setOutput(btoa(unescape(encodeURIComponent(input))))
      else setOutput(encodeURIComponent(input))
    } catch (e) { message.error(e.message) }
  }
  const handleDecode = () => {
    try {
      if (mode === 'base64') setOutput(decodeURIComponent(escape(atob(input))))
      else setOutput(decodeURIComponent(input))
    } catch (e) { message.error(e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Radio.Group value={mode} onChange={e => setMode(e.target.value)} size="small" buttonStyle="solid">
          <Radio.Button value="base64">Base64</Radio.Button>
          <Radio.Button value="url">URL</Radio.Button>
        </Radio.Group>
        <Button type="primary" size="small" onClick={handleEncode}>编码 →</Button>
        <Button size="small" onClick={handleDecode}>← 解码</Button>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(output)}>复制结果</Button>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>输入</div>
          <TextArea value={input} onChange={e => setInput(e.target.value)}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }} placeholder="输入要编解码的内容..." />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>输出</div>
          <TextArea value={output} readOnly
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', background: '#fafafa' }} />
        </div>
      </div>
    </div>
  )
}

// ━━━ 时间戳转换 ━━━
function TimestampTool() {
  const [ts, setTs] = useState('')
  const [dt, setDt] = useState('')
  const now = Math.floor(Date.now() / 1000)

  const tsToDate = () => {
    if (!ts) return
    const n = Number(ts)
    const d = ts.length > 10 ? new Date(n) : new Date(n * 1000)
    if (isNaN(d.getTime())) { message.error('无效时间戳'); return }
    setDt(d.toLocaleString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'))
  }
  const dateToTs = () => {
    if (!dt) return
    const d = new Date(dt)
    if (isNaN(d.getTime())) { message.error('无效日期'); return }
    setTs(String(Math.floor(d.getTime() / 1000)))
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
        <span style={{ fontSize: 13, color: '#389e0d' }}>当前时间戳</span>
        <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, color: '#262626' }}>{now}</span>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>{new Date().toLocaleString('zh-CN', { hour12: false })}</span>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(String(now))}>复制</Button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>时间戳（秒/毫秒）</div>
          <Input value={ts} onChange={e => setTs(e.target.value)} placeholder="1719820800"
            style={{ fontFamily: MONO }} onPressEnter={tsToDate} />
        </div>
        <Button type="primary" onClick={tsToDate}>→ 转日期</Button>
        <Button onClick={dateToTs}>← 转时间戳</Button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>日期时间</div>
          <Input value={dt} onChange={e => setDt(e.target.value)} placeholder="2024-07-01 12:00:00"
            onPressEnter={dateToTs} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#bfbfbf' }}>
        支持 10 位（秒）和 13 位（毫秒）时间戳，日期格式支持常见写法
      </div>
    </div>
  )
}

// ━━━ 正则测试 ━━━
function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')

  const { highlighted, matchCount } = useMemo(() => {
    if (!pattern || !text) return { highlighted: null, matchCount: 0 }
    try {
      const re = new RegExp(pattern, flags)
      let count = 0
      const parts = []
      let lastIndex = 0
      let match
      const tempRe = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
      while ((match = tempRe.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index), matched: false })
        parts.push({ text: match[0], matched: true })
        lastIndex = tempRe.lastIndex
        count++
        if (!match[0].length) { tempRe.lastIndex++; if (tempRe.lastIndex > text.length) break }
      }
      if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), matched: false })
      return { highlighted: parts, matchCount: count }
    } catch { return { highlighted: null, matchCount: 0 } }
  }, [pattern, flags, text])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <Input value={pattern} onChange={e => setPattern(e.target.value)}
            addonBefore="/" addonAfter={
              <Input value={flags} onChange={e => setFlags(e.target.value)}
                style={{ width: 40, border: 'none', padding: 0, textAlign: 'center' }} />
            }
            style={{ fontFamily: MONO }} placeholder="输入正则表达式..." />
        </div>
        {matchCount > 0 && <Tag color="green">{matchCount} 个匹配</Tag>}
        {pattern && matchCount === 0 && text && <Tag color="orange">无匹配</Tag>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>测试文本</div>
        <TextArea value={text} onChange={e => setText(e.target.value)}
          style={{ flex: highlighted ? 0 : 1, minHeight: 100, fontFamily: MONO, fontSize: 12, resize: 'none', marginBottom: highlighted ? 12 : 0 }}
          placeholder="输入要匹配的文本..." />
        {highlighted && (
          <div style={{
            flex: 1, overflow: 'auto', padding: 12, background: '#fafafa', borderRadius: 6,
            border: '1px solid #f0f0f0', fontFamily: MONO, fontSize: 12, lineHeight: 1.8,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {highlighted.map((p, i) => p.matched
              ? <mark key={i} style={{ background: '#bae637', padding: '1px 2px', borderRadius: 2 }}>{p.text}</mark>
              : <span key={i}>{p.text}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ━━━ 数据生成 ━━━
function DataGenTool() {
  const [results, setResults] = useState([])
  const [count, setCount] = useState(5)

  const randomPhone = () => {
    const prefixes = ['130','131','132','133','134','135','136','137','138','139','150','151','152','153','155','156','157','158','159','170','176','177','178','180','181','182','183','184','185','186','187','188','189']
    return prefixes[Math.floor(Math.random() * prefixes.length)] + String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
  }
  const randomIdCard = () => {
    const area = ['110101','310101','440305','330102','510107','420106','320105','500103','610104','370202']
    const a = area[Math.floor(Math.random() * area.length)]
    const y = 1970 + Math.floor(Math.random() * 40)
    const m = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
    const d = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')
    const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
    const base = `${a}${y}${m}${d}${seq}`
    const weights = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]
    const checks = '10X98765432'
    let sum = 0
    for (let i = 0; i < 17; i++) sum += parseInt(base[i]) * weights[i]
    return base + checks[sum % 11]
  }
  const randomEmail = () => {
    const names = ['test','user','admin','dev','qa','mock','hello','zhang','wang','li','zhao']
    const domains = ['example.com','test.com','mock.org','demo.cn','mail.com']
    return `${names[Math.floor(Math.random() * names.length)]}${Math.floor(Math.random() * 9999)}@${domains[Math.floor(Math.random() * domains.length)]}`
  }
  const randomName = () => {
    const first = ['张','王','李','赵','刘','陈','杨','黄','周','吴','徐','孙','马','朱','胡','林','郭','何','高']
    const second = ['伟','芳','秀英','敏','静','丽','强','磊','洋','勇','艳','杰','娟','涛','明','超','秀兰','霞','平','刚','桂英']
    return first[Math.floor(Math.random() * first.length)] + second[Math.floor(Math.random() * second.length)]
  }
  const randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  }

  const generators = [
    { key: 'phone', label: '手机号', fn: randomPhone },
    { key: 'idcard', label: '身份证', fn: randomIdCard },
    { key: 'email', label: '邮箱', fn: randomEmail },
    { key: 'name', label: '姓名', fn: randomName },
    { key: 'uuid', label: 'UUID', fn: randomUUID },
  ]

  const generate = (fn) => {
    const items = Array.from({ length: count }, () => fn())
    setResults(items)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>生成数量</span>
        <Input type="number" value={count} onChange={e => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
          style={{ width: 70 }} size="small" />
        {generators.map(g => (
          <Button key={g.key} size="small" onClick={() => generate(g.fn)}>{g.label}</Button>
        ))}
        {results.length > 0 && (
          <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(results.join('\n'))}>全部复制</Button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {results.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 12px', background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0',
              }}>
                <span style={{ fontFamily: MONO, fontSize: 13, color: '#262626' }}>{r}</span>
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(r)} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#bfbfbf', fontSize: 13 }}>点击上方按钮生成测试数据</div>
        )}
      </div>
    </div>
  )
}

// ━━━ 文本对比 ━━━
function DiffTool() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [diffResult, setDiffResult] = useState(null)

  const handleDiff = () => {
    const lLines = left.split('\n')
    const rLines = right.split('\n')
    const maxLen = Math.max(lLines.length, rLines.length)
    const result = []
    for (let i = 0; i < maxLen; i++) {
      const l = lLines[i] ?? ''
      const r = rLines[i] ?? ''
      if (l === r) result.push({ type: 'same', left: l, right: r })
      else result.push({ type: 'diff', left: l, right: r })
    }
    setDiffResult(result)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" size="small" onClick={handleDiff}>对比</Button>
        <Button size="small" style={{ marginLeft: 8 }} onClick={() => { setLeft(''); setRight(''); setDiffResult(null) }}>清空</Button>
        {diffResult && (
          <span style={{ marginLeft: 12, fontSize: 12, color: '#8c8c8c' }}>
            共 {diffResult.length} 行，
            <span style={{ color: '#ff4d4f' }}>{diffResult.filter(r => r.type === 'diff').length} 处差异</span>
          </span>
        )}
      </div>
      {!diffResult ? (
        <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>文本 A</div>
            <TextArea value={left} onChange={e => setLeft(e.target.value)}
              style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }} placeholder="粘贴第一段文本..." />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>文本 B</div>
            <TextArea value={right} onChange={e => setRight(e.target.value)}
              style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }} placeholder="粘贴第二段文本..." />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1, borderRight: '1px solid #f0f0f0' }}>
              <div style={{ padding: '4px 12px', background: '#fafafa', fontSize: 11, color: '#8c8c8c', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>文本 A</div>
              {diffResult.map((r, i) => (
                <div key={i} style={{
                  padding: '2px 12px', fontFamily: MONO, fontSize: 12, lineHeight: 1.8,
                  background: r.type === 'diff' ? '#fff1f0' : 'transparent',
                  borderBottom: '1px solid #fafafa', minHeight: 24,
                }}>
                  <span style={{ color: '#bfbfbf', fontSize: 10, marginRight: 8, display: 'inline-block', width: 24, textAlign: 'right' }}>{i + 1}</span>
                  {r.left}
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ padding: '4px 12px', background: '#fafafa', fontSize: 11, color: '#8c8c8c', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>文本 B</div>
              {diffResult.map((r, i) => (
                <div key={i} style={{
                  padding: '2px 12px', fontFamily: MONO, fontSize: 12, lineHeight: 1.8,
                  background: r.type === 'diff' ? '#f6ffed' : 'transparent',
                  borderBottom: '1px solid #fafafa', minHeight: 24,
                }}>
                  <span style={{ color: '#bfbfbf', fontSize: 10, marginRight: 8, display: 'inline-block', width: 24, textAlign: 'right' }}>{i + 1}</span>
                  {r.right}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ━━━ 主页面 ━━━
const TOOL_MAP = {
  json: JsonTool,
  codec: CodecTool,
  timestamp: TimestampTool,
  regex: RegexTool,
  datagen: DataGenTool,
  diff: DiffTool,
}

export default function Toolbox() {
  const [activeTool, setActiveTool] = useState('json')
  const ActiveComponent = TOOL_MAP[activeTool]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', background: '#f0f2f5' }}>
      <div style={{
        padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <ToolOutlined style={{ fontSize: 18, color: '#1677ff' }} />
        <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: 0.5 }}>工具箱</span>
        <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>测试常用工具集合</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{
          width: 180, flexShrink: 0, background: '#fff', borderRight: '1px solid #e8e8e8',
          overflow: 'auto', paddingTop: 8,
        }}>
          {TOOLS.map(t => (
            <div key={t.key} onClick={() => setActiveTool(t.key)} style={{
              padding: '10px 16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              background: activeTool === t.key ? '#e6f4ff' : 'transparent',
              borderLeft: activeTool === t.key ? '3px solid #1677ff' : '3px solid transparent',
              color: activeTool === t.key ? '#1677ff' : '#595959',
              fontWeight: activeTool === t.key ? 600 : 400,
              fontSize: 13,
            }}>
              {t.icon}
              {t.label}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, background: '#fff', minWidth: 0, overflow: 'hidden' }}>
          <ActiveComponent />
        </div>
      </div>
    </div>
  )
}
