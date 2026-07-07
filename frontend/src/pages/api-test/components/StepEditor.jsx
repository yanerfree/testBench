import { useState } from 'react'
import { Button, Tag, Space, Input, Select, Tabs, Popconfirm, Typography, message } from 'antd'
import {
  DeleteOutlined, CaretRightOutlined, LoadingOutlined,
  CheckCircleOutlined, SendOutlined,
} from '@ant-design/icons'

const { Text } = Typography

export default function StepEditor({
  step, running,
  onSaveStep, onRemoveStep, onRunStep,
  onStepChange,
}) {
  const [bodyText, setBodyText] = useState(step?.body ? JSON.stringify(step.body, null, 2) : '')

  const handleBodySave = () => {
    try {
      const parsed = JSON.parse(bodyText || '{}')
      onSaveStep(step.id, { body: parsed })
    } catch { message.error('JSON 格式错误') }
  }

  if (!step) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bfbfbf' }}>
        <div style={{ textAlign: 'center' }}>
          <SendOutlined style={{ fontSize: 40, marginBottom: 12 }} />
          <div style={{ fontSize: 13 }}>选择左侧步骤查看请求详情</div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input
          value={step.name}
          variant="borderless"
          style={{ fontWeight: 600, fontSize: 14, flex: 1, padding: 0 }}
          onBlur={e => onSaveStep(step.id, { name: e.target.value })}
          onChange={e => onStepChange({ ...step, name: e.target.value })}
        />
        <Space size={4}>
          <Popconfirm title="删除此步骤？" onConfirm={() => onRemoveStep(step.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
          <Button
            type="primary"
            icon={running ? <LoadingOutlined /> : <CaretRightOutlined />}
            loading={running}
            onClick={onRunStep}
            style={{ background: '#0ea5a0', borderColor: '#0ea5a0', fontWeight: 500 }}
          >
            运行
          </Button>
        </Space>
      </div>

      <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Select value={step.method} size="small"
          style={{ width: 90, fontWeight: 600 }}
          onChange={v => { onStepChange({ ...step, method: v }); onSaveStep(step.id, { method: v }) }}
          options={['GET','POST','PUT','DELETE','PATCH'].map(m => ({ value: m, label: m }))}
        />
        <Input
          value={step.url}
          variant="borderless"
          style={{ fontFamily: "'SF Mono', Monaco, Consolas, monospace", fontSize: 13, color: '#333' }}
          onChange={e => onStepChange({ ...step, url: e.target.value })}
          onBlur={e => onSaveStep(step.id, { url: e.target.value })}
        />
        <Button size="small" style={{ fontSize: 12 }}>发送</Button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Tabs
          defaultActiveKey="body"
          size="small"
          style={{ padding: '0 20px' }}
          items={[
            {
              key: 'body',
              label: <span>Body {step.body && <span style={{ color: '#0ea5a0' }}>●</span>}</span>,
              children: (
                <div style={{ background: 'transparent', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', background: '#f6f7f9', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: 11, color: '#8c8c8c', display: 'flex', justifyContent: 'space-between' }}>
                    <span>JSON</span>
                    <Button size="small" type="text" style={{ fontSize: 11, height: 18, padding: '0 4px' }} onClick={handleBodySave}>保存</Button>
                  </div>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    style={{
                      width: '100%', border: 'none', outline: 'none', resize: 'vertical',
                      padding: 16, fontSize: 13, fontFamily: "'SF Mono', Monaco, Consolas, monospace",
                      lineHeight: 1.6, minHeight: 100, maxHeight: 400, color: '#333', background: 'transparent',
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'headers',
              label: <span>Headers {step.headers && Object.keys(step.headers).length > 0 && <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{Object.keys(step.headers).length}</Tag>}</span>,
              children: (
                <div style={{ background: 'transparent', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f6f7f9' }}>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>Key</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {step.headers && Object.entries(step.headers).map(([k, v]) => (
                        <tr key={k}>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontWeight: 500, color: '#333' }}>{k}</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontFamily: 'monospace', color: '#595959', wordBreak: 'break-all' }}>{v}</td>
                        </tr>
                      ))}
                      {(!step.headers || Object.keys(step.headers).length === 0) && (
                        <tr><td colSpan={2} style={{ padding: 16, color: '#bfbfbf', textAlign: 'center' }}>无自定义 Headers</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ),
            },
            {
              key: 'assertions',
              label: <span>断言 {step.assertions?.length > 0 && <Tag color="green" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{step.assertions.length}</Tag>}</span>,
              children: (
                <div style={{ background: 'transparent', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f6f7f9' }}>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)', width: 30 }}></th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>类型</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>字段</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>操作</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>期望值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(step.assertions || []).map((a, j) => (
                        <tr key={j}>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}><CheckCircleOutlined style={{ color: '#0ea5a0' }} /></td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontWeight: 500 }}>{a.type}</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontFamily: 'monospace', color: '#595959' }}>{a.field || '-'}</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', color: '#4e8af0' }}>{a.operator}</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                            <code style={{ background: '#f0f5ff', padding: '2px 8px', borderRadius: 3, color: '#1d39c4' }}>{JSON.stringify(a.value)}</code>
                          </td>
                        </tr>
                      ))}
                      {(!step.assertions || step.assertions.length === 0) && (
                        <tr><td colSpan={5} style={{ padding: 16, color: '#bfbfbf', textAlign: 'center' }}>无断言</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ),
            },
            {
              key: 'variables',
              label: '变量提取',
              children: (
                <div style={{ background: 'transparent', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)', padding: 16 }}>
                  {step.variablesExtract && Object.keys(step.variablesExtract).length > 0 ? (
                    Object.entries(step.variablesExtract).map(([k, v]) => (
                      <div key={k} style={{ padding: '4px 0', fontSize: 13 }}>
                        <code style={{ color: '#d46b08', fontWeight: 500 }}>${`{${k}}`}</code>
                        <span style={{ margin: '0 8px', color: '#8c8c8c' }}>←</span>
                        <code style={{ color: '#333' }}>{v}</code>
                      </div>
                    ))
                  ) : <Text type="secondary" style={{ fontSize: 12 }}>无变量提取</Text>}
                </div>
              ),
            },
            {
              key: 'response',
              label: <span>响应 {step._runResponse && <span style={{ color: step._runResponse.error ? '#e8453c' : '#0ea5a0' }}>●</span>}</span>,
              children: (
                <div style={{ background: 'transparent', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  {step._runResponse ? (
                    step._runResponse.error ? (
                      <div style={{ padding: 16, color: '#e8453c' }}>{step._runResponse.error}</div>
                    ) : (
                      <>
                        <div style={{ padding: '8px 12px', background: '#f6f7f9', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', gap: 12, fontSize: 12 }}>
                          <Tag color={step._runResponse.statusCode < 400 ? 'success' : 'error'}>{step._runResponse.statusCode}</Tag>
                          <span style={{ color: '#8c8c8c' }}>{step._runResponse.duration}ms</span>
                        </div>
                        <pre style={{ margin: 0, padding: 16, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5, overflow: 'auto', maxHeight: 400 }}>
                          {JSON.stringify(step._runResponse.body, null, 2)}
                        </pre>
                      </>
                    )
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', color: '#bfbfbf', fontSize: 12 }}>
                      点击「运行」查看响应
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </>
  )
}
