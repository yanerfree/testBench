import { useState } from 'react'
import { Button, Tag, Space, Select, Tooltip, Typography, Input, Drawer, Spin, Dropdown, message } from 'antd'
import {
  PlusOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlayCircleOutlined, CaretRightOutlined, RobotOutlined, MoreOutlined, CopyOutlined, BranchesOutlined,
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
  return (
    <div style={{ width: 300, minWidth: 300, borderRight: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
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
          <Space size={4}>
            {!readonly && (
              <Tooltip title="AI 优化">
                <Button size="small" type="text" icon={<RobotOutlined style={{ color: '#4e8af0' }} />}
                  onClick={() => { setOptimizeOpen(true); setPlan(null); setSuggestion('') }} />
              </Tooltip>
            )}
            <Tooltip title="运行全部">
              <Button size="small" type="text" icon={<PlayCircleOutlined style={{ color: '#0ea5a0' }} />} onClick={onRunAll} />
            </Tooltip>
            <Dropdown menu={{ items: [
              { key: 'copy', icon: <CopyOutlined />, label: '复制场景' },
              ...(!readonly ? [{ key: 'split', icon: <CopyOutlined />, label: '拆分步骤' }] : []),
              ...(scenario.status === 'published' ? [{ key: 'newVersion', icon: <BranchesOutlined />, label: '更新版本' }] : []),
            ], onClick: ({ key }) => {
              if (key === 'copy') onCopyScenario()
              if (key === 'newVersion') onNewVersion()
              if (key === 'split') { setSplitMode(true); setSplitSelected(new Set()) }
            }}} trigger={['click']}>
              <Button size="small" type="text" icon={<MoreOutlined />} />
            </Dropdown>
            <Tooltip title="返回列表">
              <Button size="small" type="text" onClick={onClose}>✕</Button>
            </Tooltip>
          </Space>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>{scenario.title}</Text>
        <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
          {scenario.steps?.length || 0} 个步骤
        </div>
        {environments?.length > 0 && (
          <Select size="small" value={envId} onChange={onEnvChange} allowClear
            placeholder="选择环境" style={{ width: '100%', marginTop: 4 }} variant="borderless"
            options={environments.map(e => ({ value: e.id, label: e.name }))} />
        )}
        {splitMode && (
          <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
            <Button size="small" type="primary" disabled={splitSelected.size === 0}
              onClick={() => { onSplitScenario?.([...splitSelected]); setSplitMode(false) }}>
              拆分选中 ({splitSelected.size})
            </Button>
            <Button size="small" onClick={() => setSplitMode(false)}>取消</Button>
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {(scenario.steps || []).map((step, i) => {
          const isSelected = selectedStepId === step.id
          const showGroup = step.groupName && (i === 0 || scenario.steps[i-1]?.groupName !== step.groupName)
          return (
            <div key={step.id}>
              {showGroup && (
                <div style={{ padding: '4px 12px', fontSize: 11, color: '#8c8c8c', background: 'rgba(255,255,255,0.3)' }}>
                  <CaretRightOutlined style={{ marginRight: 4 }} /> Group  {step.groupName}
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
                    style={{ marginRight: 4 }} />
                )}
                {step.lastStatus === 'pass' ? <CheckCircleOutlined style={{ color: '#0ea5a0', fontSize: 12 }} /> :
                 step.lastStatus === 'fail' ? <CloseCircleOutlined style={{ color: '#e8453c', fontSize: 12 }} /> :
                 <span style={{ width: 12, height: 12, borderRadius: 6, border: '1.5px solid rgba(0,0,0,0.15)', display: 'inline-block', flexShrink: 0 }} />}
                <Tag color={METHOD_COLORS[step.method]} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                  {step.method}
                </Tag>
                <span style={{ fontSize: 12, flex: 1 }}>
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
