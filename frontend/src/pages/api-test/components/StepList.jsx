import { useState } from 'react'
import { Button, Tag, Space, Select, Tooltip, Typography, Input, Drawer, Dropdown, Modal, message } from 'antd'
import {
  PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, CloseOutlined,
  PlayCircleOutlined, CaretRightOutlined, RobotOutlined, CopyOutlined, BranchesOutlined, ScissorOutlined,
} from '@ant-design/icons'

const { Text } = Typography
const { TextArea } = Input
const METHOD_COLORS = { GET: '#0ea5a0', POST: '#0ea5a0', PUT: '#faad14', DELETE: '#e8453c', PATCH: '#7c5cbf' }

export default function StepList({
  scenario, selectedStepId, readonly,
  onSelectStep, onAddStep, onClose, onSaveScenario, onRunAll,
  onAiOptimize, onApplyOptimize, onCopyScenario, onNewVersion, onSplitScenario, onReorderSteps,
  environments, envId, onEnvChange,
}) {
  const [optimizeOpen, setOptimizeOpen] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [plan, setPlan] = useState(null)
  const [splitMode, setSplitMode] = useState(false)
  const [splitSelected, setSplitSelected] = useState(new Set())
  const [dragIdx, setDragIdx] = useState(null)

  const handleSplit = () => {
    if (splitSelected.size === 0) return
    Modal.confirm({
      title: '确认拆分',
      content: `将选中的 ${splitSelected.size} 个步骤拆分为一个新场景？原场景保留未选中的步骤。`,
      okText: '确认拆分',
      cancelText: '取消',
      onOk: () => { onSplitScenario?.([...splitSelected]); setSplitMode(false); setSplitSelected(new Set()) },
    })
  }

  return (
    <div style={{ width: 300, minWidth: 300, borderRight: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>

      {/* ── 顶部：场景信息 + 关闭 ── */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={4}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{scenario.code}</span>
            <Tag color={scenario.source === 'ai' ? 'blue' : 'default'} style={{ fontSize: 10 }}>
              {scenario.source === 'ai' ? 'AI' : '手动'}
            </Tag>
            <Select size="small" value={scenario.status} onChange={v => onSaveScenario({ status: v })}
              style={{ fontSize: 11 }} variant="borderless"
              options={[
                { value: 'draft', label: <Tag>草稿</Tag> },
                { value: 'published', label: <Tag color="#0ea5a0">已发布</Tag> },
                { value: 'deprecated', label: <Tag color="default">已废弃</Tag> },
              ]}
            />
          </Space>
          <Tooltip title="返回列表">
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
          </Tooltip>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>{scenario.title}</Text>
      </div>

      {/* ── 场景级操作工具栏 ── */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tooltip title="运行全部步骤">
          <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={onRunAll}>运行</Button>
        </Tooltip>
        {!readonly && (
          <Tooltip title="AI 分析并优化步骤">
            <Button size="small" icon={<RobotOutlined />}
              onClick={() => { setOptimizeOpen(true); setPlan(null); setSuggestion('') }}>AI 优化</Button>
          </Tooltip>
        )}
        <Tooltip title="复制为新的草稿场景">
          <Button size="small" icon={<CopyOutlined />} onClick={onCopyScenario}>复制</Button>
        </Tooltip>
        {!readonly && (
          <Tooltip title="选择部分步骤拆分为新场景">
            <Button size="small" icon={<ScissorOutlined />}
              type={splitMode ? 'primary' : 'default'}
              onClick={() => { if (splitMode) { setSplitMode(false); setSplitSelected(new Set()) } else { setSplitMode(true); setSplitSelected(new Set()) } }}>
              拆分
            </Button>
          </Tooltip>
        )}
        {scenario.status === 'published' && (
          <Tooltip title="基于当前版本创建新草稿">
            <Button size="small" icon={<BranchesOutlined />} onClick={onNewVersion}>更新版本</Button>
          </Tooltip>
        )}
      </div>

      {/* ── 环境选择 ── */}
      {environments?.length > 0 && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <Select size="small" value={envId} onChange={onEnvChange} allowClear
            placeholder="选择运行环境"
            style={{ width: '100%' }}
            options={environments.map(e => ({ value: e.id, label: e.name }))} />
        </div>
      )}

      {/* ── 拆分模式提示 ── */}
      {splitMode && (
        <div style={{ padding: '8px 12px', background: '#e6fffb', borderBottom: '1px solid #87e8de', fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#0ea5a0' }}>
            <ScissorOutlined /> 拆分模式
          </div>
          <div style={{ color: '#595959', marginBottom: 6 }}>
            勾选要拆分到新场景的步骤，未勾选的留在当前场景。
          </div>
          <Space size={8}>
            <Button size="small" type="primary" disabled={splitSelected.size === 0} onClick={handleSplit}>
              确认拆分 ({splitSelected.size})
            </Button>
            <Button size="small" onClick={() => { setSplitMode(false); setSplitSelected(new Set()) }}>取消</Button>
          </Space>
        </div>
      )}

      {/* ── 步骤列表 ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '4px 12px 0', fontSize: 11, color: '#8c8c8c' }}>
          {scenario.steps?.length || 0} 个步骤
        </div>
        {(scenario.steps || []).map((step, i) => {
          const isSelected = selectedStepId === step.id
          const showGroup = step.groupName && (i === 0 || scenario.steps[i-1]?.groupName !== step.groupName)
          return (
            <div key={step.id}>
              {showGroup && (
                <div style={{ padding: '4px 12px', fontSize: 11, color: '#8c8c8c', background: 'rgba(255,255,255,0.3)' }}>
                  <CaretRightOutlined style={{ marginRight: 4 }} /> {step.groupName}
                </div>
              )}
              <div
                onClick={() => onSelectStep(step)}
                draggable={!readonly && !splitMode}
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderTop = '2px solid #0ea5a0' }}
                onDragLeave={e => { e.currentTarget.style.borderTop = '' }}
                onDrop={e => {
                  e.currentTarget.style.borderTop = ''
                  if (dragIdx === null || dragIdx === i) return
                  const steps = [...(scenario.steps || [])]
                  const [moved] = steps.splice(dragIdx, 1)
                  steps.splice(i, 0, moved)
                  onReorderSteps?.(steps.map(s => s.id))
                  setDragIdx(null)
                }}
                onDragEnd={() => setDragIdx(null)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  background: isSelected ? 'rgba(14,165,160,0.1)' : 'transparent',
                  borderLeft: isSelected ? '3px solid #0ea5a0' : '3px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                {splitMode && (
                  <input type="checkbox" checked={splitSelected.has(step.id)}
                    onChange={e => { e.stopPropagation(); const s = new Set(splitSelected); e.target.checked ? s.add(step.id) : s.delete(step.id); setSplitSelected(s) }}
                    style={{ marginRight: 2, cursor: 'pointer' }} />
                )}
                {step.lastStatus === 'pass' ? <CheckCircleOutlined style={{ color: '#0ea5a0', fontSize: 12 }} /> :
                 step.lastStatus === 'fail' ? <CloseCircleOutlined style={{ color: '#e8453c', fontSize: 12 }} /> :
                 <span style={{ width: 12, height: 12, borderRadius: 6, border: '1.5px solid rgba(0,0,0,0.15)', display: 'inline-block', flexShrink: 0 }} />}
                <Tag color={METHOD_COLORS[step.method]} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                  {step.method}
                </Tag>
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {step.name}
                </span>
              </div>
            </div>
          )
        })}
        <div style={{ padding: '8px 12px' }}>
          {!readonly && <Button type="dashed" size="small" icon={<PlusOutlined />} block style={{ fontSize: 12 }} onClick={onAddStep}>添加步骤</Button>}
        </div>
      </div>

      {/* ── AI 优化抽屉 ── */}
      <Drawer
        title="AI 优化"
        open={optimizeOpen}
        onClose={() => setOptimizeOpen(false)}
        width={420}
        footer={
          plan && plan.changes ? (
            <Space>
              <Button onClick={() => setPlan(null)}>重新分析</Button>
              <Button type="primary" onClick={async () => {
                const result = await onApplyOptimize(plan.changes)
                if (result) {
                  message.success(`已应用 ${result.applied} 项修改`)
                  setOptimizeOpen(false)
                }
              }}>确认执行</Button>
            </Space>
          ) : null
        }
      >
        {!plan ? (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#595959' }}>
              输入你的修改建议，AI 会分析并给出具体方案：
            </div>
            <TextArea
              rows={4}
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
              placeholder="例如：增加中文用户名的测试、把超时时间改为10秒、增加并发测试步骤..."
            />
            <Button
              type="primary"
              icon={<RobotOutlined />}
              loading={optimizing}
              style={{ marginTop: 12 }}
              onClick={async () => {
                if (!suggestion.trim()) return
                setOptimizing(true)
                try {
                  const result = await onAiOptimize(suggestion)
                  setPlan(result)
                } catch { message.error('分析失败') }
                finally { setOptimizing(false) }
              }}
            >
              分析方案
            </Button>
          </>
        ) : plan.error ? (
          <div style={{ color: '#e8453c' }}>{plan.error}</div>
        ) : (
          <>
            <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14 }}>{plan.summary}</div>
            {(plan.changes || []).map((c, i) => (
              <div key={i} style={{
                padding: '8px 12px', marginBottom: 8, borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.06)',
                background: c.action === 'add' ? '#f6ffed' : c.action === 'delete' ? '#fff2f0' : '#e6f4ff',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {c.action === 'add' ? '➕ 新增' : c.action === 'delete' ? '🗑️ 删除' : '✏️ 修改'}
                  {c.step?.name ? ` — ${c.step.name}` : c.stepIndex != null ? ` — 步骤 ${c.stepIndex + 1}` : ''}
                </div>
                {c.reason && <div style={{ fontSize: 11, color: '#8c8c8c' }}>{c.reason}</div>}
                {c.step && c.action !== 'delete' && (
                  <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'monospace', color: '#595959' }}>
                    {c.step.method} {c.step.url?.substring(0, 50)}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </Drawer>
    </div>
  )
}
