import { useState } from 'react'
import { Button, Tag, Space, Modal } from 'antd'
import {
  PlusOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CaretRightOutlined, ScissorOutlined,
} from '@ant-design/icons'

const METHOD_COLORS = { GET: '#0ea5a0', POST: '#0ea5a0', PUT: '#faad14', DELETE: '#e8453c', PATCH: '#7c5cbf' }

export default function StepList({
  scenario, selectedStepId, readonly,
  onSelectStep, onAddStep, onReorderSteps,
  splitMode, onSplitModeChange, onSplitScenario,
}) {
  const [splitSelected, setSplitSelected] = useState(new Set())
  const [dragIdx, setDragIdx] = useState(null)

  const handleSplit = () => {
    if (splitSelected.size === 0) return
    Modal.confirm({
      title: '确认拆分',
      content: `将选中的 ${splitSelected.size} 个步骤拆分为一个新场景？原场景保留未选中的步骤。`,
      okText: '确认拆分',
      cancelText: '取消',
      onOk: () => { onSplitScenario?.([...splitSelected]); onSplitModeChange?.(false); setSplitSelected(new Set()) },
    })
  }

  return (
    <div style={{ width: 280, minWidth: 280, borderRight: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', background: 'transparent' }}>

      {/* 拆分模式提示 */}
      {splitMode && (
        <div style={{ padding: '8px 12px', background: 'rgba(14,165,160,0.06)', borderBottom: '1px solid rgba(14,165,160,0.3)', fontSize: 12, flexShrink: 0 }}>
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
            <Button size="small" onClick={() => { onSplitModeChange?.(false); setSplitSelected(new Set()) }}>取消</Button>
          </Space>
        </div>
      )}

      {/* 步骤列表 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '6px 12px 2px', fontSize: 11, color: '#8c8c8c' }}>
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
                  padding: '6px 12px', cursor: 'pointer',
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
    </div>
  )
}
