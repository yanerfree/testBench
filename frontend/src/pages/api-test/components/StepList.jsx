import { useState } from 'react'
import { Button, Tag, Space, Select, Tooltip, Typography } from 'antd'
import {
  PlusOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlayCircleOutlined, CaretRightOutlined,
} from '@ant-design/icons'

const { Text } = Typography
const METHOD_COLORS = { GET: '#4e8af0', POST: '#0ea5a0', PUT: '#faad14', DELETE: '#e8453c', PATCH: '#7c5cbf' }

export default function StepList({
  scenario, selectedStepId, readonly,
  onSelectStep, onAddStep, onClose, onSaveScenario,
}) {
  return (
    <div style={{ width: 300, minWidth: 300, borderRight: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
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
                { value: 'published', label: <Tag color="success">已发布</Tag> },
                { value: 'deprecated', label: <Tag color="default">已废弃</Tag> },
              ]}
            />
          </Space>
          <Space size={4}>
            <Tooltip title="运行全部">
              <Button size="small" type="text" icon={<PlayCircleOutlined style={{ color: '#0ea5a0' }} />} />
            </Tooltip>
            <Tooltip title="返回列表">
              <Button size="small" type="text" onClick={onClose}>✕</Button>
            </Tooltip>
          </Space>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>{scenario.title}</Text>
        <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
          {scenario.steps?.length || 0} 个步骤
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {(scenario.steps || []).map((step, i) => {
          const isSelected = selectedStepId === step.id
          const showGroup = step.groupName && (i === 0 || scenario.steps[i-1]?.groupName !== step.groupName)
          return (
            <div key={step.id}>
              {showGroup && (
                <div style={{ padding: '4px 12px', fontSize: 11, color: '#8c8c8c', background: '#f6f7f9' }}>
                  <CaretRightOutlined style={{ marginRight: 4 }} /> Group  {step.groupName}
                </div>
              )}
              <div
                onClick={() => onSelectStep(step)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  background: isSelected ? '#e6f4ff' : 'transparent',
                  borderLeft: isSelected ? '3px solid #4e8af0' : '3px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
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
    </div>
  )
}
