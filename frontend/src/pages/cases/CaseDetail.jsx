import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Tag, Button, Input, Select, Space, Modal, message, Tabs, Switch, Popover, Tooltip, Spin, Empty, Table } from 'antd'
import {
  ArrowLeftOutlined, PlayCircleOutlined, SaveOutlined,
  ExperimentOutlined, BugOutlined, PlusOutlined, DeleteOutlined, HolderOutlined,
  ThunderboltOutlined, TagOutlined, AppstoreOutlined, ApiOutlined,
  FlagOutlined, WarningOutlined, CodeOutlined, CopyOutlined, FileTextOutlined,
  DesktopOutlined, CheckCircleOutlined, StarOutlined, StarFilled, ImportOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'
import ScriptEditor from '../../components/ScriptEditor'

const priorityColors = { P0: '#fff', P1: '#fff', P2: '#fff', P3: '#fff' }
const priorityBg = { P0: '#ff7875', P1: '#ffc069', P2: '#85a5ff', P3: '#d9d9d9' }
const statusColors = { automated: '#00b96b', pending: '#faad14', removed: '#ff4d4f' }
const statusBg = { automated: '#f6ffed', pending: '#fffbe6', removed: '#fff2f0' }
const statusLabels = { automated: '已自动化', pending: '待自动化', removed: '脚本已移除' }
const dotColors = { P0: '#ff7875', P1: '#ffc069', P2: '#85a5ff', P3: '#d9d9d9', automated: '#00b96b', pending: '#faad14', removed: '#ff4d4f' }
const phaseColor = { setup: '#722ed1', action: '#1890ff', verify: '#00b96b' }
const phaseLabel = { setup: '准备', action: '操作', verify: '验证' }
const scenarioStatusMap = {
  draft: { label: '草稿', color: '#86909c', bg: '#f7f8fa' },
  debugging: { label: '调试中', color: '#faad14', bg: '#fffbe6' },
  completed: { label: '已完成', color: '#00b96b', bg: '#f6ffed' },
}

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

function ScenarioStepsView({ steps, extraCol, extraColLabel, extraPlaceholder, extraColor }) {
  if (!steps?.length) return <Empty description="暂无步骤" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
  return (
    <div style={{ borderRadius: 10, border: '1px solid #f2f3f5', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', gap: 10, padding: '6px 14px', fontSize: 12, fontWeight: 600,
        background: '#f7f8fa', color: '#86909c', borderBottom: '1px solid #f2f3f5', alignItems: 'center',
      }}>
        <span style={{ width: 28, flexShrink: 0 }}>#</span>
        <span style={{ width: 52, flexShrink: 0 }}>阶段</span>
        <span style={{ flex: 2 }}>操作步骤</span>
        {extraCol && <span style={{ flex: 1 }}>{extraColLabel}</span>}
        <span style={{ flex: 1 }}>预期结果</span>
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, padding: '8px 14px', fontSize: 13,
          background: i % 2 === 0 ? '#fff' : '#fafbfc',
          borderBottom: i < steps.length - 1 ? '1px solid #f8f8f8' : 'none', alignItems: 'center',
        }}>
          <span style={{
            width: 28, height: 24, borderRadius: 6, background: '#e6f7ff', color: '#1890ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0,
          }}>{s.seq || i + 1}</span>
          {s.phase ? (
            <span style={{
              width: 52, flexShrink: 0, fontSize: 11, fontWeight: 500, textAlign: 'center',
              padding: '2px 0', borderRadius: 4,
              background: `${phaseColor[s.phase] || '#86909c'}15`, color: phaseColor[s.phase] || '#86909c',
            }}>{phaseLabel[s.phase] || s.phase}</span>
          ) : <span style={{ width: 52, flexShrink: 0 }} />}
          <span style={{ flex: 2 }}>{s.action || '-'}</span>
          {extraCol && (
            <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: extraColor || '#1890ff' }}>
              {s[extraCol] || ''}
            </span>
          )}
          <span style={{ flex: 1, color: '#86909c' }}>{s.expected || '-'}</span>
        </div>
      ))}
    </div>
  )
}

