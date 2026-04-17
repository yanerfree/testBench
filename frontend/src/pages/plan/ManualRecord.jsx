import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Radio, Input, Tag, Progress, Modal, message, Tooltip, Badge, Spin } from 'antd'
import { ArrowLeftOutlined, CheckCircleFilled, CloseCircleFilled, ClockCircleOutlined, UserOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { api } from '../../utils/request'

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
  const { projectId, planId } = useParams()
  const navigate = useNavigate()

  const [plan, setPlan] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState(false)

  // 本地编辑状态（result + remark）
  const [localEdits, setLocalEdits] = useState({})

  const fetchData = useCallback(async () => {
    if (!projectId || !planId) return
    setLoading(true)
    try {
      const [planRes, resultsRes] = await Promise.all([
        api.get(`/projects/${projectId}/plans/${planId}`),
        api.get(`/projects/${projectId}/plans/${planId}/results`),
      ])
      setPlan(planRes.data)
      if (resultsRes.data) {
        const list = resultsRes.data.scenarios || []
        setScenarios(list)
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id)
        }
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, planId])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredCases = useMemo(() => {
    if (filter === 'all') return scenarios
    return scenarios.filter(s => {
      const edit = localEdits[s.id]
      const status = edit?.result || s.status
      if (filter === 'pending') return status === 'pending'
      return status === filter
    })
  }, [scenarios, filter, localEdits])

  const selected = scenarios.find(s => s.id === selectedId)
  const selectedEdit = selectedId ? (localEdits[selectedId] || {}) : {}

  const getEffectiveStatus = (s) => localEdits[s.id]?.result || s.status

  const recordedCount = scenarios.filter(s => getEffectiveStatus(s) !== 'pending').length
  const totalCount = scenarios.length
  const allRecorded = totalCount > 0 && recordedCount === totalCount

  const updateLocalEdit = (id, updates) => {
    setLocalEdits(prev => ({ ...prev, [id]: { ...prev[id], ...updates } }))
  }

  const handleSaveAndNext = async () => {
    const result = selectedEdit.result
    if (!result) {
      message.warning('请先选择测试结果')
      return
    }
    setSaving(true)
    try {
      await api.post(`/projects/${projectId}/plans/${planId}/manual-record`, {
        scenarioId: selectedId,
        status: result,
        remark: selectedEdit.remark || null,
      })
      // 更新本地 scenario 状态
      setScenarios(prev => prev.map(s => s.id === selectedId ? { ...s, status: result, remark: selectedEdit.remark } : s))
      message.success('已保存')

      // 跳转到下一条待录入
      const pending = scenarios.filter(s => s.id !== selectedId && getEffectiveStatus(s) === 'pending')
      if (pending.length > 0) {
        setSelectedId(pending[0].id)
      }
    } catch { /* */ } finally { setSaving(false) }
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
      onOk: async () => {
        try {
          await api.post(`/projects/${projectId}/plans/${planId}/complete`)
          message.success('计划已完成')
          navigate(-1)
        } catch { /* */ }
      },
    })
  }

  const getStatusIcon = (s) => {
    const status = getEffectiveStatus(s)
    if (status === 'passed') return <CheckCircleFilled style={{ color: '#6ecf96', fontSize: 16 }} />
    if (status === 'failed') return <CloseCircleFilled style={{ color: '#f08a8e', fontSize: 16 }} />
    return <ClockCircleOutlined style={{ color: '#bfc4cd', fontSize: 16 }} />
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      {/* 顶栏 */}
      <div style={{ height: 54, background: '#fff', borderBottom: '1px solid #f0f0f3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#2e3138' }}>{plan?.name || '手动录入'}</span>
          <Tag color="blue" style={{ borderRadius: 10 }}>手动录入</Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#8c919e' }}>已录入</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#2e3138' }}>{recordedCount}/{totalCount}</span>
            {totalCount > 0 && <Progress percent={Math.round(recordedCount / totalCount * 100)} size="small" style={{ width: 120, marginBottom: 0 }} strokeColor="#6b7ef5" />}
          </div>
          <Button type="primary" disabled={!allRecorded} onClick={handleComplete}>确认完成</Button>
        </div>
      </div>

      {/* 主内容 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧列表 */}
        <div style={{ width: 320, background: '#fff', borderRight: '1px solid #f0f0f3', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f3' }}>
            <Radio.Group value={filter} onChange={e => setFilter(e.target.value)} optionType="button" buttonStyle="solid" size="small" options={FILTER_OPTIONS} />
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {filteredCases.map(s => (
              <div key={s.id} onClick={() => setSelectedId(s.id)} style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8f8fa',
                background: selectedId === s.id ? '#f0f4ff' : 'transparent',
                borderLeft: selectedId === s.id ? '3px solid #6b7ef5' : '3px solid transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {getStatusIcon(s)}
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#2e3138', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.scenarioName}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 24 }}>
                  <span style={{ fontSize: 11, color: '#bfc4cd' }}>{s.caseCode}</span>
                </div>
              </div>
            ))}
            {filteredCases.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#bfc4cd', fontSize: 13 }}>暂无用例</div>}
          </div>
        </div>

        {/* 右侧录入 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
          {selected ? (<>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#8c919e' }}>{selected.caseCode}</span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#2e3138', margin: 0 }}>{selected.scenarioName}</h2>
            </div>

            {/* 录入表单 */}
            <div style={{ marginTop: 24, padding: '20px 24px', background: '#fff', borderRadius: 10, border: '1px solid #e8e8ec' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#2e3138', marginBottom: 16 }}>录入结果</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#555a65', marginBottom: 8 }}>测试结果</div>
                <Radio.Group value={selectedEdit.result || (selected.status !== 'pending' ? selected.status : undefined)} onChange={e => updateLocalEdit(selected.id, { result: e.target.value })} size="large">
                  <Radio.Button value="passed" style={{ borderRadius: '8px 0 0 8px', ...((selectedEdit.result || selected.status) === 'passed' ? { background: '#eefbf3', borderColor: '#6ecf96', color: '#4db878' } : {}) }}>
                    <CheckCircleFilled style={{ marginRight: 4 }} /> 通过
                  </Radio.Button>
                  <Radio.Button value="failed" style={{ borderRadius: '0 8px 8px 0', ...((selectedEdit.result || selected.status) === 'failed' ? { background: '#fef0f1', borderColor: '#f08a8e', color: '#e06b70' } : {}) }}>
                    <CloseCircleFilled style={{ marginRight: 4 }} /> 失败
                  </Radio.Button>
                </Radio.Group>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: '#555a65', marginBottom: 8 }}>备注（可选）</div>
                <Input.TextArea value={selectedEdit.remark ?? selected.remark ?? ''} onChange={e => updateLocalEdit(selected.id, { remark: e.target.value })} placeholder="填写测试过程中的发现或问题描述..." rows={3} style={{ resize: 'none' }} />
              </div>
              <Button type="primary" onClick={handleSaveAndNext} loading={saving} block style={{ height: 40 }}>保存并下一条</Button>
            </div>
          </>) : (
            <div style={{ textAlign: 'center', padding: 80, color: '#bfc4cd' }}>请从左侧选择一条用例</div>
          )}
        </div>
      </div>
    </div>
  )
}
