import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button, Radio, Input, Tag, Progress, Modal, message, Tooltip, Badge,
} from 'antd'
import {
  ArrowLeftOutlined, CheckCircleFilled, CloseCircleFilled,
  ClockCircleOutlined, UserOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import { mockManualCases, mockPlans } from '../../mock/data'

const PRIORITY_CONFIG = {
  P0: { color: '#f08a8e', bg: '#fef0f1' },
  P1: { color: '#f5b87a', bg: '#fef5eb' },
  P2: { color: '#6b7ef5', bg: '#eef0fe' },
  P3: { color: '#bfc4cd', bg: '#f5f5f7' },
}

const FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '待录入', value: 'pending' },
  { label: '已通过', value: 'passed' },
  { label: '已失败', value: 'failed' },
]

export default function ManualRecord() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const plan = mockPlans.find(p => p.id === planId) || mockPlans[2] // 默认取手动计划

  const [cases, setCases] = useState(mockManualCases)
  const [selectedId, setSelectedId] = useState(mockManualCases[0]?.id)
  const [filter, setFilter] = useState('all')

  const filteredCases = useMemo(() => {
    if (filter === 'all') return cases
    if (filter === 'pending') return cases.filter(c => !c.result)
    if (filter === 'passed') return cases.filter(c => c.result === 'passed')
    if (filter === 'failed') return cases.filter(c => c.result === 'failed')
    return cases
  }, [cases, filter])

  const selectedCase = cases.find(c => c.id === selectedId)
  const recordedCount = cases.filter(c => c.result).length
  const totalCount = cases.length
  const allRecorded = recordedCount === totalCount

  const updateCase = (id, updates) => {
    setCases(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  const handleSaveAndNext = () => {
    if (!selectedCase?.result) {
      message.warning('请先选择测试结果')
      return
    }
    message.success('已保存')
    // 跳转到下一条待录入用例
    const pendingCases = cases.filter(c => !c.result && c.id !== selectedId)
    if (pendingCases.length > 0) {
      setSelectedId(pendingCases[0].id)
    }
  }

  const handleComplete = () => {
    if (!allRecorded) {
      message.warning(`还有 ${totalCount - recordedCount} 条用例未录入`)
      return
    }
    Modal.confirm({
      title: '确认完成',
      icon: <ExclamationCircleOutlined />,
      content: `共 ${totalCount} 条用例已全部录入，确认完成后计划状态将变为"已完成"。`,
      okText: '确认完成',
      cancelText: '取消',
      onOk: () => {
        message.success('计划已完成')
        navigate(-1)
      },
    })
  }

  const getStatusIcon = (result) => {
    if (result === 'passed') return <CheckCircleFilled style={{ color: '#6ecf96', fontSize: 16 }} />
    if (result === 'failed') return <CloseCircleFilled style={{ color: '#f08a8e', fontSize: 16 }} />
    return <ClockCircleOutlined style={{ color: '#bfc4cd', fontSize: 16 }} />
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      {/* 顶栏 */}
      <div style={{
        height: 54, background: '#fff', borderBottom: '1px solid #f0f0f3',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#2e3138' }}>{plan.name}</span>
          <Tag color="blue" style={{ borderRadius: 10 }}>手动录入</Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#8c919e' }}>已录入</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#2e3138' }}>
              {recordedCount}/{totalCount}
            </span>
            <Progress
              percent={Math.round(recordedCount / totalCount * 100)}
              size="small"
              style={{ width: 120, marginBottom: 0 }}
              strokeColor="#6b7ef5"
            />
          </div>
          <Button
            type="primary"
            disabled={!allRecorded}
            onClick={handleComplete}
          >
            确认完成
          </Button>
        </div>
      </div>

      {/* 主内容 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧用例列表 */}
        <div style={{
          width: 320, background: '#fff', borderRight: '1px solid #f0f0f3',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {/* 筛选 */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f3' }}>
            <Radio.Group
              value={filter}
              onChange={e => setFilter(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
              options={FILTER_OPTIONS}
            />
          </div>
          {/* 列表 */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filteredCases.map(c => (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f8f8fa',
                  background: selectedId === c.id ? '#f0f4ff' : 'transparent',
                  borderLeft: selectedId === c.id ? '3px solid #6b7ef5' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {getStatusIcon(c.result)}
                  <span style={{
                    fontSize: 13, fontWeight: 500, color: '#2e3138',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.title}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 24 }}>
                  <span style={{ fontSize: 11, color: '#bfc4cd' }}>{c.caseId}</span>
                  <Tag style={{
                    fontSize: 11, lineHeight: '18px', padding: '0 6px',
                    color: PRIORITY_CONFIG[c.priority]?.color,
                    background: PRIORITY_CONFIG[c.priority]?.bg,
                  }}>{c.priority}</Tag>
                  {c.assignee && (
                    <Tooltip title={`处理人: ${c.assignee}`}>
                      <span style={{ fontSize: 11, color: '#8c919e' }}>
                        <UserOutlined style={{ marginRight: 2 }} />{c.assignee}
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
            {filteredCases.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#bfc4cd', fontSize: 13 }}>
                暂无用例
              </div>
            )}
          </div>
        </div>

        {/* 右侧详情 + 录入 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
          {selectedCase ? (
            <>
              {/* 标题区 */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#8c919e' }}>{selectedCase.caseId}</span>
                  <Tag style={{
                    fontSize: 11, lineHeight: '18px', padding: '0 6px',
                    color: PRIORITY_CONFIG[selectedCase.priority]?.color,
                    background: PRIORITY_CONFIG[selectedCase.priority]?.bg,
                  }}>{selectedCase.priority}</Tag>
                  <Tag style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', color: '#8c919e', background: '#f5f5f7' }}>
                    {selectedCase.module} / {selectedCase.subModule}
                  </Tag>
                  {selectedCase.assignee && (
                    <Tag icon={<UserOutlined />} style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', color: '#6b7ef5', background: '#eef0fe' }}>
                      {selectedCase.assignee}
                    </Tag>
                  )}
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#2e3138', margin: 0 }}>
                  {selectedCase.title}
                </h2>
              </div>

              {/* 前置条件 */}
              <Section title="前置条件">
                <div style={{ fontSize: 13, color: '#555a65', whiteSpace: 'pre-line', lineHeight: 1.8 }}>
                  {selectedCase.preconditions}
                </div>
              </Section>

              {/* 操作步骤 */}
              <Section title="操作步骤">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedCase.steps.map(step => (
                    <div key={step.seq} style={{
                      display: 'flex', gap: 12, padding: '10px 14px',
                      background: '#fafafc', borderRadius: 8, border: '1px solid #f0f0f3',
                    }}>
                      <Badge
                        count={step.seq}
                        style={{ background: '#6b7ef5', fontSize: 11, minWidth: 22, height: 22, lineHeight: '22px' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: '#2e3138', fontWeight: 500 }}>{step.action}</div>
                        <div style={{ fontSize: 12, color: '#8c919e', marginTop: 4 }}>
                          预期: {step.expected}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* 预期结果 */}
              <Section title="预期结果">
                <div style={{
                  fontSize: 13, color: '#555a65', padding: '10px 14px',
                  background: '#eef0fe', borderRadius: 8, border: '1px solid #d8dcf8',
                }}>
                  {selectedCase.expectedResult}
                </div>
              </Section>

              {/* 录入表单 */}
              <div style={{
                marginTop: 24, padding: '20px 24px',
                background: '#fff', borderRadius: 10,
                border: '1px solid #e8e8ec',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2e3138', marginBottom: 16 }}>
                  录入结果
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#555a65', marginBottom: 8 }}>测试结果</div>
                  <Radio.Group
                    value={selectedCase.result}
                    onChange={e => updateCase(selectedCase.id, { result: e.target.value })}
                    size="large"
                  >
                    <Radio.Button value="passed" style={{
                      borderRadius: '8px 0 0 8px',
                      ...(selectedCase.result === 'passed' ? { background: '#eefbf3', borderColor: '#6ecf96', color: '#4db878' } : {}),
                    }}>
                      <CheckCircleFilled style={{ marginRight: 4 }} /> 通过
                    </Radio.Button>
                    <Radio.Button value="failed" style={{
                      borderRadius: '0 8px 8px 0',
                      ...(selectedCase.result === 'failed' ? { background: '#fef0f1', borderColor: '#f08a8e', color: '#e06b70' } : {}),
                    }}>
                      <CloseCircleFilled style={{ marginRight: 4 }} /> 失败
                    </Radio.Button>
                  </Radio.Group>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: '#555a65', marginBottom: 8 }}>备注（可选）</div>
                  <Input.TextArea
                    value={selectedCase.remark}
                    onChange={e => updateCase(selectedCase.id, { remark: e.target.value })}
                    placeholder="填写测试过程中的发现或问题描述..."
                    rows={3}
                    style={{ resize: 'none' }}
                  />
                </div>
                <Button type="primary" onClick={handleSaveAndNext} block style={{ height: 40 }}>
                  保存并下一条
                </Button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 80, color: '#bfc4cd' }}>
              请从左侧选择一条用例
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8c919e', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}
