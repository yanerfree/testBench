import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Table, Tag, Space, Typography, Modal, Form, Input, Select,
  message, Empty, Drawer, Popconfirm, Alert, Upload, Tabs,
} from 'antd'
import {
  PlusOutlined, FileTextOutlined, DeleteOutlined, EyeOutlined,
  RobotOutlined, LoadingOutlined, CopyOutlined, UploadOutlined,
  DesktopOutlined, CodeOutlined, InboxOutlined, BulbOutlined,
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

  const mcpUrl = `http://${window.location.hostname}:8000/mcp/`

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
          <Text type="secondary" style={{ fontSize: 13 }}>根据测试用例和业务文档，生成操作手册、验收文档、培训教材</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); setGenContent('') }}>生成文档</Button>
      </div>

      {docs.length === 0 && !loading ? (
        <div>
          {/* 无文档时的引导说明 */}
          <Card style={{ marginBottom: 16 }}>
            <Empty description={null} image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <div style={{ textAlign: 'left', maxWidth: 600, margin: '0 auto' }}>
                <Text strong style={{ fontSize: 15 }}>如何生成文档？</Text>
                <div style={{ fontSize: 13, lineHeight: 2.2, marginTop: 8 }}>
                  <div style={{ padding: '8px 12px', background: '#f0f5ff', borderRadius: 6, marginBottom: 8 }}>
                    <Text strong><DesktopOutlined /> 方式一：Web 生成（基于已有用例）</Text>
                    <div style={{ color: '#595959' }}>
                      点击上方"生成文档"，AI 根据项目中的测试用例整理成文档。
                      <br/><Text type="warning">限制：无法自动截图，生成的是纯文字版本。适合快速产出初稿。</Text>
                    </div>
                  </div>
                  <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 6 }}>
                    <Text strong><CodeOutlined /> 方式二：Claude Code 生成（推荐）</Text>
                    <div style={{ color: '#595959' }}>
                      在终端用 Claude Code 连接被测系统，AI 可以：
                      <br/>- 读取系统代码，理解业务逻辑
                      <br/>- 自动操作系统并截图
                      <br/>- 生成带截图的完整操作文档到指定目录
                      <br/><Text type="success">适合生成正式的、带截图的操作手册和演示文档。</Text>
                    </div>
                  </div>
                </div>
              </div>
            </Empty>
          </Card>
        </div>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={docs} loading={loading} pagination={false} size="small" />
      )}

      {/* 生成弹窗 */}
      <Modal
        title={<Space><RobotOutlined /> 生成文档</Space>}
        open={createOpen}
        onCancel={() => { if (!generating) { setCreateOpen(false); setGenContent('') } }}
        width={720}
        footer={generating ? null : [
          <Button key="cancel" onClick={() => setCreateOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={handleGenerate}>开始生成</Button>,
        ]}
      >
        {!generating ? (
          <div>
            <Alert
              type="info"
              showIcon
              icon={<BulbOutlined />}
              closable
              style={{ marginBottom: 16 }}
              message="Web 模式生成的是纯文字文档（无截图）"
              description={
                <span style={{ fontSize: 12 }}>
                  AI 会根据项目中的测试用例整理成文档。如需带截图的正式文档，
                  建议通过 Claude Code 连接被测系统生成。
                </span>
              }
            />
            <Form form={createForm} layout="vertical">
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
                <Form.Item name="module" label="关联模块（可选）" tooltip="指定模块后只读取该模块的用例作为素材">
                  <Input placeholder="筛选模块相关用例" />
                </Form.Item>
              </div>
              <Form.Item
                name="additionalInfo"
                label="业务背景 / 参考文档"
                tooltip="粘贴需求文档、PRD 摘要、或系统介绍，AI 会据此生成更准确的文档"
              >
                <TextArea rows={5} placeholder={"粘贴业务背景信息，例如：\n\n本系统是公司内部的测试管理平台，主要功能包括：\n- 测试用例管理（增删改查、分模块组织）\n- 测试计划和执行\n- API 接口管理和 Mock\n\n目标读者：新入职的测试工程师"} />
              </Form.Item>
            </Form>
          </div>
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
          <Button icon={<CopyOutlined />} onClick={() => { copyToClipboard(previewDoc.content); message.success('已复制') }}>复制 Markdown</Button>
        )}
      >
        {previewDoc && (
          <div
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
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(c => c.trim())
    if (cells.every(c => c.trim().match(/^[-:]+$/))) return ''
    return '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0">' +
      cells.map(c => '<span style="flex:1;font-size:13px">' + c.trim() + '</span>').join('') + '</div>'
  })
  html = html.replace(/\n\n/g, '<br/><br/>')
  html = html.replace(/\n/g, '<br/>')
  return html
}
