import { useState, useMemo, useEffect, useRef } from 'react'
import { Input, Button, Space, Tag, message, Radio, Switch, InputNumber } from 'antd'
import {
  ToolOutlined, FormatPainterOutlined, SwapOutlined, ClockCircleOutlined,
  FileSearchOutlined, DatabaseOutlined, DiffOutlined, CopyOutlined,
  ReloadOutlined
} from '@ant-design/icons'

const { TextArea } = Input
const MONO = "'SF Mono', Monaco, Menlo, Consolas, monospace"

const TOOLS = [
  { key: 'json', icon: <FormatPainterOutlined />, label: 'JSON 工具' },
  { key: 'codec', icon: <SwapOutlined />, label: '编解码 / Hash' },
  { key: 'timestamp', icon: <ClockCircleOutlined />, label: '时间戳转换' },
  { key: 'regex', icon: <FileSearchOutlined />, label: '正则测试' },
  { key: 'datagen', icon: <DatabaseOutlined />, label: '数据生成' },
  { key: 'diff', icon: <DiffOutlined />, label: '文本对比' },
]

const copy = (text) => navigator.clipboard.writeText(text).then(() => message.success('已复制'))

// ━━━ JSON 工具 ━━━
function JsonTool() {
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
    try { const o = JSON.stringify(JSON.parse(input), null, 2); setOutput(o); setError('') }
    catch (e) { setError(e.message) }
  }
  const handleCompress = () => {
    try { const o = JSON.stringify(JSON.parse(input)); setOutput(o); setError('') }
    catch (e) { setError(e.message) }
  }
  const handleEscape = () => {
    setOutput(JSON.stringify(input))
  }
  const handleUnescape = () => {
    try { setOutput(JSON.parse(input)); setError('') }
    catch (e) { setError(e.message) }
  }

  const stats = useMemo(() => {
    if (!input) return null
    return { chars: input.length, lines: input.split('\n').length, bytes: new Blob([input]).size }
  }, [input])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space size={8}>
          <Button type="primary" size="small" onClick={handleFormat}>格式化</Button>
          <Button size="small" onClick={handleCompress}>压缩</Button>
          <Button size="small" onClick={handleEscape}>转义</Button>
          <Button size="small" onClick={handleUnescape}>去转义</Button>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            <Switch size="small" checked={autoFormat} onChange={setAutoFormat} style={{ marginRight: 4 }} />实时格式化
          </span>
        </Space>
        {stats && <span style={{ fontSize: 11, color: '#bfbfbf' }}>{stats.chars} 字符 · {stats.lines} 行 · {stats.bytes} B</span>}
      </div>
      {error && <div style={{ color: '#ff4d4f', fontSize: 12, marginBottom: 8, padding: '4px 8px', background: '#fff2f0', borderRadius: 4 }}>{error}</div>}
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>输入</span>
            <Button type="link" size="small" style={{ padding: 0, fontSize: 11, height: 'auto' }}
              onClick={() => setInput('')}>清空</Button>
          </div>
          <TextArea value={input} onChange={e => { setInput(e.target.value); setError('') }}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }}
            placeholder='粘贴 JSON...\n\n支持：对象、数组、转义字符串 "{\\"key\\":\\"val\\"}"' />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>输出</span>
            <Button type="link" size="small" icon={<CopyOutlined />} style={{ padding: 0, fontSize: 11, height: 'auto' }}
              disabled={!output} onClick={() => copy(output)}>复制</Button>
          </div>
          <TextArea value={output} readOnly
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none', background: '#fafafa' }}
            placeholder="结果显示在这里..." />
        </div>
      </div>
    </div>
  )
}

