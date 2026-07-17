import { useState, useEffect } from 'react'
import { Modal, Button, Progress, Tag, Space, Select, message } from 'antd'
import { ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { api } from '../utils/request'
import { useEnv } from '../utils/env'

export default function AIScriptModal({
  projectId,
  branchId,
  caseIds,
  open,
  onClose,
}) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [cases, setCases] = useState([])
  const [envId, setEnvId] = useEnv(projectId)
  const [environments, setEnvironments] = useState([])

  useEffect(() => {
    if (open && projectId) {
      api.get('/environments').then(res => setEnvironments(res.data || [])).catch(() => {})
    }
  }, [open, projectId])

  useEffect(() => {
    if (open && caseIds?.length > 0 && branchId) {
      Promise.all(caseIds.map(id =>
        api.get(`/projects/${projectId}/branches/${branchId}/cases/${id}`).then(res => res.data).catch(() => null)
      )).then(data => setCases(data.filter(Boolean)))
    }
  }, [open, caseIds, branchId])

  const handleGenerate = async () => {
    if (!envId) { message.warning('请先选择执行环境'); return }
    setRunning(true)
    setResults([])
    const token = localStorage.getItem('token')

    for (let i = 0; i < caseIds.length; i++) {
      const caseId = caseIds[i]
      const caseName = cases[i]?.title || caseId
      setCurrentIdx(i)
      setResults(prev => [...prev, { caseId, name: caseName, status: 'running' }])

      try {
        const url = `/api/projects/${projectId}/branches/${branchId}/cases/${caseId}/scripts/generate-stream?type=ui`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ envId }),
        })
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finalResult = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          while (buffer.includes('\n\n')) {
            const [eventText, rest] = buffer.split('\n\n', 2)
            buffer = rest
            const lines = eventText.trim().split('\n')
            let etype = null, data = null
            for (const line of lines) {
              if (line.startsWith('event: ')) etype = line.slice(7)
              else if (line.startsWith('data: ')) data = line.slice(6)
            }
            if (etype === 'done' && data) {
              finalResult = JSON.parse(data)
            }
          }
        }

        setResults(prev => prev.map((r, j) =>
          j === i ? { ...r, status: finalResult?.all_passed ? 'passed' : 'failed', steps: finalResult?.results?.length || 0 } : r
        ))
      } catch (e) {
        setResults(prev => prev.map((r, j) =>
          j === i ? { ...r, status: 'error', error: e.message } : r
        ))
      }
    }

    setCurrentIdx(-1)
    setRunning(false)
    message.success('批量生成完成')
  }

  const retryFailed = async () => {
    const failedCases = results.filter(r => r.status === 'failed' || r.status === 'error')
    if (!failedCases.length) return
    setRunning(true)
    const token = localStorage.getItem('token')
    for (const fc of failedCases) {
      const idx = results.findIndex(r => r.caseId === fc.caseId)
      setResults(prev => prev.map((r, j) => j === idx ? { ...r, status: 'running' } : r))
      try {
        const url = `/api/projects/${projectId}/branches/${branchId}/cases/${fc.caseId}/scripts/generate-stream?type=ui`
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ envId }),
        })
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = '', finalResult = null
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          while (buffer.includes('\n\n')) {
            const [eventText, rest] = buffer.split('\n\n', 2)
            buffer = rest
            const lines = eventText.trim().split('\n')
            let etype = null, data = null
            for (const line of lines) {
              if (line.startsWith('event: ')) etype = line.slice(7)
              else if (line.startsWith('data: ')) data = line.slice(6)
            }
            if (etype === 'done' && data) finalResult = JSON.parse(data)
          }
        }
        setResults(prev => prev.map((r, j) =>
          j === idx ? { ...r, status: finalResult?.all_passed ? 'passed' : 'failed', steps: finalResult?.results?.length || 0 } : r
        ))
      } catch (e) {
        setResults(prev => prev.map((r, j) =>
          j === idx ? { ...r, status: 'error', error: e.message } : r
        ))
      }
    }
    setRunning(false)
    message.success('重试完成')
  }

  const passed = results.filter(r => r.status === 'passed').length
  const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length
  const total = caseIds?.length || 0

  return (
    <Modal
      title={`AI 生成 UI 脚本 (${total} 个用例)`}
      open={open}
      onCancel={running ? undefined : onClose}
      footer={null}
      width={600}
      closable={!running}
      maskClosable={!running}
    >
      {!running && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ marginBottom: 16, color: '#4e5969' }}>
            将为 {total} 个用例逐一生成 Playwright UI 测试脚本
          </div>
          <Space>
            <Select value={envId} onChange={setEnvId} style={{ width: 180 }}
              placeholder="选择执行环境" options={environments.map(e => ({ value: e.id, label: e.name }))} />
            <Button type="primary" icon={<ThunderboltOutlined />}
              disabled={!envId} onClick={handleGenerate}
              style={{ background: '#7c5cbf', borderColor: '#7c5cbf' }}>
              开始生成
            </Button>
          </Space>
        </div>
      )}

      {(running || results.length > 0) && (
        <div>
          <Progress
            percent={Math.round(((passed + failed) / total) * 100)}
            status={running ? 'active' : failed > 0 ? 'exception' : 'success'}
            format={() => `${passed + failed}/${total}`}
            style={{ marginBottom: 16 }}
          />
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 8, background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
              }}>
                {r.status === 'running' ? (
                  <span style={{ color: '#7c5cbf', fontSize: 16 }}>⏳</span>
                ) : r.status === 'passed' ? (
                  <CheckCircleOutlined style={{ color: '#0ea5a0', fontSize: 16 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#e8453c', fontSize: 16 }} />
                )}
                <span style={{ flex: 1, fontSize: 13 }}>{r.name}</span>
                {r.steps > 0 && <span style={{ fontSize: 11, color: '#86909c' }}>{r.steps}步</span>}
                <Tag color={r.status === 'passed' ? 'cyan' : r.status === 'running' ? 'purple' : 'error'} style={{ margin: 0 }}>
                  {r.status === 'running' ? '生成中...' : r.status === 'passed' ? '通过' : '失败'}
                </Tag>
              </div>
            ))}
          </div>
          {!running && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Space>
                <span style={{ color: '#0ea5a0', fontWeight: 600 }}>{passed} 通过</span>
                {failed > 0 && <span style={{ color: '#e8453c', fontWeight: 600 }}>{failed} 失败</span>}
                {failed > 0 && <Button type="primary" onClick={retryFailed}
                  style={{ background: '#7c5cbf', borderColor: '#7c5cbf' }}>重试失败</Button>}
                <Button onClick={onClose}>关闭</Button>
              </Space>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