function ScriptViewer({ scriptData, loading, error, onRetry }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="加载脚本中..." /></div>
  if (error) return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ color: '#ff4d4f', marginBottom: 12 }}>{error}</div>
      <Button size="small" onClick={onRetry}>重试</Button>
    </div>
  )
  if (!scriptData) return null
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px', background: '#f7f8fa', borderBottom: '1px solid #f2f3f5', fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileTextOutlined style={{ color: '#86909c' }} />
          <span style={{ fontFamily: 'monospace', color: '#4e5969' }}>{scriptData.filePath}</span>
          {scriptData.funcName && <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{scriptData.funcName}</Tag>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag style={{ fontSize: 11, margin: 0, fontFamily: 'monospace' }}>{scriptData.commitSha?.substring(0, 8)}</Tag>
          <Tooltip title="复制脚本内容">
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => {
              navigator.clipboard.writeText(scriptData.content)
              message.success('已复制到剪贴板')
            }} />
          </Tooltip>
        </div>
      </div>
      <div style={{ maxHeight: 500, overflow: 'auto', background: '#1e1e1e' }}>
        <pre style={{
          margin: 0, padding: '12px 0', fontSize: 13, lineHeight: 1.6,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: '#d4d4d4',
        }}>
          {scriptData.content.split('\n').map((line, i) => {
            const fn = scriptData.funcName
            const isTarget = fn && (line.includes(`def ${fn}`) || line.includes(`async def ${fn}`))
            return (
              <div key={i} style={{
                display: 'flex',
                background: isTarget ? 'rgba(255,213,79,0.15)' : 'transparent',
                borderLeft: isTarget ? '3px solid #ffd54f' : '3px solid transparent',
              }}>
                <span style={{ display: 'inline-block', width: 48, textAlign: 'right', paddingRight: 12, color: '#858585', userSelect: 'none', flexShrink: 0 }}>{i + 1}</span>
                <code style={{ whiteSpace: 'pre', flex: 1, paddingRight: 16 }}>{line}</code>
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}

function ScenarioCard({ scenario, type, accentColor, icon, scriptContent, scriptLoading, scriptError, onLoadScript }) {
  if (!scenario) return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      <Empty description={`暂无${type === 'api' ? '接口' : 'UI'}测试场景`} image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <div style={{ color: '#86909c', fontSize: 12 }}>
          通过 generate-test-suite 生成或手动导入 tea-cases.json 添加
        </div>
      </Empty>
    </Card>
  )
  const extraCol = type === 'api' ? 'apiEndpoint' : 'uiTarget'
  const extraLabel = type === 'api' ? '接口' : '页面/元素'
  return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      {/* 脚本引用 */}
      {scenario.scriptRefFile && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f7f8fa', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CodeOutlined style={{ color: '#86909c' }} />
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#4e5969' }}>{scenario.scriptRefFile}</span>
          {scenario.scriptRefFunc && <Tag color={accentColor} style={{ fontSize: 11, margin: 0 }}>{scenario.scriptRefFunc}</Tag>}
        </div>
      )}

      {/* 步骤表 */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>测试步骤</h4>
        <ScenarioStepsView steps={scenario.steps} extraCol={extraCol} extraColLabel={extraLabel} extraColor={accentColor} />
      </div>

      {/* 依赖参数 */}
      {scenario.variablesUsed?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>依赖参数</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {scenario.variablesUsed.map((v, i) => (
              <Tag key={i} style={{ fontFamily: 'monospace', fontSize: 12, background: '#f0f5ff', border: '1px solid #adc6ff', color: '#1d39c4', borderRadius: 4, padding: '2px 8px' }}>{v}</Tag>
            ))}
          </div>
        </div>
      )}

      {/* 脚本源码 */}
      {scenario.scriptRefFile && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ fontSize: 13, color: '#86909c', margin: 0 }}>脚本源码</h4>
            {!scriptContent && !scriptLoading && (
              <Button size="small" type="link" icon={<CodeOutlined />} onClick={onLoadScript}>加载脚本</Button>
            )}
          </div>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #f2f3f5' }}>
            <ScriptViewer scriptData={scriptContent} loading={scriptLoading} error={scriptError} onRetry={onLoadScript} />
          </div>
        </div>
      )}
    </Card>
  )
}