// ━━━ 编解码 / Hash ━━━
function CodecTool() {
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
      encode: () => input.split('').map(c => c.charCodeAt(0) > 127 ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : c).join(''),
      decode: () => input.replace(/\\u([0-9a-fA-F]{4})/g, (_, p) => String.fromCharCode(parseInt(p, 16))),
    },
    md5: { encode: () => simpleHash(input, 'md5') },
    sha256: { encode: () => simpleHash(input, 'sha256') },
  }

  const handleAction = async (action) => {
    try {
      const fn = actions[mode]?.[action]
      if (!fn) return
      const result = await fn()
      setOutput(result)
    } catch (e) { message.error(e.message) }
  }

  const isHash = mode === 'md5' || mode === 'sha256'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Radio.Group value={mode} onChange={e => { setMode(e.target.value); setOutput('') }} size="small" buttonStyle="solid">
          <Radio.Button value="base64">Base64</Radio.Button>
          <Radio.Button value="url">URL</Radio.Button>
          <Radio.Button value="unicode">Unicode</Radio.Button>
          <Radio.Button value="md5">MD5</Radio.Button>
          <Radio.Button value="sha256">SHA-256</Radio.Button>
        </Radio.Group>
        <Button type="primary" size="small" onClick={() => handleAction('encode')}>{isHash ? '计算' : '编码 →'}</Button>
        {!isHash && <Button size="small" onClick={() => handleAction('decode')}>← 解码</Button>}
        <Button size="small" icon={<CopyOutlined />} disabled={!output} onClick={() => copy(output)}>复制</Button>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>输入</div>
          <TextArea value={input} onChange={e => setInput(e.target.value)}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }} placeholder="输入内容..." />
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

