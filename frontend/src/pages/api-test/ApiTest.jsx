import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Tag, Space, Typography, Modal, Form, Input, Select, Tabs,
  message, Popconfirm, Spin, Tree, Tooltip, TreeSelect,
} from 'antd'
import {
  PlusOutlined, ThunderboltOutlined, DeleteOutlined, RobotOutlined,
  LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PlayCircleOutlined, FileTextOutlined, CaretRightOutlined, SendOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'

const { Text } = Typography
const { TextArea } = Input

const METHOD_COLORS = { GET: '#1677ff', POST: '#52c41a', PUT: '#faad14', DELETE: '#ff4d4f', PATCH: '#722ed1' }
const PRIORITY_COLORS = { P0: 'red', P1: 'orange', P2: 'blue', P3: 'default' }

export default function ApiTest() {
  const { projectId } = useParams()
  const [branchId, setBranchId] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState(null)
  const [selectedStep, setSelectedStep] = useState(null)
  const [genOpen, setGenOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState([])
  const [form] = Form.useForm()
  const [running, setRunning] = useState(false)
  const [runResponse, setRunResponse] = useState(null)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParent, setNewFolderParent] = useState(null)
  const [folderTree, setFolderTree] = useState([])

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/branches`).then(res => {
      const b = (res.data || [])[0]
      if (b) setBranchId(b.id)
    }).catch(() => {})
  }, [projectId])

  const fetchFolders = useCallback(async () => {
    if (!branchId) return
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/folders`)
      setFolderTree(res.data || [])
    } catch { /* */ }
  }, [projectId, branchId])

  useEffect(() => { fetchFolders() }, [fetchFolders])

  const fetchScenarios = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests`)
      setScenarios(res.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, branchId])

  useEffect(() => { fetchScenarios() }, [fetchScenarios])

  const loadScenario = async (id) => {
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`)
      setSelectedScenario(res.data)
      setRunResponse(null)
      // 自动选中第一个步骤
      const steps = res.data?.steps || []
      setSelectedStep(steps.length > 0 ? steps[0] : null)
    } catch { /* */ }
  }

  const handleDelete = async (id) => {
    await api.del(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`).catch(() => {})
    message.success('已删除')
    if (selectedScenario?.id === id) { setSelectedScenario(null); setSelectedStep(null) }
    fetchScenarios()
  }

  const handleGenerate = async () => {
    try {
      const v = await form.validateFields()
      setGenerating(true); setGenProgress([])
      api.stream(`/projects/${projectId}/branches/${branchId}/api-tests/generate`, {
        apiInfo: v.apiInfo,
        envVariables: v.envVars ? JSON.parse(v.envVars) : undefined,
      }, {
        onChunk: (data) => {
          if (data.type === 'step_start') setGenProgress(prev => [...prev, `⏳ ${data.title}`])
          if (data.type === 'step_done') setGenProgress(prev => [...prev, `✅ ${data.summary}`])
          if (data.type === 'scenario_created') setGenProgress(prev => [...prev, `📋 ${data.code} ${data.title} (${data.stepCount}步)`])
          if (data.type === 'error') { message.error(data.message); setGenerating(false) }
        },
        onDone: () => {
          message.success('测试场景已生成')
          setGenerating(false); setGenOpen(false); form.resetFields()
          fetchScenarios()
        },
        onError: (msg) => { message.error(msg); setGenerating(false) },
      })
    } catch { /* */ }
  }

  const handleRunStep = async () => {
    if (!selectedStep) return
    setRunning(true); setRunResponse(null)
    try {
      const res = await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/run-step/${selectedStep.id}`)
      setRunResponse(res.data)
    } catch (e) {
      setRunResponse({ error: e.message || '执行失败' })
    } finally { setRunning(false) }
  }

  // 构建目录树：真实文件夹 + 场景叶子节点
  const buildTreeData = (nodes) => nodes.map(n => ({
    key: n.id,
    title: `${n.name} (${n.caseCount || 0})`,
    isFolder: true,
    folderId: n.id,
    children: [
      ...(n.children?.length > 0 ? buildTreeData(n.children) : []),
      ...scenarios.filter(s => s.folderId === n.id).map(s => ({
        key: s.id, title: s.title, isLeaf: true, scenario: s,
      })),
    ],
  }))

  // 未分配文件夹的场景
  const unassigned = scenarios.filter(s => !s.folderId)
  const treeData = [
    ...buildTreeData(folderTree),
    ...unassigned.map(s => ({ key: s.id, title: s.title, isLeaf: true, scenario: s })),
  ]

  // 构建父模块 TreeSelect
  const buildParentSelect = (nodes) => nodes.map(n => ({
    value: n.id, title: n.name,
    children: n.children?.length > 0 ? buildParentSelect(n.children) : undefined,
  }))

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await api.post(`/projects/${projectId}/branches/${branchId}/folders?name=${encodeURIComponent(newFolderName.trim())}${newFolderParent ? `&parentId=${newFolderParent}` : ''}`)
      message.success('文件夹已创建')
      setFolderModalOpen(false)
      setNewFolderName('')
      setNewFolderParent(null)
      fetchFolders()
    } catch { /* */ }
  }

  const handleDeleteFolder = async (folderId) => {
    try {
      await api.del(`/projects/${projectId}/branches/${branchId}/folders/${folderId}`)
      message.success('文件夹已删除')
      fetchFolders()
    } catch { /* */ }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* 左栏：目录树 */}
      <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f2f3f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>测试场景</span>
          <Tooltip title="新建文件夹">
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => { setNewFolderName(''); setFolderModalOpen(true) }} style={{ color: '#00b96b' }} />
          </Tooltip>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {loading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> :
            treeData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#86909c', fontSize: 12 }}>暂无场景</div>
            ) : (
              <Tree
                treeData={treeData}
                defaultExpandAll
                blockNode
                style={{ fontSize: 12 }}
                selectedKeys={selectedScenario ? [selectedScenario.id] : []}
                onSelect={(keys, { node }) => {
                  if (node.isLeaf && node.scenario) loadScenario(node.scenario.id)
                }}
                titleRender={(node) => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {node.title}
                    </span>
                    {(node.isLeaf && node.scenario) ? (
                      <Popconfirm title="确定删除此场景？" onConfirm={async (e) => { e?.stopPropagation(); handleDelete(node.scenario.id) }} onCancel={e => e?.stopPropagation()}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={e => e.stopPropagation()}
                          style={{ color: '#c9cdd4', opacity: 0, fontSize: 11, transition: 'opacity 0.2s' }} className="tree-delete-btn" />
                      </Popconfirm>
                    ) : node.isFolder ? (
                      <Popconfirm title="确定删除此文件夹？" description="仅允许删除空文件夹" onConfirm={async (e) => { e?.stopPropagation(); handleDeleteFolder(node.folderId) }} onCancel={e => e?.stopPropagation()}>
                        <Button type="text" size="small" icon={<DeleteOutlined />} onClick={e => e.stopPropagation()}
                          style={{ color: '#c9cdd4', opacity: 0, fontSize: 11, transition: 'opacity 0.2s' }} className="tree-delete-btn" />
                      </Popconfirm>
                    ) : null}
                  </div>
                )}
              />
            )
          }
        </div>
        <style>{`.ant-tree-treenode:hover .tree-delete-btn { opacity: 0.6 !important; } .ant-tree-treenode:hover .tree-delete-btn:hover { opacity: 1 !important; }`}</style>
      </div>

      {!selectedScenario ? (
        /* 没选场景：右侧显示场景概览表格 */
        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>接口测试</h3>
              <Text type="secondary" style={{ fontSize: 13 }}>点击左侧场景查看测试步骤</Text>
            </div>
            <Button type="primary" icon={<RobotOutlined />} onClick={() => { setGenOpen(true); form.resetFields() }}>
              AI 生成测试
            </Button>
          </div>
          {scenarios.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f6f7f9' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid #e8e8e8' }}>编号</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid #e8e8e8' }}>场景名称</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid #e8e8e8', width: 60 }}>优先级</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid #e8e8e8', width: 60 }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => loadScenario(s.id)}
                    onMouseEnter={e => e.currentTarget.style.background = '#f6f8ff'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', fontFamily: 'monospace', color: '#8c8c8c', fontSize: 12 }}>{s.code}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', fontWeight: 500 }}>{s.title}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}><Tag color={PRIORITY_COLORS[s.priority]}>{s.priority}</Tag></td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}><Tag color={s.status === 'completed' ? 'success' : 'default'}>{s.status === 'completed' ? '已完成' : '草稿'}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* 选了场景：中栏步骤列表 + 右栏请求编辑器 */
        <>
          {/* 中栏：步骤列表 */}
          <div style={{ width: 300, minWidth: 300, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', background: 'rgba(255,255,255,0.7)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedScenario.code}</span>
                <Space size={4}>
                  <Tooltip title="运行全部">
                    <Button size="small" type="text" icon={<PlayCircleOutlined style={{ color: '#52c41a' }} />} />
                  </Tooltip>
                  <Popconfirm title="确认删除？" onConfirm={() => handleDelete(selectedScenario.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>{selectedScenario.title}</Text>
              <div style={{ marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
                已选 {selectedScenario.steps?.length || 0} 项
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(selectedScenario.steps || []).map((step, i) => {
                const isSelected = selectedStep?.id === step.id
                const showGroup = step.groupName && (i === 0 || selectedScenario.steps[i-1]?.groupName !== step.groupName)
                return (
                  <div key={step.id}>
                    {showGroup && (
                      <div style={{ padding: '4px 12px', fontSize: 11, color: '#8c8c8c', background: '#f6f7f9' }}>
                        <CaretRightOutlined style={{ marginRight: 4 }} /> Group  {step.groupName}
                      </div>
                    )}
                    <div
                      onClick={() => { setSelectedStep(step); setRunResponse(null) }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer',
                        background: isSelected ? '#e6f4ff' : 'transparent',
                        borderLeft: isSelected ? '3px solid #1677ff' : '3px solid transparent',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      {step.lastStatus === 'pass' ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} /> :
                       step.lastStatus === 'fail' ? <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} /> :
                       <span style={{ width: 12, height: 12, borderRadius: 10, border: '1.5px solid #d9d9d9', display: 'inline-block', flexShrink: 0 }} />}
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
                <Button type="dashed" size="small" icon={<PlusOutlined />} block style={{ fontSize: 12 }}>添加步骤</Button>
              </div>
            </div>
          </div>

          {/* 右栏：请求编辑器 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f9fafb' }}>
            {selectedStep ? (
          <>
            {/* 顶部：步骤名 + 运行按钮 */}
            <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selectedStep.name}</span>
              <Button
                type="primary"
                icon={running ? <LoadingOutlined /> : <CaretRightOutlined />}
                loading={running}
                onClick={handleRunStep}
                style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 500 }}
              >
                运行
              </Button>
            </div>

            {/* URL 栏 */}
            <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ background: METHOD_COLORS[selectedStep.method], color: '#fff', padding: '4px 12px', borderRadius: 12, fontWeight: 600, fontSize: 12, minWidth: 56, textAlign: 'center' }}>
                {selectedStep.method}
              </div>
              <Input
                value={selectedStep.url}
                readOnly
                variant="borderless"
                style={{ fontFamily: "'SF Mono', Monaco, Consolas, monospace", fontSize: 13, color: '#333' }}
              />
              <Button size="small" style={{ fontSize: 12 }}>发送</Button>
            </div>

            {/* Tab 栏 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Tabs
                defaultActiveKey="body"
                size="small"
                style={{ padding: '0 20px' }}
                items={[
                  {
                    key: 'body',
                    label: <span>Body {selectedStep.body && <span style={{ color: '#52c41a' }}>●</span>}</span>,
                    children: (
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '6px 12px', background: '#f6f7f9', borderBottom: '1px solid rgba(0,0,0,0.05)', fontSize: 11, color: '#8c8c8c' }}>
                          JSON
                        </div>
                        <pre style={{
                          margin: 0, padding: 16, fontSize: 13, fontFamily: "'SF Mono', Monaco, Consolas, monospace",
                          lineHeight: 1.6, overflow: 'auto', minHeight: 100, maxHeight: 400, color: '#333',
                        }}>
                          {selectedStep.body ? JSON.stringify(selectedStep.body, null, 2) : '// 无请求体'}
                        </pre>
                      </div>
                    ),
                  },
                  {
                    key: 'headers',
                    label: <span>Headers {selectedStep.headers && Object.keys(selectedStep.headers).length > 0 && <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{Object.keys(selectedStep.headers).length}</Tag>}</span>,
                    children: (
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f6f7f9' }}>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>Key</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedStep.headers && Object.entries(selectedStep.headers).map(([k, v]) => (
                              <tr key={k}>
                                <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontWeight: 500, color: '#333' }}>{k}</td>
                                <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontFamily: 'monospace', color: '#595959', wordBreak: 'break-all' }}>{v}</td>
                              </tr>
                            ))}
                            {(!selectedStep.headers || Object.keys(selectedStep.headers).length === 0) && (
                              <tr><td colSpan={2} style={{ padding: 16, color: '#bfbfbf', textAlign: 'center' }}>无自定义 Headers</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ),
                  },
                  {
                    key: 'assertions',
                    label: <span>断言 {selectedStep.assertions?.length > 0 && <Tag color="green" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{selectedStep.assertions.length}</Tag>}</span>,
                    children: (
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f6f7f9' }}>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.05)', width: 30 }}></th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>类型</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>字段</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>操作</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>期望值</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedStep.assertions || []).map((a, j) => (
                              <tr key={j}>
                                <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}><CheckCircleOutlined style={{ color: '#52c41a' }} /></td>
                                <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontWeight: 500 }}>{a.type}</td>
                                <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontFamily: 'monospace', color: '#595959' }}>{a.field || '-'}</td>
                                <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', color: '#1677ff' }}>{a.operator}</td>
                                <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                  <code style={{ background: '#f0f5ff', padding: '2px 8px', borderRadius: 3, color: '#1d39c4' }}>{JSON.stringify(a.value)}</code>
                                </td>
                              </tr>
                            ))}
                            {(!selectedStep.assertions || selectedStep.assertions.length === 0) && (
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
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)', padding: 16 }}>
                        {selectedStep.variablesExtract && Object.keys(selectedStep.variablesExtract).length > 0 ? (
                          Object.entries(selectedStep.variablesExtract).map(([k, v]) => (
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
                    label: <span>响应 {runResponse && <span style={{ color: runResponse.error ? '#ff4d4f' : '#52c41a' }}>●</span>}</span>,
                    children: (
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        {runResponse ? (
                          runResponse.error ? (
                            <div style={{ padding: 16, color: '#ff4d4f' }}>{runResponse.error}</div>
                          ) : (
                            <>
                              <div style={{ padding: '8px 12px', background: '#f6f7f9', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', gap: 12, fontSize: 12 }}>
                                <Tag color={runResponse.statusCode < 400 ? 'success' : 'error'}>{runResponse.statusCode}</Tag>
                                <span style={{ color: '#8c8c8c' }}>{runResponse.duration}ms</span>
                              </div>
                              <pre style={{ margin: 0, padding: 16, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5, overflow: 'auto', maxHeight: 400 }}>
                                {JSON.stringify(runResponse.body, null, 2)}
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
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bfbfbf' }}>
            <div style={{ textAlign: 'center' }}>
              <SendOutlined style={{ fontSize: 40, marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>选择左侧步骤查看请求详情</div>
            </div>
          </div>
        )}
          </div>
        </>
      )}

      {/* 生成弹窗 */}
      <Modal
        title="生成接口测试"
        open={genOpen}
        onCancel={() => { if (!generating) setGenOpen(false) }}
        width={600}
        footer={!generating ? [
          <Button key="cancel" onClick={() => setGenOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={handleGenerate}>开始生成</Button>,
        ] : null}
      >
        {!generating ? (
          <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
            <Form.Item name="apiInfo" label="接口定义" rules={[{ required: true, message: '请输入' }]}>
              <TextArea rows={8} placeholder={"粘贴接口定义，例如：\n\n### POST /api/users — 创建用户\n参数:\n- username (string, required, 3-100位)\n- password (string, required, ≥6位)\n- role (string, required, enum: admin/user)\n需要认证：Bearer Token"} />
            </Form.Item>
            <Form.Item name="envVars" label="环境变量 (JSON)">
              <TextArea rows={3} placeholder={'{"BASE_URL": "http://localhost:8000", "ADMIN_USER": "admin"}'} />
            </Form.Item>
          </Form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <LoadingOutlined style={{ fontSize: 24 }} />
              <div style={{ marginTop: 8, fontWeight: 500 }}>正在生成...</div>
            </div>
            <div style={{ padding: '8px 12px', background: '#f6f7f9', borderRadius: 10, maxHeight: 200, overflow: 'auto' }}>
              {genProgress.map((p, i) => <div key={i} style={{ fontSize: 12, color: '#595959', padding: '2px 0' }}>{p}</div>)}
            </div>
          </div>
        )}
      </Modal>

      {/* 新建模块弹窗 — 和用例管理一致 */}
      <Modal
        title="新建模块"
        open={folderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => setFolderModalOpen(false)}
        okText="创建"
        cancelText="取消"
        width={420}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="模块名称" required>
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="如：AUTH、USER_MGMT"
              onPressEnter={handleCreateFolder}
            />
          </Form.Item>
          <Form.Item label="父模块（可选）">
            <TreeSelect
              value={newFolderParent}
              onChange={setNewFolderParent}
              treeData={buildParentSelect(folderTree)}
              placeholder="顶级模块（不选则为一级模块）"
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
