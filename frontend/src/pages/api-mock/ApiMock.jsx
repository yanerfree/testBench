import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react'
import {
  Button, Space, Input, Select, Tag, Radio, Popconfirm, Tooltip, Badge, Pagination,
  Empty, Typography, InputNumber, Switch, message, Drawer, Alert, Modal
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, SaveOutlined, PlayCircleOutlined, PauseCircleOutlined,
  ReloadOutlined, ExportOutlined, ClearOutlined, CopyOutlined, CloudServerOutlined,
  LockOutlined, SettingOutlined, CheckOutlined,
  SendOutlined, StarOutlined
} from '@ant-design/icons'
import { api } from '../../utils/request'
import { copyToClipboard } from '../../utils/clipboard'

const { Text } = Typography
const { TextArea } = Input

const MONO = "'SF Mono', Monaco, Menlo, Consolas, monospace"

const STATUS_COLOR = (sc) => {
  if (sc >= 500) return '#e8453c'
  if (sc >= 400) return '#fa8c16'
  if (sc >= 300) return '#7c5cbf'
  return '#0ea5a0'
}

const METHOD_COLOR = (m) => {
  if (m === 'GET') return '#0ea5a0'
  if (m === 'POST') return '#fa8c16'
  if (m === 'DELETE') return '#e8453c'
  if (m === 'PUT') return '#4e8af0'
  if (m === 'PATCH') return '#7c5cbf'
  return '#595959'
}

const MODE_LABELS = { default: '默认响应', random: '随机响应', custom: '自定义' }
const MODE_COLORS = { default: 'blue', random: 'purple', custom: 'cyan' }

const CONTENT_TYPES = [
  { value: 'application/json', label: 'JSON' },
  { value: 'text/xml', label: 'XML' },
  { value: 'text/html', label: 'HTML' },
  { value: 'text/plain', label: 'Text' },
  { value: 'text/csv', label: 'CSV' },
  { value: 'application/xml', label: 'XML (application)' },
  { value: 'application/octet-stream', label: 'Binary' },
]

const CT_SHORT = (ct) => {
  if (!ct) return 'JSON'
  if (ct.includes('json')) return 'JSON'
  if (ct.includes('xml')) return 'XML'
  if (ct.includes('html')) return 'HTML'
  if (ct.includes('csv')) return 'CSV'
  if (ct.includes('plain')) return 'Text'
  return ct.split('/').pop()
}

const CT_COLOR = (ct) => {
  if (!ct) return 'blue'
  if (ct.includes('json')) return 'blue'
  if (ct.includes('xml')) return 'orange'
  if (ct.includes('html')) return 'green'
  if (ct.includes('csv')) return 'cyan'
  if (ct.includes('plain')) return 'default'
  return 'default'
}

