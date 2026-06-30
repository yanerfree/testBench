import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Tag, Space, Typography, Modal, Form, Input, Select,
  message, Empty, Popconfirm, Divider,
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

  // 平台直接生成（Playwright 截图）
  const handlePlatGenerate = async () => {
    try {
      const v = await ccForm.validateFields()
      setPlatGenerating(true); setPlatContent(''); setPlatProgress([])
      api.stream(`/projects/${projectId}/documents/generate-with-screenshots`, {
        systemUrl: v.systemUrl,
        username: v.username,
        password: v.password,
        title: v.title,
        docType: v.docType || 'manual',
        modules: v.modules || undefined,
        audience: v.audience || undefined,
        businessContext: v.businessContext || undefined,
      }, {
        onChunk: (data) => {
          if (data.type === 'skill_start') setPlatProgress(prev => [...prev, `🚀 Skill: ${data.skill}`])
          if (data.type === 'step_start') setPlatProgress(prev => [...prev, `⏳ Step ${data.step}: ${data.title}`])
          if (data.type === 'step_done') setPlatProgress(prev => [...prev, `✅ Step ${data.step}: ${data.summary}`])
          if (data.type === 'screenshot') setPlatProgress(prev => [...prev, `📸 ${data.page}`])
          if (data.type === 'chunk' && data.content) setPlatContent(prev => prev + data.content)
          if (data.type === 'error') { message.error(data.message); setPlatGenerating(false) }
        },
        onDone: (data) => {
          message.success('文档已生成，请在左侧目录查看')
          setPlatGenerating(false); setGenOpen(false); ccForm.resetFields()
          fetchDocs()
          if (data?.docId) loadDoc(data.docId)
        },
        onError: (msg) => { message.error(msg); setPlatGenerating(false) },
      })
    } catch { /* */ }
  }

  // Claude Code 提示词
  const [taskResult, setTaskResult] = useState(null)

  const handleCCGenerate = async () => {
    try {
      const v = await ccForm.validateFields()
      const res = await api.post(`/projects/${projectId}/documents/tasks`, {
        _host: window.location.hostname + ':8000',
        systemUrl: v.systemUrl,
        username: v.username,
        password: v.password,
        title: v.title,
        docType: v.docType || 'manual',
        modules: v.modules || undefined,
        audience: v.audience || undefined,
        outputDir: v.outputDir || 'docs/',
        businessContext: v.businessContext || undefined,
      })
      setTaskResult(res.data)
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
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setGenOpen(true); setTaskResult(null); setGenMethod('claude-code') }}>
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
                <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadFromApi(`/projects/${projectId}/documents/${selectedDocId}/export-zip`, `${selectedDoc.title}.zip`)}>
                  下载 .md + 图片
                </Button>
                <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => downloadFromApi(`/projects/${projectId}/documents/${selectedDocId}/export-html`, `${selectedDoc.title}.html`)}>
                  导出 HTML
                </Button>
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

      {/* 生成弹窗 — 一个表单，底部两个操作按钮 */}
      <Modal
        title={<Space><FileTextOutlined /> 生成操作文档</Space>}
        open={genOpen}
        onCancel={() => { if (!platGenerating) setGenOpen(false) }}
        width={720}
        footer={null}
      >
        {!taskResult && !platGenerating ? (
          <div>
            <Form form={ccForm} layout="vertical" size="small">
              <Divider orientation="left" plain style={{ margin: '4px 0 8px', fontSize: 12 }}>被测系统</Divider>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                <Form.Item name="systemUrl" label="地址" rules={[{ required: true, message: '请输入系统地址' }]}>
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
              <Form.Item name="outputDir" label="输出目录" extra="仅 Claude Code 使用。平台直接生成的文档保存在本页面，可在线查看和导出。">
                <Input placeholder="docs/操作手册/" />
              </Form.Item>
              <Form.Item name="businessContext" label="业务背景（可选）">
                <TextArea rows={2} placeholder="系统介绍、PRD 摘要" />
              </Form.Item>
            </Form>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button onClick={() => setGenOpen(false)}>取消</Button>
              <Space>
                <Button icon={<CodeOutlined />} onClick={handleCCGenerate}>生成 Claude Code 命令</Button>
                <Button type="primary" icon={<DesktopOutlined />} onClick={handlePlatGenerate}>平台直接生成</Button>
              </Space>
            </div>
          </div>
        ) : taskResult ? (
          <div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#52c41a' }}>
              ✅ 任务已保存。按以下步骤在 Claude Code 中执行：
            </div>

            <div style={{ fontSize: 13, lineHeight: 2 }}>
              {taskResult.instructions?.map((step, i) => (
                <div key={i}>{step}</div>
              ))}
            </div>

            <div style={{ margin: '16px 0', padding: '12px 16px', background: '#1e1e1e', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>复制这一行到 Claude Code：</div>
              <div style={{ color: '#d4d4d4', fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>
                {taskResult.command}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setTaskResult(null)}>返回修改</Button>
              <Button type="primary" icon={<CopyOutlined />} onClick={() => {
                copyToClipboard(taskResult.command)
                message.success('已复制，粘贴到 Claude Code 终端执行')
              }}>复制命令</Button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <LoadingOutlined style={{ fontSize: 24 }} />
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 500 }}>正在生成文档...</div>
            </div>
            {/* 进度列表 */}
            {platProgress.length > 0 && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6f7f9', borderRadius: 6, maxHeight: 120, overflow: 'auto' }}>
                {platProgress.map((p, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#595959', padding: '2px 0' }}>
                    {typeof p === 'string' ? p : p.message || JSON.stringify(p)}
                  </div>
                ))}
              </div>
            )}
            {/* AI 文档内容流 */}
            {platContent && (
              <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6 }}>
                {platContent}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

async function downloadFromApi(url, filename) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) { message.error('下载失败'); return }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
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
