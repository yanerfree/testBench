import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Table, Tag, Space, Typography, Modal, Form, Input, Select,
  message, Empty, Drawer, Popconfirm, Divider, Steps,
} from 'antd'
import {
  FileTextOutlined, DeleteOutlined, EyeOutlined,
  CopyOutlined, CodeOutlined,
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

  const handleGeneratePrompt = async () => {
    try {
      const v = await ccForm.validateFields()
      const docLabel = v.docType === 'training' ? '培训教材' : v.docType === 'acceptance' ? '验收文档' : '操作手册'
      const prompt = `请为以下系统生成【${docLabel}】：

## 被测系统信息
- 系统地址：${v.systemUrl}
- 登录账号：${v.username}
- 登录密码：${v.password}

## 文档要求
- 文档标题：${v.title}
- 文档范围：${v.modules || '全部功能'}
- 目标读者：${v.audience || '测试工程师'}
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

  const viewDoc = (id) => api.get(`/projects/${projectId}/documents/${id}`).then(res => setPreviewDoc(res.data)).catch(() => {})

  const columns = [
    { title: '标题', dataIndex: 'title', render: (t, r) => <a onClick={() => viewDoc(r.id)}>{t}</a> },
    { title: '类型', dataIndex: 'docType', width: 100, render: (t) => <Tag color={DOC_TYPE_COLORS[t]}>{DOC_TYPE_LABELS[t] || t}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80, render: (s) => s === 'published' ? <Tag color="success">已生成</Tag> : <Tag>草稿</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (t) => t?.slice(0, 16).replace('T', ' ') },
    {
      title: '操作', width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => viewDoc(r.id)}>查看</Button>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => viewDoc(r.id).then(() => {})}>导出</Button>
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
          <Text type="secondary" style={{ fontSize: 13 }}>通过 Claude Code 操作被测系统，自动截图并生成带截图的操作文档</Text>
        </div>
        <Button type="primary" icon={<CodeOutlined />} onClick={() => { setCcOpen(true); setGeneratedPrompt(''); ccForm.resetFields() }}>
          生成文档
        </Button>
      </div>

      {docs.length === 0 && !loading ? (
        <Card>
          <Empty description={null} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <div style={{ textAlign: 'left', maxWidth: 600, margin: '0 auto', fontSize: 13, lineHeight: 2 }}>
              <Text strong style={{ fontSize: 15 }}>如何生成操作文档？</Text>
              <div style={{ marginTop: 8 }}>
                <div>1. 点击右上角 <Tag color="green">生成文档</Tag></div>
                <div>2. 填写被测系统地址、账号密码、文档范围等信息</div>
                <div>3. 平台生成一段<b>完整的提示词</b></div>
                <div>4. 复制提示词到 <b>Claude Code</b> 终端执行</div>
                <div>5. AI 自动打开浏览器 → 登录系统 → 逐步操作 → 截图 → 写文档</div>
                <div>6. 生成的文档（Markdown + 截图）保存在你指定的目录</div>
              </div>
            </div>
          </Empty>
        </Card>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={docs} loading={loading} pagination={false} size="small" />
      )}

      {/* Claude Code 任务配置 */}
      <Modal
        title={<Space><CodeOutlined /> 生成操作文档</Space>}
        open={ccOpen}
        onCancel={() => setCcOpen(false)}
        width={720}
        footer={generatedPrompt ? [
          <Button key="back" onClick={() => setGeneratedPrompt('')}>返回修改</Button>,
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={() => {
            copyToClipboard(generatedPrompt)
            message.success('已复制，粘贴到 Claude Code 终端执行')
          }}>复制提示词</Button>,
        ] : [
          <Button key="cancel" onClick={() => setCcOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" onClick={handleGeneratePrompt}>生成提示词</Button>,
        ]}
      >
        {!generatedPrompt ? (
          <div>
            <Steps size="small" current={0} style={{ marginBottom: 20 }} items={[
              { title: '填写信息' }, { title: '生成提示词' }, { title: '复制到 Claude Code 执行' },
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
              { title: '填写信息' }, { title: '生成提示词' }, { title: '复制到 Claude Code 执行' },
            ]} />
            <div style={{ marginBottom: 12, fontSize: 13, color: '#52c41a' }}>
              ✅ 提示词已生成。复制后在 Claude Code 终端粘贴执行。
            </div>
            <pre style={{
              background: '#1e1e1e', color: '#d4d4d4', padding: 16, borderRadius: 8,
              maxHeight: 380, overflow: 'auto', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap',
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
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function downloadHtml(title, mdContent) {
  const body = simpleMarkdown(mdContent)
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; line-height: 1.8; }
  h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
  h2 { border-bottom: 1px solid #eee; padding-bottom: 6px; margin-top: 30px; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
  img { max-width: 100%; border: 1px solid #eee; border-radius: 6px; margin: 8px 0; }
</style>
</head>
<body>${body}
<hr style="margin-top:40px;border:none;border-top:1px solid #eee">
<p style="font-size:12px;color:#999">由 testBench 测试管理平台生成</p>
</body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = title + '.html'; a.click()
  URL.revokeObjectURL(url)
}