export default function ApiMock() {
  const [routes, setRoutes] = useState([])
  const [selectedRouteId, setSelectedRouteId] = useState(null)
  const [routeForm, setRouteForm] = useState(null)
  const [originalForm, setOriginalForm] = useState(null)
  const [presets, setPresets] = useState([])
  const [selectedPreset, setSelectedPreset] = useState(undefined)
  const [customPresets, setCustomPresets] = useState([])
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [savePresetName, setSavePresetName] = useState('')
  const [logs, setLogs] = useState([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logPageSize] = useState(50)
  const [expandedLogId, setExpandedLogId] = useState(null)
  const [expandedLogDetail, setExpandedLogDetail] = useState(null)
  const [logFilter, setLogFilter] = useState('all')
  const [serviceStatus, setServiceStatus] = useState({ running: false, port: 9200, captureEnabled: true, routesCount: 0, routesEnabled: 0, totalRequests: 0 })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('config')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [copyText, setCopyText] = useState('复制')
  const pollRef = useRef(null)

  useEffect(() => {
    fetchRoutes()
    fetchPresets()
    fetchCustomPresets()
    fetchStatus()
    fetchLogs()
    pollRef.current = setInterval(() => { fetchStatus() }, 5000)
    return () => clearInterval(pollRef.current)
  }, [])

  const fetchRoutes = async () => { try { const r = await api.get('/api-mock/routes'); setRoutes(r.data || r || []) } catch {} }
  const fetchPresets = async () => { try { const r = await api.get('/api-mock/presets'); setPresets(r.data?.data || r.data || []) } catch {} }
  const fetchCustomPresets = async () => { try { const r = await api.get('/api-mock/custom-presets'); setCustomPresets(r.data?.data || r.data || []) } catch {} }
  const fetchStatus = async () => { try { const r = await api.get('/api-mock/status'); setServiceStatus(r.data || r) } catch {} }
  const fetchLogs = async (page) => {
    try {
      const p = page || logPage
      const params = new URLSearchParams({ limit: String(logPageSize), offset: String((p - 1) * logPageSize) })
      if (logFilter !== 'all') params.set('status', logFilter)
      const r = await api.get(`/api-mock/logs?${params}`)
      const d = r.data || r
      setLogs(d.data || d || [])
      setLogsTotal(d.total ?? (d.data || d || []).length)
    } catch {}
  }

  useEffect(() => { setLogPage(1); fetchLogs(1) }, [logFilter])

  useEffect(() => {
    if (routes.length > 0 && !selectedRouteId) selectRoute(routes[0])
  }, [routes])

  const selectRoute = useCallback((route) => {
    const formData = { ...route }
    setSelectedRouteId(route.id)
    setRouteForm(formData)
    setOriginalForm(formData)
    setSelectedPreset(undefined)
    setActiveTab('config')
  }, [])

  const isDirty = useMemo(() => {
    if (!routeForm || !originalForm) return false
    const keys = ['name', 'method', 'path', 'enabled', 'statusCode', 'contentType',
      'responseBody', 'responseMode', 'matchMode', 'delayMs', 'proxyUrl', 'proxyModifyResponse']
    for (const k of keys) {
      if (routeForm[k] !== originalForm[k]) return true
    }
    if (JSON.stringify(routeForm.responseHeaders) !== JSON.stringify(originalForm.responseHeaders)) return true
    return false
  }, [routeForm, originalForm])

  const defaultRouteId = useMemo(() => {
    if (!routes.length) return null
    return routes.reduce((a, b) => new Date(a.createdAt) < new Date(b.createdAt) ? a : b).id
  }, [routes])

  const isDefault = routeForm && routeForm.id === defaultRouteId

  const handleCreateRoute = async () => {
    try {
      const n = routes.length + 1
      const body = {
        name: `路由 ${n}`,
        method: 'GET',
        path: `/mock/api-${n}`,
        statusCode: 200,
        contentType: 'application/json',
        responseBody: '{"code":0,"message":"success","data":null}',
      }
      const r = await api.post('/api-mock/routes', body)
      const d = r.data || r
      message.success('路由已创建，请修改路径和响应')
      await fetchRoutes()
      selectRoute(d)
    } catch {}
  }

  const handleSaveRoute = async () => {
    if (!routeForm) return
    setSaving(true)
    try {
      await api.put(`/api-mock/routes/${routeForm.id}`, routeForm)
      message.success('已保存')
      await fetchRoutes()
      setOriginalForm({ ...routeForm })
    } catch {} finally { setSaving(false) }
  }

  const handleDeleteRoute = async (id) => {
    try {
      await api.delete(`/api-mock/routes/${id}`)
      message.success('已删除')
      if (selectedRouteId === id) { setSelectedRouteId(null); setRouteForm(null); setOriginalForm(null) }
      await fetchRoutes()
    } catch {}
  }

  const handleToggle = async (id, checked) => {
    try {
      await api.patch(`/api-mock/routes/${id}/toggle`)
      await fetchRoutes()
      if (routeForm && routeForm.id === id) {
        setRouteForm(f => ({ ...f, enabled: checked }))
        setOriginalForm(f => ({ ...f, enabled: checked }))
      }
    } catch {}
  }

  const handlePresetChange = async (key) => {
    if (!routeForm) return
    setSelectedPreset(key)
    if (key.startsWith('custom:')) {
      const cp = customPresets.find(p => `custom:${p.id}` === key)
      if (cp && cp.config) {
        setRouteForm(f => ({
          ...f,
          statusCode: cp.config.statusCode ?? cp.config.status_code ?? f.statusCode,
          contentType: cp.config.contentType ?? cp.config.content_type ?? f.contentType,
          responseBody: cp.config.responseBody ?? cp.config.response_body ?? f.responseBody,
          responseHeaders: cp.config.responseHeaders ?? cp.config.response_headers ?? f.responseHeaders,
        }))
      }
      return
    }
    try {
      const r = await api.get(`/api-mock/presets/${key}`)
      const p = r.data?.data || r.data || r
      setRouteForm(f => ({
        ...f,
        statusCode: p.status_code ?? p.statusCode ?? f.statusCode,
        contentType: p.content_type ?? p.contentType ?? f.contentType,
        responseBody: p.response_body ?? p.responseBody ?? f.responseBody,
        responseHeaders: p.response_headers ?? p.responseHeaders ?? f.responseHeaders,
      }))
    } catch {}
  }

  const handleSaveCustomPreset = async () => {
    if (!routeForm || !savePresetName.trim()) return
    try {
      await api.post('/api-mock/custom-presets', {
        name: savePresetName.trim(),
        config: {
          statusCode: routeForm.statusCode,
          contentType: routeForm.contentType,
          responseBody: routeForm.responseBody,
          responseHeaders: routeForm.responseHeaders,
        }
      })
      message.success('预设已保存')
      setSavePresetOpen(false)
      setSavePresetName('')
      fetchCustomPresets()
    } catch {}
  }

  const handleDeleteCustomPreset = async (e, id) => {
    e.stopPropagation()
    try {
      await api.delete(`/api-mock/custom-presets/${id}`)
      message.success('预设已删除')
      fetchCustomPresets()
    } catch {}
  }

  const handleToggleService = async () => {
    try {
      if (serviceStatus.running) {
        await api.post('/api-mock/stop')
        message.success('API Mock 服务已停止')
      } else {
        await api.post('/api-mock/start')
        message.success('API Mock 服务已启动')
      }
      setTimeout(fetchStatus, 500)
    } catch {}
  }

  const handleClearLogs = async () => {
    try {
      await api.delete('/api-mock/logs')
      message.success('日志已清空')
      setExpandedLogId(null)
      setExpandedLogDetail(null)
      setLogs([])
      setLogsTotal(0)
      setLogPage(1)
      fetchLogs(1)
    } catch {}
  }

  const handleReplay = async (logId) => {
    try {
      const r = await api.post(`/api-mock/logs/${logId}/replay`)
      message.success(`回放完成: ${(r.data || r).status_code}`)
      fetchLogs()
    } catch {}
  }

  const handleExportLogs = () => window.open('/api/api-mock/logs/export', '_blank')

  const handleToggleLogDetail = async (logId) => {
    if (expandedLogId === logId) { setExpandedLogId(null); setExpandedLogDetail(null); return }
    try {
      const r = await api.get(`/api-mock/logs/${logId}`)
      setExpandedLogDetail(r.data || r)
      setExpandedLogId(logId)
    } catch {}
  }

  const handleCopyPreview = () => {
    const body = routeForm?.responseBody || ''
    copyToClipboard(body).then(() => {
      setCopyText('已复制 ✓')
      setTimeout(() => setCopyText('复制'), 1500)
    })
  }

  const responseModeValue = routeForm?.responseMode || 'default'

  const formatBody = (body, ct) => {
    if (!body) return ''
    if (ct?.includes('json')) {
      try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
    }
    return body
  }

  // ─── 渲染：路由配置 Tab ───
  const renderConfigTab = () => {
    if (!routeForm) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Empty description={<span style={{ color: '#bfbfbf' }}>选择左侧路由查看配置</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 路由头部 */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDefault && <Tag color="default" style={{ margin: 0, fontSize: 11 }}>默认</Tag>}
            <Input
              value={routeForm.name}
              onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))}
              variant="borderless"
              style={{ fontSize: 15, fontWeight: 600, width: 200, padding: '0 4px' }}
              placeholder="路由名称"
            />
          </div>
          <Space size={8}>
            <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSaveRoute} loading={saving} disabled={!isDirty}>保存</Button>
            <Switch
              checked={routeForm.enabled}
              onChange={(v) => handleToggle(routeForm.id, v)}
              checkedChildren="启用" unCheckedChildren="禁用" size="small"
            />
            <Button size="small" onClick={() => setAdvancedOpen(true)}>高级</Button>
            {isDefault ? (
              <Tooltip title="默认路由不可删除"><Button icon={<DeleteOutlined />} size="small" disabled /></Tooltip>
            ) : (
              <Popconfirm title="确认删除？" onConfirm={() => handleDeleteRoute(routeForm.id)}>
                <Button icon={<DeleteOutlined />} size="small" danger />
              </Popconfirm>
            )}
          </Space>
        </div>

        {/* 可滚动配置区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
          {/* URL 栏 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16,
            border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden', background: 'transparent',
          }}>
            <Select
              value={routeForm.method}
              onChange={v => setRouteForm(f => ({ ...f, method: v }))}
              variant="borderless"
              style={{ width: 100, flexShrink: 0 }}
              popupMatchSelectWidth={100}
            >
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map(m => (
                <Select.Option key={m} value={m}>
                  <span style={{ fontWeight: 600, color: METHOD_COLOR(m) }}>{m}</span>
                </Select.Option>
              ))}
            </Select>
            <div style={{ width: 1, height: 24, background: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />
            <Input
              value={routeForm.path}
              onChange={e => setRouteForm(f => ({ ...f, path: e.target.value }))}
              variant="borderless"
              style={{ fontFamily: MONO, fontSize: 13, background: 'transparent' }}
              placeholder="/mock/api-example"
            />
          </div>

          {/* 响应模式 + 快速预设 + 状态码 + Content-Type — 紧凑两行 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>响应模式</div>
              <Radio.Group
                value={responseModeValue}
                onChange={e => setRouteForm(f => ({ ...f, responseMode: e.target.value }))}
                buttonStyle="solid" size="small"
              >
                <Radio.Button value="default">默认</Radio.Button>
                <Radio.Button value="random">随机</Radio.Button>
                <Radio.Button value="custom">自定义</Radio.Button>
              </Radio.Group>
            </div>
            <div style={{ minWidth: 80 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>状态码</div>
              <InputNumber
                value={routeForm.statusCode ?? 200}
                onChange={v => setRouteForm(f => ({ ...f, statusCode: v }))}
                min={100} max={599} size="small" style={{ width: 80 }}
              />
            </div>
            <div style={{ minWidth: 130 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Content-Type</div>
              <Select
                value={routeForm.contentType || 'application/json'}
                onChange={v => setRouteForm(f => ({ ...f, contentType: v }))}
                size="small" style={{ width: 130 }}
                showSearch options={CONTENT_TYPES}
              />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>快速预设</div>
              <Select
                onChange={handlePresetChange}
                placeholder="选择预设填充..."
                size="small" style={{ width: '100%' }}
                value={selectedPreset}
              >
                <Select.OptGroup label="JSON">
                  {presets.filter(p => p.group === 'json').map(p =>
                    <Select.Option key={p.key} value={p.key}>{p.label}</Select.Option>)}
                </Select.OptGroup>
                <Select.OptGroup label="XML">
                  {presets.filter(p => p.group === 'xml').map(p =>
                    <Select.Option key={p.key} value={p.key}>{p.label}</Select.Option>)}
                </Select.OptGroup>
                <Select.OptGroup label="HTML">
                  {presets.filter(p => p.group === 'html').map(p =>
                    <Select.Option key={p.key} value={p.key}>{p.label}</Select.Option>)}
                </Select.OptGroup>
                <Select.OptGroup label="Text">
                  {presets.filter(p => p.group === 'text').map(p =>
                    <Select.Option key={p.key} value={p.key}>{p.label}</Select.Option>)}
                </Select.OptGroup>
                <Select.OptGroup label="HTTP 状态码">
                  {presets.filter(p => p.group === 'status').map(p =>
                    <Select.Option key={p.key} value={p.key}>{p.label}</Select.Option>)}
                </Select.OptGroup>
                {customPresets.length > 0 && (
                  <Select.OptGroup label="自定义预设">
                    {customPresets.map(p =>
                      <Select.Option key={`custom:${p.id}`} value={`custom:${p.id}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span><StarOutlined style={{ color: '#faad14', marginRight: 4, fontSize: 11 }} />{p.name}</span>
                          <DeleteOutlined style={{ color: '#e8453c', fontSize: 11 }} onClick={(e) => handleDeleteCustomPreset(e, p.id)} />
                        </div>
                      </Select.Option>)}
                  </Select.OptGroup>
                )}
              </Select>
            </div>
          </div>

          {/* 延迟 + 匹配模式 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>延迟 (ms)</div>
              <InputNumber value={routeForm.delayMs ?? 0} onChange={v => setRouteForm(f => ({ ...f, delayMs: v }))}
                min={0} step={100} size="small" style={{ width: 80 }} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>匹配模式</div>
              <Radio.Group value={routeForm.matchMode || 'exact'} onChange={e => setRouteForm(f => ({ ...f, matchMode: e.target.value }))} size="small">
                <Radio value="exact">精确</Radio>
                <Radio value="prefix">前缀</Radio>
                <Radio value="regex">正则</Radio>
              </Radio.Group>
            </div>
            <div style={{ fontSize: 11, color: '#bfbfbf', alignSelf: 'center', paddingBottom: 2 }}>
              {(routeForm.matchMode || 'exact') === 'exact' && '请求路径完全一致才匹配'}
              {routeForm.matchMode === 'prefix' && '路径前缀匹配（如 /api 匹配 /api/xxx）'}
              {routeForm.matchMode === 'regex' && '路径正则匹配（如 /api/users/\\d+）'}
            </div>
          </div>

          {/* 随机模式提示 */}
          {responseModeValue === 'random' && (
            <Alert
              type="info" showIcon
              message="随机模式：每次请求从内置模板池随机选取一条响应返回"
              style={{ fontSize: 12, marginBottom: 16 }}
            />
          )}

          {/* 响应内容 + 预览 — 左右分栏 */}
          {responseModeValue !== 'random' && (
            <div style={{ display: 'flex', gap: 12, minHeight: 0 }}>
              {/* 左：响应体编辑 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500 }}>响应内容</span>
                  <span style={{ fontSize: 11, color: '#bfbfbf' }}>
                    {'模板: ${method} ${path} ${timestamp} ${uuid}'}
                  </span>
                  <span style={{ flex: 1 }} />
                  <Button size="small" icon={<StarOutlined />}
                    onClick={() => { setSavePresetName(''); setSavePresetOpen(true) }}>保存为预设</Button>
                </div>
                <TextArea
                  value={routeForm.responseBody}
                  onChange={e => setRouteForm(f => ({ ...f, responseBody: e.target.value }))}
                  style={{ fontFamily: MONO, fontSize: 12, flex: 1, minHeight: 200, resize: 'vertical' }}
                  placeholder={'输入响应内容...\n\n例如:\n{"code":0,"message":"success","data":null}'}
                />
              </div>

              {/* 右：响应预览 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500 }}>响应预览</span>
                    <Tag color={(routeForm.statusCode ?? 200) < 400 ? 'green' : 'red'} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                      {routeForm.statusCode ?? 200}
                    </Tag>
                    <Tag color={CT_COLOR(routeForm.contentType)} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                      {CT_SHORT(routeForm.contentType)}
                    </Tag>
                  </div>
                  <Button
                    size="small" type="text"
                    icon={copyText === '复制' ? <CopyOutlined /> : <CheckOutlined />}
                    onClick={handleCopyPreview}
                    style={{ color: copyText === '复制' ? '#8c8c8c' : '#0ea5a0', fontSize: 12 }}
                  >
                    {copyText}
                  </Button>
                </div>
                <pre style={{
                  margin: 0, padding: 14, flex: 1, minHeight: 200, overflow: 'auto',
                  fontSize: 12, lineHeight: 1.6, fontFamily: MONO,
                  background: '#1e1e2e', color: '#cdd6f4',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderRadius: 10,
                }}>
                  {formatBody(routeForm.responseBody, routeForm.contentType)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── 渲染：请求日志 Tab ───
  const renderLogsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid rgba(0,0,0,0.04)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>共 {logsTotal} 条</span>
        <Space size={4}>
          <Radio.Group value={logFilter} onChange={e => setLogFilter(e.target.value)} size="small">
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="ok">OK</Radio.Button>
            <Radio.Button value="error">Error</Radio.Button>
          </Radio.Group>
          <Button icon={<ReloadOutlined />} size="small" type="text" onClick={() => fetchLogs()} />
          <Button icon={<ExportOutlined />} size="small" type="text" onClick={handleExportLogs} />
          <Popconfirm title="确认清空所有日志？" onConfirm={handleClearLogs}>
            <Button icon={<ClearOutlined />} size="small" type="text" danger />
          </Popconfirm>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'transparent', position: 'sticky', top: 0, zIndex: 1 }}>
              {['时间', '状态', '方法', '路径', '类型', '耗时', ''].map((h, i) => (
                <th key={h || 'op'} style={{
                  padding: '6px 10px', textAlign: i >= 5 ? 'right' : 'left',
                  fontWeight: 500, fontSize: 11, color: '#8c8c8c', borderBottom: '1px solid rgba(0,0,0,0.04)',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <Fragment key={l.id}>
                <tr onClick={() => handleToggleLogDetail(l.id)} style={{
                  cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.03)',
                  background: expandedLogId === l.id ? '#f9f0ff' : 'transparent',
                }}>
                  <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontSize: 11, color: '#8c8c8c' }}>
                    {new Date(l.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR(l.statusCode) }}>{l.statusCode}</span>
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: METHOD_COLOR(l.method) }}>{l.method}</span>
                  </td>
                  <td style={{ padding: '5px 10px', fontFamily: MONO, fontSize: 11, color: '#595959', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.path}</td>
                  <td style={{ padding: '5px 10px', fontSize: 11, color: '#8c8c8c' }}>{CT_SHORT(l.contentType)}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: 11, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{Math.round(l.totalMs ?? 0)}ms</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                    <Button size="small" type="text" icon={<SendOutlined />} onClick={e => { e.stopPropagation(); handleReplay(l.id) }} />
                  </td>
                </tr>
                {expandedLogId === l.id && expandedLogDetail && (
                  <tr>
                    <td colSpan={7} style={{ padding: '10px 16px', background: 'transparent', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, fontWeight: 500 }}>请求体</div>
                          <pre style={{
                            maxHeight: 120, overflow: 'auto', margin: 0, padding: 8, borderRadius: 12,
                            background: 'transparent', border: '1px solid rgba(0,0,0,0.04)', fontSize: 11, fontFamily: MONO,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          }}>{expandedLogDetail.requestBody || '-'}</pre>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, fontWeight: 500 }}>响应体</div>
                          <pre style={{
                            maxHeight: 120, overflow: 'auto', margin: 0, padding: 8, borderRadius: 12,
                            background: 'transparent', border: '1px solid rgba(0,0,0,0.04)', fontSize: 11, fontFamily: MONO,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                          }}>{formatBody(expandedLogDetail.responseBody, expandedLogDetail.contentType)}</pre>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
                        来源: {expandedLogDetail.ip || '-'} · 匹配耗时: {(expandedLogDetail.matchMs ?? 0).toFixed(1)}ms
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#bfbfbf', fontSize: 12 }}>暂无请求日志</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {logsTotal > logPageSize && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(0,0,0,0.04)', flexShrink: 0, textAlign: 'right' }}>
          <Pagination size="small" current={logPage} pageSize={logPageSize} total={logsTotal}
            showTotal={t => `共 ${t} 条`} showSizeChanger={false}
            onChange={p => { setLogPage(p); setExpandedLogId(null); fetchLogs(p) }} />
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 70px)', background: 'transparent' }}>

      {/* ━━━ 顶栏 ━━━ */}
      <div style={{
        padding: '10px 20px', background: 'transparent', borderBottom: '1px solid rgba(0,0,0,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloudServerOutlined style={{ fontSize: 18, color: '#7c5cbf' }} />
            <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: 0.5 }}>API Mock</span>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '2px 10px', borderRadius: 12,
            background: serviceStatus.running ? '#e0f7f6' : '#f5f5f5',
            border: `1px solid ${serviceStatus.running ? 'rgba(14,165,160,0.3)' : 'rgba(0,0,0,0.1)'}`,
          }}>
            <Badge status={serviceStatus.running ? 'success' : 'default'} />
            <span style={{
              fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
              color: serviceStatus.running ? '#389e0d' : '#999',
            }}>
              {serviceStatus.running ? `LIVE :${serviceStatus.port}` : 'STOPPED'}
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {serviceStatus.routesEnabled}/{serviceStatus.routesCount} 路由 · {serviceStatus.totalRequests} 请求
          </span>
        </div>
        <Space size={8}>
          {serviceStatus.running && (
            <Button size="small" icon={<CopyOutlined />} onClick={() => {
              copyToClipboard(`http://${window.location.hostname}:${serviceStatus.port}`)
              message.success('已复制端点地址')
            }}>复制端点</Button>
          )}
          <Button
            type={serviceStatus.running ? 'default' : 'primary'}
            danger={serviceStatus.running}
            icon={serviceStatus.running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={handleToggleService} size="small"
          >
            {serviceStatus.running ? '停止服务' : '启动服务'}
          </Button>
        </Space>
      </div>

      {/* ━━━ 主体：左侧路由列表 + 右侧 Tab(配置/日志) ━━━ */}
      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0 }}>

        {/* ── 左栏：路由列表 ── */}
        <div style={{
          width: 260, flexShrink: 0, background: 'transparent', borderRight: '1px solid rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>路由</span>
            <Tooltip title="新建路由">
              <Button type="primary" ghost icon={<PlusOutlined />} size="small" onClick={handleCreateRoute} />
            </Tooltip>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 8px' }}>
            {routes.map(r => {
              const sel = selectedRouteId === r.id
              const isDef = r.id === defaultRouteId
              return (
                <div key={r.id} onClick={() => selectRoute(r)} style={{
                  padding: '10px 12px', marginBottom: 4, borderRadius: 10, cursor: 'pointer',
                  background: sel ? '#f9f0ff' : 'transparent',
                  borderLeft: `3px solid ${sel ? '#7c5cbf' : r.enabled ? '#0ea5a0' : 'rgba(0,0,0,0.1)'}`,
                  transition: 'all .15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isDef && <LockOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />}
                    <Tag style={{
                      margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 3,
                      fontWeight: 600, color: METHOD_COLOR(r.method), borderColor: METHOD_COLOR(r.method),
                      background: 'transparent',
                    }}>{r.method}</Tag>
                    <span style={{
                      flex: 1, fontSize: 11, fontFamily: MONO,
                      color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{r.path}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: sel ? '#262626' : '#8c8c8c', fontWeight: sel ? 500 : 400 }}>{r.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag style={{
                        margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 5px',
                        color: STATUS_COLOR(r.statusCode), borderColor: STATUS_COLOR(r.statusCode),
                        background: 'transparent', borderRadius: 3,
                      }}>{r.statusCode}</Tag>
                      <Tag color={CT_COLOR(r.contentType)} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px', borderRadius: 3 }}>
                        {CT_SHORT(r.contentType)}
                      </Tag>
                    </div>
                  </div>
                </div>
              )
            })}
            {routes.length === 0 && (
              <Empty description="暂无路由" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 60 }} />
            )}
          </div>
        </div>

        {/* ── 右栏：Tab 切换（路由配置 / 请求日志） ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'transparent' }}>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.04)', paddingLeft: 16, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                { key: 'config', label: '路由配置' },
                { key: 'logs', label: <>请求日志 <Tag style={{ margin: '0 0 0 4px', fontSize: 11, borderRadius: 10, lineHeight: '18px', padding: '0 6px' }}>{serviceStatus.totalRequests}</Tag></> },
              ].map(t => (
                <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '10px 16px', cursor: 'pointer', fontSize: 14, position: 'relative',
                  color: activeTab === t.key ? '#7c5cbf' : '#595959',
                  fontWeight: activeTab === t.key ? 500 : 400,
                  borderBottom: activeTab === t.key ? '2px solid #7c5cbf' : '2px solid transparent',
                  marginBottom: -1,
                }}>
                  {t.label}
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {activeTab === 'config' ? renderConfigTab() : renderLogsTab()}
          </div>
        </div>
      </div>

      {/* ━━━ 高级设置抽屉 ━━━ */}
      <Drawer
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        width={420}
        title="高级设置"
      >
        {routeForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>代理转发 URL</div>
              <Input value={routeForm.proxyUrl || ''} onChange={e => setRouteForm(f => ({ ...f, proxyUrl: e.target.value || null }))}
                placeholder="https://api.example.com/real-endpoint"
                prefix={<SendOutlined style={{ color: '#bfbfbf' }} />}
                style={{ fontFamily: MONO, fontSize: 12 }} />
              <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4 }}>填写后请求将被转发到该地址，可用于接口代理调试</div>
            </div>
            {routeForm.proxyUrl && (
              <div>
                <Switch
                  checked={routeForm.proxyModifyResponse || false}
                  onChange={v => setRouteForm(f => ({ ...f, proxyModifyResponse: v }))}
                />
                <span style={{ marginLeft: 8, fontSize: 12, color: '#595959' }}>转发后用本地配置覆盖响应</span>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>自定义响应头 (JSON)</div>
              <TextArea
                value={routeForm.responseHeaders ? JSON.stringify(routeForm.responseHeaders, null, 2) : ''}
                onChange={e => { try { setRouteForm(f => ({ ...f, responseHeaders: e.target.value ? JSON.parse(e.target.value) : null })) } catch {} }}
                rows={4}
                style={{ fontFamily: MONO, fontSize: 12 }}
                placeholder='{"X-Custom-Header": "value", "Cache-Control": "no-cache"}' />
            </div>
          </div>
        )}
      </Drawer>

      <Modal title="保存为自定义预设" open={savePresetOpen}
        onOk={handleSaveCustomPreset} onCancel={() => setSavePresetOpen(false)}
        okText="保存" cancelText="取消" okButtonProps={{ disabled: !savePresetName.trim() }}>
        <div style={{ marginBottom: 8, fontSize: 13, color: '#8c8c8c' }}>
          将当前响应配置（状态码、Content-Type、响应内容等）保存为预设，方便下次快速选用。
        </div>
        <Input placeholder="输入预设名称" value={savePresetName}
          onChange={e => setSavePresetName(e.target.value)}
          onPressEnter={handleSaveCustomPreset} autoFocus />
      </Modal>
    </div>
  )
}