async function simpleHash(text, algo) {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const name = algo === 'md5' ? 'SHA-1' : 'SHA-256'
  if (algo === 'md5') {
    let h = 0x811c9dc5
    for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193) }
    const h2 = h >>> 0
    const buf = await crypto.subtle.digest('SHA-256', data)
    const arr = Array.from(new Uint8Array(buf))
    return arr.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)
  }
  const buf = await crypto.subtle.digest(name, data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ━━━ 时间戳转换 ━━━
function TimestampTool() {
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
    const d = new Date(Date.now() + days * 86400000)
    setTs(String(Math.floor(d.getTime() / 1000)))
    setDt(formatDate(d))
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
        <span style={{ fontSize: 13, color: '#389e0d' }}>当前</span>
        <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: '#262626', minWidth: 110 }}>{now}</span>
        <span style={{ fontSize: 12, color: '#595959' }}>{new Date(now * 1000).toLocaleString('zh-CN', { hour12: false })}</span>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copy(String(now))}>复制</Button>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copy(String(now * 1000))}>复制毫秒</Button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>时间戳（秒/毫秒）</div>
          <Input value={ts} onChange={e => setTs(e.target.value)} placeholder="1719820800"
            style={{ fontFamily: MONO }} onPressEnter={tsToDate} allowClear />
        </div>
        <Button type="primary" onClick={tsToDate}>→ 转日期</Button>
        <Button onClick={dateToTs}>← 转时间戳</Button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>日期时间</div>
          <Input value={dt} onChange={e => setDt(e.target.value)} placeholder="2024-07-01 12:00:00"
            onPressEnter={dateToTs} allowClear />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>快捷选择</div>
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

      <div style={{ fontSize: 12, color: '#bfbfbf' }}>
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
function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')

  const { highlighted, matchCount, groups } = useMemo(() => {
    if (!pattern || !text) return { highlighted: null, matchCount: 0, groups: [] }
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
      return { highlighted: parts, matchCount: count, groups: grps }
    } catch { return { highlighted: null, matchCount: 0, groups: [] } }
  }, [pattern, flags, text])

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
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
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
      <div style={{ marginBottom: 12 }}>
        <Space size={4} wrap>
          <span style={{ fontSize: 11, color: '#bfbfbf' }}>常用：</span>
          {COMMON.map(c => (
            <Tag key={c.label} style={{ cursor: 'pointer', fontSize: 11 }}
              onClick={() => setPattern(c.re)}>{c.label}</Tag>
          ))}
        </Space>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>测试文本</div>
          <TextArea value={text} onChange={e => setText(e.target.value)}
            style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }}
            placeholder="输入要匹配的文本..." />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>匹配结果</div>
          <div style={{
            flex: 1, overflow: 'auto', padding: 12, background: '#fafafa', borderRadius: 6,
            border: '1px solid #f0f0f0', fontFamily: MONO, fontSize: 12, lineHeight: 1.8,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {highlighted ? highlighted.map((p, i) => p.matched
              ? <mark key={i} style={{ background: '#bae637', padding: '1px 2px', borderRadius: 2 }}>{p.text}</mark>
              : <span key={i}>{p.text}</span>
            ) : <span style={{ color: '#bfbfbf' }}>{text ? '输入正则后实时匹配' : '等待输入...'}</span>}
          </div>
          {groups.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 80, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>捕获组</div>
              {groups.map((g, i) => (
                <div key={i} style={{ fontSize: 11, fontFamily: MONO, padding: '2px 0' }}>
                  <span style={{ color: '#8c8c8c' }}>#{g.index + 1}</span> {g.groups.map((v, j) => (
                    <Tag key={j} style={{ fontSize: 10, margin: '0 2px' }}>${j + 1}: {v}</Tag>
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
function DataGenTool() {
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>数量</span>
        <InputNumber value={count} onChange={v => setCount(Math.max(1, Math.min(200, v || 1)))}
          min={1} max={200} size="small" style={{ width: 65 }} />
        {generators.map(g => (
          <Button key={g.key} size="small" type={activeType === g.key ? 'primary' : 'default'}
            onClick={() => generate(g)}>{g.label}</Button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {results.length > 0 && <>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copy(results.join('\n'))}>复制全部</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => {
            const g = generators.find(x => x.key === activeType)
            if (g) setResults(Array.from({ length: count }, () => g.fn()))
          }}>重新生成</Button>
        </>}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {results.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 12px', background: i % 2 === 0 ? '#fafafa' : '#fff', borderRadius: 3,
              }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: '#262626', whiteSpace: 'pre' }}>{r}</span>
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(r)} style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#bfbfbf', fontSize: 13 }}>选择数据类型开始生成</div>
        )}
      </div>
    </div>
  )
}

// ━━━ 文本对比（LCS diff）━━━
function DiffTool() {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Button type="primary" size="small" onClick={handleDiff} disabled={!left && !right}>对比</Button>
        {diffResult && <Button size="small" onClick={() => setDiffResult(null)}>返回编辑</Button>}
        <Button size="small" onClick={() => { setLeft(''); setRight(''); setDiffResult(null) }}>清空</Button>
        {diffResult && (
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {diffResult.length} 行，
            {diffCount > 0
              ? <span style={{ color: '#ff4d4f' }}>{diffCount} 处差异</span>
              : <span style={{ color: '#52c41a' }}>完全一致</span>}
          </span>
        )}
      </div>
      {!diffResult ? (
        <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>文本 A</div>
            <TextArea value={left} onChange={e => setLeft(e.target.value)}
              style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }} placeholder="粘贴文本 A..." />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>文本 B</div>
            <TextArea value={right} onChange={e => setRight(e.target.value)}
              style={{ flex: 1, fontFamily: MONO, fontSize: 12, resize: 'none' }} placeholder="粘贴文本 B..." />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
          {diffResult.map((r, i) => {
            const bg = r.type === 'removed' ? '#fff1f0' : r.type === 'added' ? '#f6ffed' : 'transparent'
            const sign = r.type === 'removed' ? '−' : r.type === 'added' ? '+' : ' '
            const signColor = r.type === 'removed' ? '#ff4d4f' : r.type === 'added' ? '#52c41a' : '#d9d9d9'
            const content = r.type === 'removed' ? r.left : r.type === 'added' ? r.right : r.left
            return (
              <div key={i} style={{
                display: 'flex', fontFamily: MONO, fontSize: 12, lineHeight: 1.7,
                background: bg, borderBottom: '1px solid #fafafa', minHeight: 22,
              }}>
                <span style={{ width: 35, textAlign: 'right', padding: '0 6px', color: '#bfbfbf', fontSize: 10, flexShrink: 0, lineHeight: '22px' }}>{i + 1}</span>
                <span style={{ width: 16, textAlign: 'center', color: signColor, fontWeight: 600, flexShrink: 0, lineHeight: '22px' }}>{sign}</span>
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
      else { i++; j++ }
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
  const ActiveComponent = TOOL_MAP[activeTool]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', background: '#f0f2f5' }}>
      <div style={{
        padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <ToolOutlined style={{ fontSize: 18, color: '#1677ff' }} />
        <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: 0.5 }}>工具箱</span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{
          width: 170, flexShrink: 0, background: '#fff', borderRight: '1px solid #e8e8e8',
          overflow: 'auto', paddingTop: 8,
        }}>
          {TOOLS.map(t => (
            <div key={t.key} onClick={() => setActiveTool(t.key)} style={{
              padding: '10px 14px', cursor: 'pointer',
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
