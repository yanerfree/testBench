import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Table, Tag, Space, Typography, Modal, Form, Input, Select,
  message, Empty, Drawer, Popconfirm,
} from 'antd'
import {
  PlusOutlined, FileTextOutlined, DeleteOutlined, EyeOutlined,
  RobotOutlined, LoadingOutlined, CopyOutlined, DownloadOutlined,
} from '@ant-design/icons'
import { api } from '../../utils/request'
import { copyToClipboard } from '../../utils/clipboard'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const DOC_TYPE_LABELS = { manual: '操作手册', acceptance: '验收文档', training: '培训教材' }
const DOC_TYPE_COLORS = { manual: 'blue', acceptance: 'green', training: 'purple' }

export default function Documents() {
  const { projectId } = useParams()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genContent, setGenContent] = useState('')
  const [previewDoc, setPreviewDoc] = useState(null)
  const [createForm] = Form.useForm()

  const fetchDocs = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/documents`)
      setDocs(res.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const handleGenerate = async () => {
    try {
      const values = await createForm.validateFields()
      setGenerating(true)
      setGenContent('')

      api.stream(`/projects/${projectId}/documents/generate`, {
        title: values.title,
        docType: values.docType || 'manual',
        module: values.module || undefined,
        additionalInfo: values.additionalInfo || undefined,
      }, {
        onChunk: (data) => {
          if (data.content) setGenContent(prev => prev + data.content)
        },
        onDone: (data) => {
          message.success('文档生成完成')
          setGenerating(false)
          setCreateOpen(false)
          createForm.resetFields()
          setGenContent('')
          fetchDocs()
          if (data?.docId) {
            api.get(`/projects/${projectId}/documents/${data.docId}`).then(res => setPreviewDoc(res.data)).catch(() => {})
          }
        },
        onError: (msg) => { message.error(msg); setGenerating(false) },
      })
    } catch { /* validation */ }
  }

  const handleDelete = async (id) => {
    try {
      await api.del(`/projects/${projectId}/documents/${id}`)
      message.success('已删除')
      fetchDocs()
    } catch { /* */ }
  }

  const handleCopyContent = (content) => {
    copyToClipboard(content)
    message.success('已复制 Markdown 内容')
  }

  const columns = [
    { title: '标题', dataIndex: 'title', render: (t, r) => <a onClick={() => api.get(`/projects/${projectId}/documents/${r.id}`).then(res => setPreviewDoc(res.data))}>{t}</a> },
    { title: '类型', dataIndex: 'docType', width: 100, render: (t) => <Tag color={DOC_TYPE_COLORS[t]}>{DOC_TYPE_LABELS[t] || t}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80, render: (s) => s === 'published' ? <Tag color="success">已生成</Tag> : <Tag>草稿</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 160, render: (t) => t?.slice(0, 16).replace('T', ' ') },
    {
      title: '操作', width: 120,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => api.get(`/projects/${projectId}/documents/${r.id}`).then(res => setPreviewDoc(res.data))}>查看</Button>
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
          <Text type="secondary" style={{ fontSize: 13 }}>AI 根据测试用例自动生成操作手册、验收文档、培训教材</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); setGenContent('') }}>AI 生成文档</Button>
      </div>

      {docs.length === 0 && !loading ? (
        <Card><Empty description="暂无文档，点击右上角生成" /></Card>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={docs} loading={loading} pagination={false} size="small" />
      )}

      {/* 生成弹窗 */}
      <Modal
        title={<Space><RobotOutlined /> AI 生成文档</Space>}
        open={createOpen}
        onCancel={() => { if (!generating) { setCreateOpen(false); setGenContent('') } }}
        width={700}
        footer={generating ? null : [
          <Button key="cancel" onClick={() => setCreateOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={handleGenerate}>开始生成</Button>,
        ]}
      >
        {!generating ? (
          <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item name="title" label="文档标题" rules={[{ required: true }]}>
              <Input placeholder="例如：用户管理模块操作手册" />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="docType" label="文档类型" initialValue="manual">
                <Select options={[
                  { value: 'manual', label: '操作手册 — 步骤式操作指南' },
                  { value: 'acceptance', label: '验收文档 — 验收标准和判定' },
                  { value: 'training', label: '培训教材 — 学习教程+练习' },
                ]} />
              </Form.Item>
              <Form.Item name="module" label="关联模块（可选）">
                <Input placeholder="筛选模块相关用例" />
              </Form.Item>
            </div>
            <Form.Item name="additionalInfo" label="补充说明（可选）">
              <TextArea rows={3} placeholder="告诉 AI 文档的特殊要求，例如：面向新员工、包含注意事项" />
            </Form.Item>
          </Form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <LoadingOutlined style={{ fontSize: 20 }} />
              <Text style={{ marginLeft: 8 }}>AI 正在生成文档...</Text>
            </div>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>
              {genContent || '等待 AI 响应...'}
            </div>
          </div>
        )}
      </Modal>

      {/* 预览 Drawer */}
      <Drawer
        title={previewDoc ? previewDoc.title : ''}
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        width={700}
        extra={previewDoc?.content && (
          <Space>
            <Button icon={<CopyOutlined />} onClick={() => handleCopyContent(previewDoc.content)}>复制</Button>
          </Space>
        )}
      >
        {previewDoc && (
          <div
            className="markdown-preview"
            style={{ fontSize: 14, lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(previewDoc.content || '') }}
          />
        )}
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
