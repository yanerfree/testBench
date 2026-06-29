import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Tag, Space, Typography, Modal, Form, Input, Select,
  message, Empty, Popconfirm, Divider, Steps, Tree, Tabs,
} from 'antd'
import {
  PlusOutlined, FileTextOutlined, DeleteOutlined,
  CopyOutlined, CodeOutlined, DesktopOutlined, DownloadOutlined,
  FolderOutlined, FileOutlined, LoadingOutlined, RobotOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'
import { copyToClipboard } from '../../utils/clipboard'

const { Text } = Typography
const { TextArea } = Input

const DOC_TYPE_LABELS = { manual: '操作手册', acceptance: '验收文档', training: '培训教材' }
const DOC_TYPE_COLORS = { manual: 'blue', acceptance: 'green', training: 'purple' }

export default function Documents() {
  const { projectId } = useParams()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [genOpen, setGenOpen] = useState(false)
  const [genMethod, setGenMethod] = useState('claude-code') // 'claude-code' | 'platform'
  const [ccForm] = Form.useForm()
  const [generatedPrompt, setGeneratedPrompt] = useState('')

  // 平台生成
  const [platGenerating, setPlatGenerating] = useState(false)
  const [platProgress, setPlatProgress] = useState([])
  const [platContent, setPlatContent] = useState('')
  const [platForm] = Form.useForm()
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folderCaseCount, setFolderCaseCount] = useState(null)

  const fetchDocs = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try { const res = await api.get(`/projects/${projectId}/documents`); setDocs(res.data || []) }
    catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const loadDoc = async (docId) => {
    setSelectedDocId(docId)
    try { const res = await api.get(`/projects/${projectId}/documents/${docId}`); setSelectedDoc(res.data) }
    catch { setSelectedDoc(null) }
  }

  // 加载文件夹
  useEffect(() => {
    if (!projectId || !genOpen || genMethod !== 'platform') return
    api.get(`/projects/${projectId}/branches`).then(res => {
      const branch = (res.data || []).find(b => b.status === 'active') || res.data?.[0]
      if (branch) {
        api.get(`/projects/${projectId}/branches/${branch.id}/folders`).then(r => {
          setFolders(buildTreeData(r.data || []))
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [projectId, genOpen, genMethod])

  const handleFolderChange = async (folderId) => {
    setSelectedFolder(folderId)
    if (!folderId) { setFolderCaseCount(null); return }
    try {
      const branches = await api.get(`/projects/${projectId}/branches`)
      const branch = (branches.data || []).find(b => b.status === 'active') || branches.data?.[0]
      if (branch) {
        const res = await api.get(`/projects/${projectId}/branches/${branch.id}/cases?folderId=${folderId}&pageSize=1`)
        setFolderCaseCount(res.pagination?.total ?? 0)
      }
    } catch { setFolderCaseCount(null) }
  }

  // 平台生成
  const handlePlatGenerate = async () => {
    try {
      const v = await platForm.validateFields()
      setPlatGenerating(true); setPlatContent(''); setPlatProgress([])
      api.stream(`/projects/${projectId}/documents/generate`, {
        title: v.title, docType: v.docType || 'manual',
        folderId: selectedFolder || undefined, additionalInfo: v.additionalInfo || undefined,
      }, {
        onChunk: (data) => {
          if (data.content) setPlatContent(prev => prev + data.content)
          if (data.type === 'step_start' || data.type === 'step_done') setPlatProgress(prev => [...prev, data])
        },
        onDone: (data) => {
          message.success('文档已生成')
          setPlatGenerating(false); setGenOpen(false); platForm.resetFields()
          setSelectedFolder(null); setFolderCaseCount(null)
          fetchDocs()
          if (data?.docId) loadDoc(data.docId)
        },
        onError: (msg) => { message.error(msg); setPlatGenerating(false) },
      })
    } catch { /* */ }
  }

  // Claude Code 提示词
  const handleCCGenerate = async () => {
    try {
      const v = await ccForm.validateFields()
      const docLabel = DOC_TYPE_LABELS[v.docType] || '操作手册'
      setGeneratedPrompt(`请为以下系统生成【${docLabel}】：

## 被测系统
- 地址：${v.systemUrl}
- 账号：${v.username}
- 密码：${v.password}

## 文档要求
- 标题：${v.title}
- 范围：${v.modules || '全部功能'}
- 读者：${v.audience || '测试工程师'}
${v.businessContext ? `\n## 业务背景\n${v.businessContext}` : ''}

## 输出
- 文档：${v.outputDir || 'docs/'}${v.title}.md
- 截图：${v.outputDir || 'docs/'}images/
- 格式：Markdown，每步配截图

## 执行
1. 打开 ${v.systemUrl}，用 ${v.username} 登录
2. 按范围逐个功能操作并截图
3. 每个功能一个章节（操作步骤 + 截图 + 预期结果）
4. 保存到指定目录`)
    } catch { /* */ }
  }

  const handleDelete = async (id) => {
    await api.del(`/projects/${projectId}/documents/${id}`).catch(() => {})
    message.success('已删除')
    if (selectedDocId === id) { setSelectedDocId(null); setSelectedDoc(null) }
    fetchDocs()
  }

  // 左侧目录树
  const docTreeData = docs.map(d => ({
    key: d.id,
    title: d.title,
    icon: <FileOutlined />,
    isLeaf: true,
    tag: d.docType,
  }))

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)' }}>
      {/* 左侧：文档目录 */}
      <div style={{ width: 260, flexShrink: 0, background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong><FolderOutlined style={{ marginRight: 6 }} />文档目录</Text>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setGenOpen(true); setGeneratedPrompt(''); setGenMethod('claude-code') }}>
            生成
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {docs.length === 0 ? (
            <Empty description="暂无文档" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
          ) : (
            docs.map(d => (
              <div
                key={d.id}
                onClick={() => loadDoc(d.id)}
                style={{
                  padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                  background: selectedDocId === d.id ? '#e6f7ff' : 'transparent',
                  borderRight: selectedDocId === d.id ? '3px solid #1677ff' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text ellipsis style={{ flex: 1, fontWeight: selectedDocId === d.id ? 600 : 400 }}>{d.title}</Text>
                  <Tag color={DOC_TYPE_COLORS[d.docType]} style={{ fontSize: 10, marginLeft: 4 }}>
                    {DOC_TYPE_LABELS[d.docType]?.slice(0, 2)}
                  </Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>{d.createdAt?.slice(0, 16).replace('T', ' ')}</Text>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧：文档内容 */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedDoc ? (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Text strong style={{ fontSize: 16 }}>{selectedDoc.title}</Text>
                <Tag color={DOC_TYPE_COLORS[selectedDoc.docType]}>{DOC_TYPE_LABELS[selectedDoc.docType]}</Tag>
              </Space>
              <Space>
                <Button size="small" icon={<CopyOutlined />} onClick={() => { copyToClipboard(selectedDoc.content); message.success('已复制') }}>复制</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadFile(selectedDoc.title + '.md', selectedDoc.content)}>下载 .md</Button>
                <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => downloadHtml(selectedDoc.title, selectedDoc.content)}>导出 HTML</Button>
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(selectedDoc.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              <div style={{ fontSize: 14, lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: simpleMarkdown(selectedDoc.content || '') }} />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="选择左侧文档查看，或点击「生成」创建新文档" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}
      </div>

      {/* 生成弹窗 */}
      <Modal
        title={<Space><FileTextOutlined /> 生成操作文档</Space>}
        open={genOpen}
        onCancel={() => { if (!platGenerating) setGenOpen(false) }}
        width={750}
        footer={null}
      >
        {!generatedPrompt && !platGenerating ? (
          <div>
            <Tabs
              activeKey={genMethod}
              onChange={setGenMethod}
              items={[
                {
                  key: 'claude-code',
                  label: <span><CodeOutlined /> Claude Code（带截图）</span>,
                  children: (
                    <div>
                      <div style={{ fontSize: 13, color: '#86909c', marginBottom: 12 }}>
                        填写系统信息 → 生成提示词 → 复制到 Claude Code 执行 → AI 自动操作截图并生成文档
                      </div>
                      <Form form={ccForm} layout="vertical" size="small">
                        <Divider orientation="left" plain style={{ margin: '4px 0 8px', fontSize: 12 }}>被测系统</Divider>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                          <Form.Item name="systemUrl" label="地址" rules={[{ required: true }]}>
                            <Input placeholder="http://192.168.51.108:5173" />
                          </Form.Item>
                          <Form.Item name="username" label="账号" rules={[{ required: true }]}>
                            <Input placeholder="admin" />
                          </Form.Item>
                          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
                            <Input.Password placeholder="admin123" />
                          </Form.Item>
                        </div>
                        <Divider orientation="left" plain style={{ margin: '4px 0 8px', fontSize: 12 }}>文档信息</Divider>
                        <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                          <Input placeholder="测试管理平台操作手册" />
                        </Form.Item>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <Form.Item name="docType" label="类型" initialValue="manual">
                            <Select options={Object.entries(DOC_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
                          </Form.Item>
                          <Form.Item name="modules" label="范围"><Input placeholder="用户管理、项目管理" /></Form.Item>
                          <Form.Item name="audience" label="读者"><Input placeholder="新入职测试工程师" /></Form.Item>
                        </div>
                        <Form.Item name="outputDir" label="输出目录"><Input placeholder="docs/操作手册/" /></Form.Item>
                        <Form.Item name="businessContext" label="业务背景（可选）">
                          <TextArea rows={2} placeholder="系统介绍、PRD 摘要" />
                        </Form.Item>
                      </Form>
                      <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => setGenOpen(false)} style={{ marginRight: 8 }}>取消</Button>
                        <Button type="primary" onClick={handleCCGenerate}>生成提示词</Button>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'platform',
                  label: <span><DesktopOutlined /> 平台生成（纯文字）</span>,
                  children: (
                    <div>
                      <div style={{ fontSize: 13, color: '#86909c', marginBottom: 12 }}>
                        基于项目中的测试用例生成纯文字文档（无截图），适合快速出初稿。生成后在左侧目录中查看。
                      </div>
                      <Form form={platForm} layout="vertical" size="small">
                        <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
                          <Input placeholder="认证模块操作手册" />
                        </Form.Item>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <Form.Item name="docType" label="类型" initialValue="manual">
                            <Select options={Object.entries(DOC_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
                          </Form.Item>
                          <Form.Item label={<span>用例范围 {folderCaseCount != null && <Tag color="blue">{folderCaseCount} 条</Tag>}</span>}>
                            <Select placeholder="选择模块" options={folders} value={selectedFolder}
                              onChange={handleFolderChange} allowClear />
                          </Form.Item>
                        </div>
                        <Form.Item name="additionalInfo" label="业务背景">
                          <TextArea rows={3} placeholder="系统介绍，帮助 AI 生成更准确的文档" />
                        </Form.Item>
                      </Form>
                      <div style={{ textAlign: 'right' }}>
                        <Button onClick={() => setGenOpen(false)} style={{ marginRight: 8 }}>取消</Button>
                        <Button type="primary" icon={<RobotOutlined />} onClick={handlePlatGenerate}>
                          开始生成{folderCaseCount != null ? `（${folderCaseCount} 条用例）` : ''}
                        </Button>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        ) : generatedPrompt ? (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#52c41a' }}>
              ✅ 提示词已生成。复制到 Claude Code 终端粘贴执行。
            </div>
            <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8, maxHeight: 350, overflow: 'auto', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {generatedPrompt}
            </pre>
            <div style={{ textAlign: 'right', marginTop: 12 }}>
              <Button onClick={() => setGeneratedPrompt('')} style={{ marginRight: 8 }}>返回修改</Button>
              <Button type="primary" icon={<CopyOutlined />} onClick={() => { copyToClipboard(generatedPrompt); message.success('已复制') }}>复制提示词</Button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <LoadingOutlined style={{ fontSize: 24 }} />
            <div style={{ marginTop: 12 }}>AI 正在生成文档...</div>
            <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, maxHeight: 200, overflow: 'auto', marginTop: 16, textAlign: 'left', whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {platContent || '等待响应...'}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function buildTreeData(folders) {
  if (!folders || !folders.length) return []
  return folders.filter(f => f.depth === 1).map(f => ({
    value: f.id, label: `${f.name} (${f.caseCount || 0})`,
  }))
}

function simpleMarkdown(md) {
  if (!md) return ''
  let html = md
  html = html.replace(/&/g, '&amp;')
  html = html.replace(/[<]/g, '&lt;')
  html = html.replace(/>/g, '&gt;')
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:16px 0 8px;font-size:15px">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 style="margin:20px 0 10px;font-size:17px;border-bottom:1px solid #f0f0f0;padding-bottom:6px">$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2 style="margin:24px 0 12px;font-size:20px">$1</h2>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  html = html.replace(/`(.+?)`/g, '<code style="background:#f5f5f5;padding:1px 4px;border-radius:3px;font-size:13px">$1</code>')
  html = html.replace(/^- (.+)$/gm, '<div style="padding-left:16px">• $1</div>')
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border:1px solid #eee;border-radius:6px;margin:8px 0" />')
  html = html.replace(/\n\n/g, '<br/><br/>')
  html = html.replace(/\n/g, '<br/>')
  return html
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function downloadHtml(title, mdContent) {
  const body = simpleMarkdown(mdContent)
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${title}</title>
<style>body{max-width:800px;margin:40px auto;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;line-height:1.8}h1{border-bottom:2px solid #eee;padding-bottom:10px}h2{border-bottom:1px solid #eee;padding-bottom:6px;margin-top:30px}code{background:#f5f5f5;padding:2px 6px;border-radius:3px}img{max-width:100%;border:1px solid #eee;border-radius:6px;margin:8px 0}</style>
</head><body>${body}<hr style="margin-top:40px;border:none;border-top:1px solid #eee"><p style="font-size:12px;color:#999">由 testBench 生成</p></body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = title + '.html'; a.click()
  URL.revokeObjectURL(url)
}