function generateApiCode(steps, title) {
  const lines = ['import httpx', 'import pytest', '', '', `BASE_URL = "http://localhost:8000"`, '', '']
  const fnName = 'test_' + (title || 'scenario').replace(/[^a-zA-Z0-9一-龥]/g, '_').replace(/_+/g, '_').substring(0, 40).toLowerCase()
  lines.push(`def ${fnName}():`)
  lines.push(`    """${title || '接口测试'}"""`)
  lines.push(`    client = httpx.Client(base_url=BASE_URL)`)
  lines.push('')

  for (const s of steps) {
    const endpoint = s.apiEndpoint || ''
    lines.push(`    # Step ${s.seq}: ${s.action || ''}`)
    if (endpoint) {
      const parts = endpoint.trim().split(/\s+/)
      const method = (parts.length > 1 ? parts[0] : 'GET').toLowerCase()
      const path = parts.length > 1 ? parts[1] : parts[0]
      lines.push(`    response = client.${method}("${path}")`)
      if (s.expected) {
        if (/\d{3}/.test(s.expected)) {
          const code = s.expected.match(/\d{3}/)[0]
          lines.push(`    assert response.status_code == ${code}  # ${s.expected}`)
        } else {
          lines.push(`    # 预期: ${s.expected}`)
        }
      }
    } else if (s.expected) {
      lines.push(`    # 预期: ${s.expected}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function generateUiCode(steps, title) {
  const lines = ['from playwright.sync_api import Page, expect', '', '']
  const fnName = 'test_' + (title || 'ui_scenario').replace(/[^a-zA-Z0-9一-龥]/g, '_').replace(/_+/g, '_').substring(0, 40).toLowerCase()
  lines.push(`def ${fnName}(page: Page):`)
  lines.push(`    """${title || 'UI 测试'}"""`)
  lines.push('')

  for (const s of steps) {
    const target = s.uiTarget || ''
    lines.push(`    # Step ${s.seq}: ${s.action || ''}`)
    if (target.startsWith('/') || target.startsWith('http')) {
      lines.push(`    page.goto("${target}")`)
    } else if (target) {
      lines.push(`    page.locator("${target}").click()`)
    }
    if (s.expected) lines.push(`    # 预期: ${s.expected}`)
    lines.push('')
  }
  return lines.join('\n')
}

function ScenarioEditor({
  scenario, setScenario, scenarioStatus, setScenarioStatus,
  isTemplate, setIsTemplate, type, accentColor,
  onImportTemplate, manualSteps, caseTitle,
  projectId, branchId, caseId,
}) {
  const extraCol = type === 'api' ? 'apiEndpoint' : 'uiTarget'
  const extraLabel = type === 'api' ? '接口端点' : '页面/元素'
  const [viewMode, setViewMode] = useState('steps') // 'steps' | 'code'

  const initScenario = (fromManual) => {
    let newSteps
    if (fromManual && manualSteps?.length) {
      newSteps = manualSteps.map((s, i) => ({
        seq: i + 1,
        phase: i === 0 ? 'setup' : i < manualSteps.length - 1 ? 'action' : 'verify',
        action: s.action || '',
        expected: s.expected || '',
        [extraCol]: '',
      }))
    } else {
      newSteps = [{ seq: 1, phase: 'action', action: '', expected: '', [extraCol]: '' }]
    }
    setScenario({ steps: newSteps, variablesUsed: [] })
  }

  if (!scenario) return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      <Empty description={`暂无${type === 'api' ? '接口' : 'UI'}测试场景`} image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => initScenario(false)}>创建空白场景</Button>
            {manualSteps?.length > 0 && (
              <Button icon={<CopyOutlined />} onClick={() => initScenario(true)}>从手动步骤生成</Button>
            )}
          </Space>
          <Button type="link" size="small" icon={<ImportOutlined />} onClick={onImportTemplate}>从模板导入</Button>
        </div>
      </Empty>
    </Card>
  )

  const steps = scenario.steps || []
  const updateScenario = (patch) => setScenario(prev => ({ ...prev, ...patch }))
  const updateStepField = (idx, field, value) => {
    const newSteps = steps.map((s, i) => i === idx ? { ...s, [field]: value } : s)
    updateScenario({ steps: newSteps })
  }
  const addStep = () => updateScenario({
    steps: [...steps, { seq: steps.length + 1, phase: 'action', action: '', expected: '', [extraCol]: '' }]
  })
  const removeStep = (idx) => updateScenario({
    steps: steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 }))
  })

  const scVars = scenario.variablesUsed || []
  const [newVarInput, setNewVarInput] = useState('')

  return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      {/* 顶部工具栏：视图切换 + 状态 + 模板 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space size={8}>
          {/* 视图切换 */}
          <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid #e5e6eb', overflow: 'hidden' }}>
            <div onClick={() => setViewMode('steps')} style={{
              padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
              background: viewMode === 'steps' ? accentColor : '#fff',
              color: viewMode === 'steps' ? '#fff' : '#4e5969',
            }}>步骤视图</div>
            <div onClick={() => setViewMode('code')} style={{
              padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
              background: viewMode === 'code' ? '#1e1e1e' : '#fff',
              color: viewMode === 'code' ? '#d4d4d4' : '#4e5969',
              borderLeft: '1px solid #e5e6eb',
            }}>代码视图</div>
          </div>
          <Select size="small" value={scenarioStatus} onChange={setScenarioStatus} style={{ width: 100 }}
            options={Object.entries(scenarioStatusMap).map(([k, v]) => ({
              value: k, label: <span style={{ color: v.color }}>{v.label}</span>
            }))} />
          <Tooltip title={scenarioStatus === 'completed' ? (isTemplate ? '取消模板' : '标记为模板') : '仅已完成可标记'}>
            <Button size="small" type={isTemplate ? 'primary' : 'default'}
              disabled={scenarioStatus !== 'completed'}
              icon={isTemplate ? <StarFilled /> : <StarOutlined />}
              onClick={() => setIsTemplate(!isTemplate)}
              style={isTemplate ? { background: '#fff7e6', borderColor: '#ffc069', color: '#fa8c16' } : {}}>
              {isTemplate ? '模板' : '标记模板'}
            </Button>
          </Tooltip>
        </Space>
        <Space>
          <Button size="small" icon={<ImportOutlined />} onClick={onImportTemplate}>从模板导入</Button>
          <Button size="small" danger type="text" onClick={() => {
            Modal.confirm({
              title: '确认删除场景', content: '删除后场景数据将清空，确定继续？',
              onOk: () => { setScenario(null); setScenarioStatus('draft'); setIsTemplate(false) },
            })
          }}><DeleteOutlined /> 删除</Button>
        </Space>
      </div>

      {/* 步骤视图 */}
      {viewMode === 'steps' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ fontSize: 13, color: '#86909c', margin: 0 }}>测试步骤 <span style={{ fontSize: 11, fontWeight: 400 }}>（每行对应一个接口调用或操作）</span></h4>
              <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addStep}>添加步骤</Button>
            </div>
            <div style={{ borderRadius: 10, border: '1px solid #f2f3f5', overflow: 'hidden' }}>
              <div style={{
                display: 'flex', gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: '#f7f8fa', color: '#86909c', borderBottom: '1px solid #f2f3f5', alignItems: 'center',
              }}>
                <span style={{ width: 24, flexShrink: 0 }}></span>
                <span style={{ width: 28, flexShrink: 0 }}>#</span>
                <span style={{ width: 72, flexShrink: 0 }}>阶段</span>
                <span style={{ flex: 2 }}>操作步骤</span>
                <span style={{ flex: 1 }}>{extraLabel}</span>
                <span style={{ flex: 1 }}>预期结果</span>
                <span style={{ width: 32, flexShrink: 0 }}></span>
              </div>
              {steps.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 6, padding: '6px 14px', fontSize: 13,
                  background: i % 2 === 0 ? '#fff' : '#fafbfc',
                  borderBottom: i < steps.length - 1 ? '1px solid #f8f8f8' : 'none', alignItems: 'center',
                }}>
                  <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', flexShrink: 0 }} />
                  <span style={{
                    width: 28, height: 24, borderRadius: 6, background: '#e6f7ff', color: '#1890ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0,
                  }}>{s.seq}</span>
                  <Select size="small" value={s.phase || 'action'} onChange={v => updateStepField(i, 'phase', v)}
                    style={{ width: 72, flexShrink: 0 }}
                    options={Object.entries(phaseLabel).map(([k, v]) => ({ value: k, label: v }))} />
                  <Input value={s.action || ''} onChange={e => updateStepField(i, 'action', e.target.value)}
                    placeholder="描述操作步骤..." variant="borderless" style={{ flex: 2, fontSize: 13 }}
                    onKeyDown={e => { if (e.key === 'Enter' && i === steps.length - 1 && s.action?.trim()) { e.preventDefault(); addStep() } }} />
                  <Input value={s[extraCol] || ''} onChange={e => updateStepField(i, extraCol, e.target.value)}
                    placeholder={type === 'api' ? 'POST /api/...' : '页面/元素选择器'}
                    variant="borderless" style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: accentColor }} />
                  <Input value={s.expected || ''} onChange={e => updateStepField(i, 'expected', e.target.value)}
                    placeholder="预期结果..." variant="borderless" style={{ flex: 1, fontSize: 13, color: '#86909c' }} />
                  <Button type="text" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => removeStep(i)} disabled={steps.length <= 1}
                    style={{ flexShrink: 0, opacity: steps.length <= 1 ? 0.3 : 1 }} />
                </div>
              ))}
            </div>
            <Button type="dashed" block style={{ marginTop: 8, borderRadius: 8 }} icon={<PlusOutlined />} onClick={addStep}>添加步骤</Button>
          </div>

          {/* 依赖参数 */}
          <div>
            <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>依赖参数</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {scVars.map((v, i) => (
                <Tag key={i} closable onClose={() => updateScenario({ variablesUsed: scVars.filter((_, j) => j !== i) })}
                  style={{ fontFamily: 'monospace', fontSize: 11, background: '#f0f5ff', border: '1px solid #adc6ff', color: '#1d39c4', borderRadius: 4, padding: '1px 6px' }}>
                  {v}
                </Tag>
              ))}
              {scVars.length === 0 && <span style={{ fontSize: 12, color: '#c9cdd4' }}>暂无</span>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Input value={newVarInput} onChange={e => setNewVarInput(e.target.value)} size="small"
                placeholder="参数名" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                onKeyDown={e => { if (e.key === 'Enter' && newVarInput.trim()) { updateScenario({ variablesUsed: [...scVars, newVarInput.trim()] }); setNewVarInput('') } }} />
              <Button size="small" icon={<PlusOutlined />} disabled={!newVarInput.trim()}
                onClick={() => { updateScenario({ variablesUsed: [...scVars, newVarInput.trim()] }); setNewVarInput('') }} />
            </div>
          </div>
        </>
      )}

      {/* 代码视图 — 内嵌 ScriptEditor */}
      {viewMode === 'code' && (
        <div>
          <div style={{ fontSize: 12, color: '#86909c', marginBottom: 8 }}>
            基于步骤自动生成的可执行代码，也可以直接编辑。保存后可点击「运行」执行。
          </div>
          <ScriptEditor
            projectId={projectId} branchId={branchId} caseId={caseId}
            scriptType={type === 'api' ? 'api' : 'ui'} accentColor={accentColor}
            autoGenerateCode={type === 'api' ? generateApiCode(steps, caseTitle) : generateUiCode(steps, caseTitle)}
          />
        </div>
      )}
    </Card>
  )
}

