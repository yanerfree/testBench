import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Table, Tag, Space, Typography, Modal, Form, Input, Select, TreeSelect,
  message, Empty, Drawer, Popconfirm, Divider, Steps,
} from 'antd'
import {
  PlusOutlined, FileTextOutlined, DeleteOutlined, EyeOutlined,
  RobotOutlined, LoadingOutlined, CopyOutlined, CodeOutlined, DesktopOutlined,
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
  const [previewDoc, setPreviewDoc] = useState(null)

  // Web 生成
  const [webOpen, setWebOpen] = useState(false)
  const [webGenerating, setWebGenerating] = useState(false)
  const [webContent, setWebContent] = useState('')
  const [webForm] = Form.useForm()
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folderCaseCount, setFolderCaseCount] = useState(null)

  // Claude Code 任务
  const [ccOpen, setCcOpen] = useState(false)
  const [ccForm] = Form.useForm()
  const [generatedPrompt, setGeneratedPrompt] = useState('')

  const fetchDocs = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try { const res = await api.get(`/projects/${projectId}/documents`); setDocs(res.data || []) }
    catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  // 加载文件夹
  useEffect(() => {
    if (!projectId || (!webOpen && !ccOpen)) return
    api.get(`/projects/${projectId}/branches`).then(res => {
      const branch = (res.data || []).find(b => b.status === 'active') || res.data?.[0]
      if (branch) {
        api.get(`/projects/${projectId}/branches/${branch.id}/folders`).then(r => {
          setFolders(buildTreeData(r.data || []))
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [projectId, webOpen, ccOpen])

  const handleFolderChange = async (folderId) => {
    setSelectedFolder(folderId)
    if (!folderId) { setFolderCaseCount(null); return }
    try {
      const branches = await api.get(`/projects/${projectId}/branches`)
      const branch = (branches.data || []).find(b => b.status === 'active') || branches.data?.[0]
      if (branch) {
        const res = await api.get(`/projects/${projectId}/branches/${branch.id}/cases?folderId=${folderId}&pageSize=1`)
        setFolderCaseCount(res.pagination?.total ?? res.data?.length ?? 0)
      }
    } catch { setFolderCaseCount(null) }
  }

  // Web 生成
  const handleWebGenerate = async () => {
    try {
      const values = await webForm.validateFields()
      setWebGenerating(true); setWebContent('')
      api.stream(`/projects/${projectId}/documents/generate`, {
        title: values.title, docType: values.docType || 'manual',
        folderId: selectedFolder || undefined, additionalInfo: values.additionalInfo || undefined,
      }, {
        onChunk: (data) => { if (data.content) setWebContent(prev => prev + data.content) },
        onDone: (data) => {
          message.success('文档生成完成，可在列表中查看')
          setWebGenerating(false); setWebOpen(false); webForm.resetFields()
          setWebContent(''); setSelectedFolder(null); setFolderCaseCount(null)
          fetchDocs()
          if (data?.docId) api.get(`/projects/${projectId}/documents/${data.docId}`).then(res => setPreviewDoc(res.data)).catch(() => {})
        },
        onError: (msg) => { message.error(msg); setWebGenerating(false) },
      })
    } catch { /* validation */ }
  }

  // Claude Code 任务生成
  const handleGeneratePrompt = async () => {
    try {
      const v = await ccForm.validateFields()
      const modules = v.modules || '全部功能'
      const audience = v.audience || '测试工程师'
      const prompt = `请为以下系统生成【${v.docType === 'training' ? '培训教材' : v.docType === 'acceptance' ? '验收文档' : '操作手册'}】：

## 被测系统信息
- 系统地址：${v.systemUrl}
- 登录账号：${v.username}
- 登录密码：${v.password}

## 文档要求
- 文档标题：${v.title}
- 文档范围：${modules}
- 目标读者：${audience}
${v.businessContext ? `\n## 业务背景\n${v.businessContext}` : ''}

## 输出要求
- 文档保存到：${v.outputDir || 'docs/'}
- 截图保存到：${v.outputDir || 'docs/'}images/
- 格式：Markdown，每个操作步骤配截图
- 请逐个功能模块操作页面并截图，每步说明操作内容和预期结果

## 操作流程
1. 打开浏览器访问 ${v.systemUrl}
2. 用账号 ${v.username} 登录
3. 按"文档范围"逐个功能操作并截图
4. 每个功能写成一个章节（截图 + 操作步骤 + 预期结果）
5. 生成完整 Markdown 文档保存到指定目录`

      setGeneratedPrompt(prompt)
    } catch { /* validation */ }
  }

  const handleDelete = async (id) => {
    try { await api.del(`/projects/${projectId}/documents/${id}`); message.success('已删除'); fetchDocs() } catch { /* */ }
  }

  const columns = [
    { title: '标题', dataIndex: 'title', render: (t, r) => <a onClick={() => api.get(`/projects/${projectId}/documents/${r.id}`).then(res => setPreviewDoc(res.data))}>{t}</a> },
    { title: '类型', dataIndex: 'docType', width: 100, render: (t) => <Tag color={DOC_TYPE_COLORS[t]}>{DOC_TYPE_LABELS[t] || t}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80, render: (s) => s === 'published' ? <Tag color="success">已生成</Tag> : <Tag>草稿</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (t) => t?.slice(0, 16).replace('T', ' ') },
    {
      title: '操作', width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => api.get(`/projects/${projectId}/documents/${r.id}`).then(res => setPreviewDoc(res.data))}>查看</Button>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => {
            api.get(`/projects/${projectId}/documents/${r.id}`).then(res => {
              if (res.data?.content) downloadHtml(res.data.title, res.data.content)
            })
          }}>导出</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}><FileTextOutlined style={{ marginRight: 8 }} />文档管理</h2>
          <Text type="secondary" style={{ fontSize: 13 }}>根据测试用例和业务文档，生成操作手册、验收文档、培训教材</Text>
        </div>
        <Space>
          <Button icon={<DesktopOutlined />} onClick={() => { setWebOpen(true); setWebContent(''); setSelectedFolder(null); setFolderCaseCount(null) }}>
            Web 生成（纯文字）
          </Button>
          <Button type="primary" icon={<CodeOutlined />} onClick={() => { setCcOpen(true); setGeneratedPrompt('') }}>
            Claude Code 生成（带截图）
          </Button>
        </Space>
      </div>

      {docs.length === 0 && !loading ? (
        <Card>
          <Empty description="暂无文档" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <div style={{ fontSize: 13, color: '#86909c', lineHeight: 2 }}>
              <div><b>Web 生成</b>：基于项目用例快速出纯文字初稿（无截图）</div>
              <div><b>Claude Code 生成</b>：填写系统信息，生成带截图的完整操作文档（推荐）</div>
            </div>
          </Empty>
        </Card>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={docs} loading={loading} pagination={false} size="small" />
      )}

      {/* ====== Web 生成弹窗 ====== */}
      <Modal
        title={<Space><DesktopOutlined /> Web 生成文档（纯文字，无截图）</Space>}
        open={webOpen}
        onCancel={() => { if (!webGenerating) { setWebOpen(false); setWebContent('') } }}
        width={700}
        footer={webGenerating ? null : [
          <Button key="cancel" onClick={() => setWebOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={handleWebGenerate}>
            开始生成{folderCaseCount != null ? `（${folderCaseCount} 条用例）` : ''}
          </Button>,
        ]}
      >
        {!webGenerating ? (
          <Form form={webForm} layout="vertical">
            <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
              <Input placeholder="例如：用户管理模块操作手册" />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="docType" label="文档类型" initialValue="manual">
                <Select options={[
                  { value: 'manual', label: '操作手册' },
                  { value: 'acceptance', label: '验收文档' },
                  { value: 'training', label: '培训教材' },
                ]} />
              </Form.Item>
              <Form.Item label={<span>用例范围 {folderCaseCount != null && <Tag color="blue">{folderCaseCount} 条</Tag>}</span>}>
                <TreeSelect placeholder="选择模块（不选则全部）" treeData={folders} value={selectedFolder}
                  onChange={handleFolderChange} allowClear treeDefaultExpandAll />
              </Form.Item>
            </div>
            <Form.Item name="additionalInfo" label="业务背景" extra="生成后在本页面列表中查看，支持复制 Markdown">
              <TextArea rows={4} placeholder="粘贴系统介绍、需求文档摘要，让 AI 生成更准确的文档" />
            </Form.Item>
          </Form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 12 }}><LoadingOutlined style={{ fontSize: 20 }} /> <Text>生成中...</Text></div>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, maxHeight: 350, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>
              {webContent || '等待 AI 响应...'}
            </div>
          </div>
        )}
      </Modal>

      {/* ====== Claude Code 任务配置弹窗 ====== */}
      <Modal
        title={<Space><CodeOutlined /> Claude Code 生成文档（带截图）</Space>}
        open={ccOpen}
        onCancel={() => setCcOpen(false)}
        width={750}
        footer={generatedPrompt ? [
          <Button key="back" onClick={() => setGeneratedPrompt('')}>返回修改</Button>,
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={() => {
            copyToClipboard(generatedPrompt)
            message.success('已复制，请粘贴到 Claude Code 终端执行')
          }}>复制提示词</Button>,
        ] : [
          <Button key="cancel" onClick={() => setCcOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" onClick={handleGeneratePrompt}>生成提示词</Button>,
        ]}
      >
        {!generatedPrompt ? (
          <div>
            <Steps size="small" current={0} style={{ marginBottom: 20 }} items={[
              { title: '填写信息' },
              { title: '生成提示词' },
              { title: '复制到 Claude Code 执行' },
            ]} />
            <Form form={ccForm} layout="vertical">
              <Divider orientation="left" style={{ margin: '0 0 12px', fontSize: 13 }}>被测系统</Divider>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <Form.Item name="systemUrl" label="系统地址" rules={[{ required: true, message: '请输入系统 URL' }]}>
                  <Input placeholder="http://192.168.51.108:5173" />
                </Form.Item>
                <Form.Item name="username" label="登录账号" rules={[{ required: true }]}>
                  <Input placeholder="admin" />
                </Form.Item>
                <Form.Item name="password" label="登录密码" rules={[{ required: true }]}>
                  <Input.Password placeholder="admin123" />
                </Form.Item>
              </div>

              <Divider orientation="left" style={{ margin: '0 0 12px', fontSize: 13 }}>文档内容</Divider>
              <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
                <Input placeholder="例如：测试管理平台操作手册" />
              </Form.Item>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Form.Item name="docType" label="文档类型" initialValue="manual">
                  <Select options={[
                    { value: 'manual', label: '操作手册' },
                    { value: 'acceptance', label: '验收文档' },
                    { value: 'training', label: '培训教材' },
                  ]} />
                </Form.Item>
                <Form.Item name="modules" label="文档范围">
                  <Input placeholder="例如：用户管理、项目管理" />
                </Form.Item>
                <Form.Item name="audience" label="目标读者">
                  <Input placeholder="例如：新入职测试工程师" />
                </Form.Item>
              </div>

              <Divider orientation="left" style={{ margin: '0 0 12px', fontSize: 13 }}>输出设置</Divider>
              <Form.Item name="outputDir" label="输出目录" extra="文档和截图保存到这个目录（相对于项目根目录）">
                <Input placeholder="docs/操作手册/" />
              </Form.Item>
              <Form.Item name="businessContext" label="业务背景（可选）">
                <TextArea rows={3} placeholder="粘贴系统介绍、PRD 摘要，帮助 AI 理解业务" />
              </Form.Item>
            </Form>
          </div>
        ) : (
          <div>
            <Steps size="small" current={1} style={{ marginBottom: 20 }} items={[
              { title: '填写信息' },
              { title: '生成提示词' },
              { title: '复制到 Claude Code 执行' },
            ]} />
            <div style={{ marginBottom: 12, fontSize: 13, color: '#52c41a' }}>
              ✅ 提示词已生成。复制后在 Claude Code 终端粘贴执行，AI 会自动操作系统并生成带截图的文档。
            </div>
            <pre style={{
              background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
              maxHeight: 400, overflow: 'auto', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>
              {generatedPrompt}
            </pre>
          </div>
        )}
      </Modal>

      {/* 预览 + 导出 */}
      <Drawer
        title={previewDoc ? previewDoc.title : ''} open={!!previewDoc} onClose={() => setPreviewDoc(null)} width={700}
        extra={previewDoc?.content && (
          <Space>
            <Button icon={<CopyOutlined />} onClick={() => { copyToClipboard(previewDoc.content); message.success('已复制 Markdown') }}>复制</Button>
            <Button icon={<FileTextOutlined />} onClick={() => downloadFile(previewDoc.title + '.md', previewDoc.content)}>下载 .md</Button>
            <Button type="primary" icon={<FileTextOutlined />} onClick={() => downloadHtml(previewDoc.title, previewDoc.content)}>导出 HTML</Button>
          </Space>
        )}
      >
        {previewDoc && <div style={{ fontSize: 14, lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: simpleMarkdown(previewDoc.content || '') }} />}
      </Drawer>
    </div>
  )
}

function buildTreeData(folders) {
  if (!folders || !folders.length) return []
  const map = {}
  folders.forEach(f => { map[f.id] = { ...f, key: f.id, value: f.id, title: `${f.name} (${f.caseCount || 0})`, children: [] } })
  const tree = []
  folders.forEach(f => {
    if (f.parentId && map[f.parentId]) map[f.parentId].children.push(map[f.id])
    else tree.push(map[f.id])
  })
  return tree
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
  html = html.replace(/\n\n/g, '<br/><br/>')
  html = html.replace(/\n/g, '<br/>')
  return html
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadHtml(title, mdContent) {
  const body = simpleMarkdown(mdContent)
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.8; }
  h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
  h2 { border-bottom: 1px solid #eee; padding-bottom: 6px; margin-top: 30px; }
  h3 { margin-top: 24px; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
  b { color: #1d2129; }
  img { max-width: 100%; border: 1px solid #eee; border-radius: 6px; margin: 8px 0; }
</style>
</head>
<body>
${body}
<hr style="margin-top:40px;border:none;border-top:1px solid #eee">
<p style="font-size:12px;color:#999">由 testBench 测试管理平台生成</p>
</body>
</html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = title + '.html'
  a.click()
  URL.revokeObjectURL(url)
}
