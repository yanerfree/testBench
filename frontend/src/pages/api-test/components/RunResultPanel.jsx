import { useState } from 'react'
import { Tag, Button, Space, Tooltip, Spin } from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, CloseOutlined, LoadingOutlined,
  RightOutlined, DownOutlined, FileTextOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const METHOD_COLORS = { GET: '#0ea5a0', POST: '#0ea5a0', PUT: '#faad14', DELETE: '#e8453c', PATCH: '#7c5cbf' }

function fmt(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function JsonBlock({ data }) {
  if (!data) return <span style={{ color: '#c9cdd4', fontSize: 12 }}>无数据</span>
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return (
    <pre style={{
      fontSize: 11, lineHeight: 1.5, margin: 0, padding: '8px 10px',
      background: 'rgba(0,0,0,0.03)', borderRadius: 6, maxHeight: 200,
      overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      fontFamily: "'SF Mono', Monaco, Consolas, monospace",
    }}>{text}</pre>
  )
}

export default function RunResultPanel({ results, scenario, running, onClose, reportId, envName, projectId }) {
  const [expandedId, setExpandedId] = useState(null)
  const navigate = useNavigate()

  const passCount = results.filter(r => r.status === 'pass').length
  const failCount = results.filter(r => r.status === 'fail').length
  const skipCount = results.filter(r => r.status === 'skip').length
  const totalDuration = results.reduce((s, r) => s + (r.duration || 0), 0)

  const getStepDetail = (stepId) => {
    const step = (scenario?.steps || []).find(s => s.id === stepId)
    return step?.lastResponse || null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 顶部统计 */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={8}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>运行结果</span>
            {running && <Spin size="small" indicator={<LoadingOutlined />} />}
          </Space>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12 }}>
          <span style={{ color: '#0ea5a0', fontWeight: 600 }}>
            <CheckCircleOutlined /> {passCount} 通过
          </span>
          <span style={{ color: '#e8453c', fontWeight: 600 }}>
            <CloseCircleOutlined /> {failCount} 失败
          </span>
          {skipCount > 0 && <span style={{ color: '#c9cdd4' }}>{skipCount} 跳过</span>}
          <span style={{ color: '#86909c' }}>共 {results.length} 步</span>
          <span style={{ color: '#86909c' }}>{fmt(totalDuration)}</span>
        </div>
        {envName && <div style={{ fontSize: 11, color: '#c9cdd4', marginTop: 2 }}>环境: {envName}</div>}
      </div>

      {/* 步骤列表 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {results.map((r, i) => {
          const isExpanded = expandedId === r.stepId
          const detail = isExpanded ? getStepDetail(r.stepId) : null
          const isFail = r.status === 'fail'

          return (
            <div key={r.stepId || i}>
              {/* 步骤行 */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : r.stepId)}
                style={{
                  padding: '8px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: isFail ? 'rgba(232,69,60,0.04)' : 'transparent',
                  borderLeft: isFail ? '3px solid #e8453c' : '3px solid transparent',
                  borderBottom: '1px solid rgba(0,0,0,0.03)',
                }}
                onMouseEnter={e => { if (!isFail) e.currentTarget.style.background = 'rgba(0,0,0,0.02)' }}
                onMouseLeave={e => { if (!isFail) e.currentTarget.style.background = 'transparent' }}
              >
                {r.status === 'pass' ? <CheckCircleOutlined style={{ color: '#0ea5a0', fontSize: 14 }} /> :
                 r.status === 'fail' ? <CloseCircleOutlined style={{ color: '#e8453c', fontSize: 14 }} /> :
                 r.status === 'skip' ? <span style={{ width: 14, height: 14, borderRadius: 7, background: 'rgba(0,0,0,0.08)', display: 'inline-block' }} /> :
                 <LoadingOutlined style={{ color: '#0ea5a0', fontSize: 14 }} />}

                {r.statusCode && (
                  <Tag color={r.statusCode < 400 ? '#0ea5a0' : '#e8453c'}
                    style={{ fontSize: 11, margin: 0, padding: '0 4px', lineHeight: '18px', minWidth: 32, textAlign: 'center' }}>
                    {r.statusCode}
                  </Tag>
                )}

                <Tag color={METHOD_COLORS[r.method]} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '18px' }}>
                  {r.method || 'GET'}
                </Tag>

                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.stepName}
                </span>

                <span style={{ fontSize: 11, color: '#c9cdd4', flexShrink: 0 }}>{fmt(r.duration)}</span>

                {isExpanded ? <DownOutlined style={{ fontSize: 10, color: '#c9cdd4' }} /> :
                              <RightOutlined style={{ fontSize: 10, color: '#c9cdd4' }} />}
              </div>

              {/* 展开详情 */}
              {isExpanded && detail && (
                <div style={{ padding: '8px 16px 12px 28px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  {/* 请求 */}
                  {detail.request && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#86909c', marginBottom: 4 }}>请求</div>
                      <div style={{ fontSize: 12, marginBottom: 4, fontFamily: 'monospace' }}>
                        <Tag color={METHOD_COLORS[detail.request.method]} style={{ fontSize: 11 }}>{detail.request.method}</Tag>
                        {detail.request.url}
                      </div>
                      {detail.request.headers && Object.keys(detail.request.headers).length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#86909c' }}>Headers:</span>
                          <div style={{ fontSize: 11, fontFamily: 'monospace', padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 4, marginTop: 2 }}>
                            {Object.entries(detail.request.headers).map(([k, v]) => (
                              <div key={k}>{k}: {String(v)}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {detail.request.body && <JsonBlock data={detail.request.body} />}
                    </div>
                  )}

                  {/* 响应 */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#86909c', marginBottom: 4 }}>
                      响应
                      {detail.statusCode && (
                        <Tag color={detail.statusCode < 400 ? '#0ea5a0' : '#e8453c'} style={{ marginLeft: 8, fontSize: 11 }}>
                          {detail.statusCode}
                        </Tag>
                      )}
                      <span style={{ color: '#c9cdd4', fontWeight: 400, marginLeft: 8 }}>{fmt(detail.duration)}</span>
                    </div>
                    {detail.error ? (
                      <div style={{ padding: '6px 10px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, fontSize: 12, color: '#e8453c' }}>
                        {detail.error}
                      </div>
                    ) : (
                      <JsonBlock data={detail.body} />
                    )}
                  </div>

                  {/* 断言 */}
                  {detail.assertions?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#86909c', marginBottom: 4 }}>
                        断言 ({detail.assertions.filter(a => a.passed).length}/{detail.assertions.length})
                      </div>
                      {detail.assertions.map((a, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                          {a.passed ? <CheckCircleOutlined style={{ color: '#0ea5a0', fontSize: 12 }} /> :
                                      <CloseCircleOutlined style={{ color: '#e8453c', fontSize: 12 }} />}
                          <span style={{ fontFamily: 'monospace' }}>
                            {a.type === 'status' ? `状态码 ${a.operator || '=='} ${a.value}` :
                             a.type === 'body_contains' ? `响应包含 "${a.value}"` :
                             a.type === 'body_field' ? `${a.field} ${a.operator || '=='} ${JSON.stringify(a.expected ?? a.value)}` :
                             JSON.stringify(a)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isExpanded && !detail && (
                <div style={{ padding: '12px 28px', color: '#c9cdd4', fontSize: 12 }}>
                  {running ? '步骤执行中，结束后显示详情...' : '暂无详情数据'}
                </div>
              )}
            </div>
          )
        })}

        {running && results.length > 0 && (
          <div style={{ padding: '12px 16px', textAlign: 'center' }}>
            <Spin size="small" /> <span style={{ marginLeft: 8, fontSize: 12, color: '#86909c' }}>执行中...</span>
          </div>
        )}
      </div>

      {/* 底部：报告链接 */}
      {reportId && !running && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
          <Button type="link" icon={<FileTextOutlined />} size="small"
            onClick={() => navigate(`/projects/${projectId}/reports/${reportId}`)}>
            查看完整测试报告
          </Button>
        </div>
      )}
    </div>
  )
}