function TemplateModal({ open, onClose, projectId, branchId, scenarioType, onSelect }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && projectId && branchId) {
      setLoading(true)
      api.get(`/projects/${projectId}/branches/${branchId}/cases/templates?type=${scenarioType}`)
        .then(res => setTemplates(res.data || []))
        .catch(() => message.error('加载模板失败'))
        .finally(() => setLoading(false))
    }
  }, [open, projectId, branchId, scenarioType])

  const scenario = scenarioType === 'api' ? 'apiScenario' : 'uiScenario'

  return (
    <Modal title={`从模板导入 — ${scenarioType === 'api' ? '接口' : 'UI'}测试场景`}
      open={open} onCancel={onClose} footer={null} width={640}>
      {loading ? <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div> : (
        templates.length === 0 ? (
          <Empty description="暂无模板" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <div style={{ fontSize: 12, color: '#86909c' }}>将已完成的场景标记为模板后即可在此引用</div>
          </Empty>
        ) : (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {templates.map(t => {
              const sc = t[scenario]
              return (
                <div key={t.id} style={{
                  padding: '12px 16px', borderRadius: 8, border: '1px solid #f2f3f5',
                  marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#91d5ff'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#f2f3f5'}
                  onClick={() => { onSelect(sc); onClose() }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>
                      <StarFilled style={{ color: '#faad14', marginRight: 6 }} />
                      {t.title}
                    </span>
                    <Tag color="blue" style={{ fontSize: 11 }}>{sc?.steps?.length || 0} 步</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#86909c' }}>
                    <span style={{ fontFamily: 'monospace' }}>{t.caseCode}</span>
                    {sc?.scriptRefFile && <span style={{ marginLeft: 8, fontFamily: 'monospace' }}>{sc.scriptRefFile}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </Modal>
  )
}

export default function CaseDetail() {
  const { projectId, caseId } = useParams()
  const navigate = useNavigate()

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
  const [steps, setSteps] = useState([{ seq: 1, action: '', expected: '' }])
  const [variablesUsed, setVariablesUsed] = useState([])
  const [newVarInput, setNewVarInput] = useState('')
  const [apiScenario, setApiScenario] = useState(null)
  const [uiScenario, setUiScenario] = useState(null)
  const [apiScenarioStatus, setApiScenarioStatus] = useState('draft')
  const [uiScenarioStatus, setUiScenarioStatus] = useState('draft')
  const [isApiTemplate, setIsApiTemplate] = useState(false)
  const [isUiTemplate, setIsUiTemplate] = useState(false)

  // 模板弹窗
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateModalType, setTemplateModalType] = useState('api')

  // 脚本查看
  const [scriptContent, setScriptContent] = useState(null)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [scriptError, setScriptError] = useState(null)

  const savedRef = useRef('')

  useEffect(() => {
    if (branchId) loadData()
  }, [projectId, branchId, caseId])

  async function loadData() {
    if (!branchId) { message.error('缺少分支信息'); setLoading(false); return }
    setLoading(true)
    try {
      const [caseRes, envRes, folderRes] = await Promise.all([
        api.get(`/projects/${projectId}/branches/${branchId}/cases/${caseId}`),
        api.get('/environments'),
        api.get(`/projects/${projectId}/branches/${branchId}/folders`),
      ])
      const c = caseRes.data
      setCaseData(c)

      const allFolders = folderRes.data || []
      setFolders(allFolders)
      const folderPath = c.folderId ? findFolderPath(allFolders, c.folderId) : ''
      let newModule = '', newSubModule = ''
      if (folderPath) {
        const parts = folderPath.split('/')
        newModule = parts.slice(0, -1).join('/') || parts[0] || ''
        newSubModule = parts.length > 1 ? parts[parts.length - 1] : ''
      }

      const vals = {
        title: c.title || '', type: c.type || 'api', priority: c.priority || 'P1',
        module: newModule, subModule: newSubModule,
        automationStatus: c.automationStatus || 'pending', flaky: c.isFlaky || false,
        preconditions: c.preconditions || '', expectedResult: c.expectedResult || '',
        scriptRefFile: c.scriptRefFile || '', scriptRefFunc: c.scriptRefFunc || '',
        remark: c.remark || '',
        steps: c.steps?.length ? c.steps.map((s, i) => ({ ...s, seq: s.seq || i + 1 })) : [{ seq: 1, action: '', expected: '' }],
        variablesUsed: c.variablesUsed || [],
        apiScenario: c.apiScenario || null,
        uiScenario: c.uiScenario || null,
        apiScenarioStatus: c.apiScenarioStatus || 'draft',
        uiScenarioStatus: c.uiScenarioStatus || 'draft',
        isApiTemplate: c.isApiTemplate || false,
        isUiTemplate: c.isUiTemplate || false,
      }

      setTitle(vals.title); setType(vals.type); setPriority(vals.priority)
      setModule(vals.module); setSubModule(vals.subModule)
      setAutomationStatus(vals.automationStatus); setFlaky(vals.flaky)
      setPreconditions(vals.preconditions); setExpectedResult(vals.expectedResult)
      setScriptRefFile(vals.scriptRefFile); setScriptRefFunc(vals.scriptRefFunc)
      setRemark(vals.remark); setSteps(vals.steps); setVariablesUsed(vals.variablesUsed)
      setApiScenario(vals.apiScenario); setUiScenario(vals.uiScenario)
      setApiScenarioStatus(vals.apiScenarioStatus); setUiScenarioStatus(vals.uiScenarioStatus)
      setIsApiTemplate(vals.isApiTemplate); setIsUiTemplate(vals.isUiTemplate)

      savedRef.current = JSON.stringify(vals)
      setEnvironments(envRes.data || [])
      if (envRes.data?.length) setRunEnv(envRes.data[0].id)
    } catch { message.error('加载用例详情失败') }
    finally { setLoading(false) }
  }

  const currentSnap = JSON.stringify({
    title, type, priority, module, subModule, automationStatus, flaky,
    preconditions, expectedResult, scriptRefFile, scriptRefFunc, remark,
    steps, variablesUsed, apiScenario, uiScenario,
    apiScenarioStatus, uiScenarioStatus, isApiTemplate, isUiTemplate,
  })
  const isDirty = caseData && currentSnap !== savedRef.current

  async function loadScript() {
    if (!branchId || !scriptRefFile) return
    setScriptLoading(true); setScriptError(null)
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/cases/${caseId}/script`)
      setScriptContent(res.data)
    } catch (err) {
      setScriptError(err?.response?.data?.message || '加载脚本失败')
      setScriptContent(null)
    } finally { setScriptLoading(false) }
  }

  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleBack = () => {
    if (isDirty) {
      Modal.confirm({
        title: '未保存的修改', content: '当前有未保存的修改，确定离开吗？',
        okText: '离开', cancelText: '继续编辑', onOk: () => navigate(-1),
      })
    } else navigate(-1)
  }

  const addStep = () => setSteps(prev => [...prev, { seq: prev.length + 1, action: '', expected: '' }])
  const removeStep = (idx) => setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, seq: i + 1 })))
  const updateStep = (idx, field, value) => setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))

  const handleSave = async () => {
    try {
      await api.put(`/projects/${projectId}/branches/${branchId}/cases/${caseId}`, {
        title, type, priority, module, subModule, automationStatus,
        isFlaky: flaky, preconditions, expectedResult, scriptRefFile, scriptRefFunc,
        remark, steps, variablesUsed, apiScenario, uiScenario,
        apiScenarioStatus, uiScenarioStatus, isApiTemplate, isUiTemplate,
      })
      savedRef.current = currentSnap
      setCaseData(prev => ({ ...prev }))
      message.success('保存成功')
    } catch { message.error('保存失败') }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (!caseData) return <div style={{ textAlign: 'center', padding: 80, color: '#86909c' }}>用例不存在</div>

  const caseCode = caseData.caseCode || caseData.id?.substring(0, 8)
  const hasApi = !!apiScenario
  const hasUi = !!uiScenario

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} size="small" onClick={handleBack} style={{ color: '#86909c' }} />
        <span style={{ fontSize: 12, color: '#c9cdd4' }}>用例管理</span>
        <span style={{ color: '#e5e6eb', fontSize: 12 }}>/</span>
        <span style={{ fontSize: 12, color: '#86909c', fontFamily: 'monospace' }}>{caseCode}</span>
      </div>

      <Card styles={{ body: { padding: '16px 20px' } }} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Button type="primary" size="small" icon={<SaveOutlined />} disabled={!isDirty} onClick={handleSave}>保存</Button>
          <Input value={title} onChange={e => setTitle(e.target.value)} variant="borderless"
            style={{ fontSize: 16, fontWeight: 600, flex: 1, padding: '2px 4px' }} />
          <Select value={runEnv} onChange={setRunEnv} size="small" style={{ width: 170, flexShrink: 0 }}
            placeholder="选择环境" options={environments.map(e => ({ value: e.id, label: e.name }))} />
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
            <DropdownList activeKey={type} onSelect={setType} items={['api','e2e'].map(t => ({ key: t, label: t.toUpperCase() }))} />
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

          {/* 场景覆盖指示器 — 显示状态 + 模板 */}
          <div style={{ display: 'inline-flex', gap: 4, marginLeft: 8 }}>
            <Tooltip title="手动测试步骤">
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                borderRadius: 4, fontSize: 11, fontWeight: 500,
                background: '#f6ffed', color: '#00b96b', border: '1px solid #b7eb8f',
              }}><CheckCircleOutlined style={{ fontSize: 10 }} /> 手动 ({steps.length}步)</span>
            </Tooltip>
            <Tooltip title={hasApi ? `接口场景 · ${(scenarioStatusMap[apiScenarioStatus] || {}).label || '草稿'}${isApiTemplate ? ' · 模板' : ''}` : '暂无接口测试场景，点击接口测试 Tab 创建'}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                borderRadius: 4, fontSize: 11, fontWeight: 500,
                background: hasApi ? '#e6f7ff' : '#f7f8fa',
                color: hasApi ? (scenarioStatusMap[apiScenarioStatus] || {}).color || '#1890ff' : '#c9cdd4',
                border: `1px solid ${hasApi ? '#91d5ff' : '#e5e6eb'}`,
              }}>
                {isApiTemplate && <StarFilled style={{ fontSize: 9, color: '#faad14' }} />}
                <ApiOutlined style={{ fontSize: 10 }} /> API
                {hasApi && <span>({apiScenario?.steps?.length || 0}步 · {(scenarioStatusMap[apiScenarioStatus] || {}).label || '草稿'})</span>}
              </span>
            </Tooltip>
            <Tooltip title={hasUi ? `UI 场景 · ${(scenarioStatusMap[uiScenarioStatus] || {}).label || '草稿'}${isUiTemplate ? ' · 模板' : ''}` : '暂无 UI 测试场景，点击 UI 测试 Tab 创建'}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px',
                borderRadius: 4, fontSize: 11, fontWeight: 500,
                background: hasUi ? '#f0f5ff' : '#f7f8fa',
                color: hasUi ? (scenarioStatusMap[uiScenarioStatus] || {}).color || '#722ed1' : '#c9cdd4',
                border: `1px solid ${hasUi ? '#d3adf7' : '#e5e6eb'}`,
              }}>
                {isUiTemplate && <StarFilled style={{ fontSize: 9, color: '#faad14' }} />}
                <DesktopOutlined style={{ fontSize: 10 }} /> UI
                {hasUi && <span>({uiScenario?.steps?.length || 0}步 · {(scenarioStatusMap[uiScenarioStatus] || {}).label || '草稿'})</span>}
              </span>
            </Tooltip>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <Tabs defaultActiveKey="manual" items={[
            { key: 'manual', label: '手动测试步骤', children: (
              <Card styles={{ body: { padding: '16px 20px' } }}>
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>前置条件</h4>
                  <Input.TextArea rows={2} value={preconditions} onChange={e => setPreconditions(e.target.value)}
                    style={{ background: '#f7f8fa', borderColor: '#f2f3f5' }} autoSize={{ minRows: 2, maxRows: 6 }} />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ fontSize: 13, color: '#86909c', margin: 0 }}>测试步骤</h4>
                    <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={addStep}>添加步骤</Button>
                  </div>
                  <div style={{ borderRadius: 10, border: '1px solid #f2f3f5', overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', gap: 10, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                      background: '#f7f8fa', color: '#86909c', borderBottom: '1px solid #f2f3f5', alignItems: 'center',
                    }}>
                      <span style={{ width: 24, flexShrink: 0 }}></span>
                      <span style={{ width: 28, flexShrink: 0 }}>#</span>
                      <span style={{ flex: 2 }}>操作步骤</span>
                      <span style={{ flex: 1 }}>预期结果</span>
                      <span style={{ width: 32, flexShrink: 0 }}></span>
                    </div>
                    {steps.map((s, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '8px 14px', fontSize: 13,
                        background: i % 2 === 0 ? '#fff' : '#fafbfc',
                        borderBottom: i < steps.length - 1 ? '1px solid #f8f8f8' : 'none', alignItems: 'center',
                      }}>
                        <HolderOutlined style={{ color: '#d9d9d9', cursor: 'grab', flexShrink: 0 }} />
                        <span style={{
                          width: 28, height: 24, borderRadius: 6, background: '#e6f7ff', color: '#1890ff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0,
                        }}>{s.seq}</span>
                        <Input value={s.action} onChange={e => updateStep(i, 'action', e.target.value)}
                          placeholder="描述操作步骤..." variant="borderless" style={{ flex: 2, fontSize: 13 }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && i === steps.length - 1 && s.action.trim()) {
                              e.preventDefault(); addStep()
                              setTimeout(() => { const inputs = document.querySelectorAll('[placeholder="描述操作步骤..."]'); inputs[inputs.length - 1]?.focus() }, 50)
                            }
                          }} />
                        <Input value={s.expected || ''} onChange={e => updateStep(i, 'expected', e.target.value)}
                          placeholder="预期结果..." variant="borderless" style={{ flex: 1, fontSize: 13, color: '#86909c' }} />
                        <Button type="text" danger size="small" icon={<DeleteOutlined />}
                          onClick={() => removeStep(i)} disabled={steps.length <= 1}
                          style={{ flexShrink: 0, opacity: steps.length <= 1 ? 0.3 : 1 }} />
                      </div>
                    ))}
                  </div>
                  <Button type="dashed" block style={{ marginTop: 8, borderRadius: 8 }} icon={<PlusOutlined />} onClick={addStep}>添加步骤</Button>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>预期结果</h4>
                  <Input.TextArea value={expectedResult} onChange={e => setExpectedResult(e.target.value)}
                    style={{ background: '#f7f8fa', borderColor: '#f2f3f5' }} autoSize={{ minRows: 2, maxRows: 6 }} />
                </div>

                <div>
                  <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>备注</h4>
                  <Input.TextArea value={remark} onChange={e => setRemark(e.target.value)}
                    placeholder="可选备注信息" style={{ background: '#f7f8fa', borderColor: '#f2f3f5' }}
                    autoSize={{ minRows: 2, maxRows: 4 }} />
                </div>
              </Card>
            )},

            { key: 'api', label: <span><ApiOutlined style={{ marginRight: 4, color: hasApi ? '#1890ff' : undefined }} />接口测试{hasApi && <span style={{ fontSize: 11, color: '#1890ff', marginLeft: 4 }}>({apiScenario?.steps?.length || 0}步)</span>}</span>, children: (
              <ScenarioEditor
                scenario={apiScenario} setScenario={setApiScenario}
                scenarioStatus={apiScenarioStatus} setScenarioStatus={setApiScenarioStatus}
                isTemplate={isApiTemplate} setIsTemplate={setIsApiTemplate}
                type="api" accentColor="#1890ff"
                onImportTemplate={() => { setTemplateModalType('api'); setTemplateModalOpen(true) }}
                manualSteps={steps} caseTitle={title}
                projectId={projectId} branchId={branchId} caseId={caseId}
              />
            )},

            { key: 'ui', label: <span><DesktopOutlined style={{ marginRight: 4, color: hasUi ? '#722ed1' : undefined }} />UI 测试{hasUi && <span style={{ fontSize: 11, color: '#722ed1', marginLeft: 4 }}>({uiScenario?.steps?.length || 0}步)</span>}</span>, children: (
              <ScenarioEditor
                scenario={uiScenario} setScenario={setUiScenario}
                scenarioStatus={uiScenarioStatus} setScenarioStatus={setUiScenarioStatus}
                isTemplate={isUiTemplate} setIsTemplate={setIsUiTemplate}
                type="e2e" accentColor="#722ed1"
                onImportTemplate={() => { setTemplateModalType('ui'); setTemplateModalOpen(true) }}
                manualSteps={steps} caseTitle={title}
                projectId={projectId} branchId={branchId} caseId={caseId}
              />
            )},

            { key: 'history', label: '执行历史', children: (
              <Card styles={{ body: { padding: '16px 24px' } }}>
                <div style={{ color: '#86909c', textAlign: 'center', padding: 24 }}>暂无执行记录</div>
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
                  const newFlaky = !flaky; setFlaky(newFlaky)
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
                    message.success('已归档'); navigate(-1)
                  } catch { message.error('归档失败') }
                }}>归档</Button>
            </Space>
          </Card>

          {/* 依赖参数 */}
          <Card styles={{ body: { padding: 16 } }}>
            <h4 style={{ fontSize: 13, color: '#86909c', marginBottom: 8 }}>依赖参数</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {variablesUsed.map((v, i) => (
                <Tag key={i} closable onClose={() => setVariablesUsed(prev => prev.filter((_, j) => j !== i))}
                  style={{ fontFamily: 'monospace', fontSize: 11, background: '#f0f5ff', border: '1px solid #adc6ff', color: '#1d39c4', borderRadius: 4, padding: '1px 6px' }}>
                  {v}
                </Tag>
              ))}
              {variablesUsed.length === 0 && <span style={{ fontSize: 12, color: '#c9cdd4' }}>暂无</span>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Input value={newVarInput} onChange={e => setNewVarInput(e.target.value)} size="small"
                placeholder="参数名" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                onKeyDown={e => { if (e.key === 'Enter' && newVarInput.trim()) { setVariablesUsed(prev => [...prev, newVarInput.trim()]); setNewVarInput('') } }} />
              <Button size="small" icon={<PlusOutlined />} disabled={!newVarInput.trim()}
                onClick={() => { setVariablesUsed(prev => [...prev, newVarInput.trim()]); setNewVarInput('') }} />
            </div>
          </Card>
        </div>
      </div>

      <TemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        projectId={projectId}
        branchId={branchId}
        scenarioType={templateModalType}
        onSelect={(sc) => {
          if (templateModalType === 'api') {
            setApiScenario(sc)
            setApiScenarioStatus('draft')
          } else {
            setUiScenario(sc)
            setUiScenarioStatus('draft')
          }
          message.success('模板已导入，记得保存')
        }}
      />

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
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#86909c' }}>单条用例执行请通过测试计划</div>
        </div>
      </Modal>
    </div>
  )
}
