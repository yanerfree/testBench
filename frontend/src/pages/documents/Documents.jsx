import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Table, Tag, Space, Typography, Modal, Form, Input, Select, TreeSelect,
  message, Empty, Drawer, Popconfirm, Alert,
} from 'antd'
import {
  PlusOutlined, FileTextOutlined, DeleteOutlined, EyeOutlined,
  RobotOutlined, LoadingOutlined, CopyOutlined, CodeOutlined, DesktopOutlined, BulbOutlined,
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
  const [createOpen, setCreateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genContent, setGenContent] = useState('')
  const [previewDoc, setPreviewDoc] = useState(null)
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folderCaseCount, setFolderCaseCount] = useState(null)
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

  // 加载文件夹树
  useEffect(() => {
    if (!projectId || !createOpen) return
    api.get(`/projects/${projectId}/branches`).then(res => {
      const branch = (res.data || []).find(b => b.status === 'active') || res.data?.[0]
      if (branch) {
        api.get(`/projects/${projectId}/branches/${branch.id}/folders`).then(r => {
          setFolders(buildTreeData(r.data || []))
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [projectId, createOpen])

  // 选择文件夹后查询用例数
  const handleFolderChange = async (folderId) => {
    setSelectedFolder(folderId)
    if (!folderId) { setFolderCaseCount(null); return }
    try {
      const branches = await api.get(`/projects/${projectId}/branches`)
      const branch = (branches.data || []).find(b => b.status === 'active') || branches.data?.[0]
      if (branch) {
        const res = await api.get(`/projects/${projectId}/branches/${branch.id}/cases?folderId=${folderId}&pageSize=1`)
        setFolderCaseCount(res.data?.length > 0 ? (res.pagination?.total || res.data.length) : 0)
      }
    } catch { setFolderCaseCount(null) }
  }

  const handleGenerate = async () => {
    try {
      const values = await createForm.validateFields()
      setGenerating(true)
      setGenContent('')

      api.stream(`/projects/${projectId}/documents/generate`, {
        title: values.title,
        docType: values.docType || 'manual',
        folderId: selectedFolder || undefined,
        additionalInfo: values.additionalInfo || undefined,
      }, {
        onChunk: (data) => { if (data.content) setGenContent(prev => prev + data.content) },
        onDone: (data) => {
          message.success('文档生成完成')
          setGenerating(false)
          setCreateOpen(false)
          createForm.resetFields()
          setGenContent('')
          setSelectedFolder(null)
          setFolderCaseCount(null)
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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); setGenContent(''); setSelectedFolder(null); setFolderCaseCount(null) }}>生成文档</Button>
      </div>

      {docs.length === 0 && !loading ? (
        <Card>
          <Empty description={null} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <div style={{ textAlign: 'left', maxWidth: 640, margin: '0 auto' }}>
              <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>如何生成文档？</Text>

              <Card size="small" style={{ marginBottom: 10, background: '#f0f5ff', border: '1px solid #d6e4ff' }}>
                <Text strong><DesktopOutlined /> 方式一：Web 生成（纯文字初稿）</Text>
                <div style={{ fontSize: 13, lineHeight: 1.8, marginTop: 6 }}>
                  <div>1. 点击右上角 <Tag color="green">生成文档</Tag></div>
                  <div>2. 选择一个 <b>用例模块</b>（比如"用户管理"），AI 只读取该模块的用例</div>
                  <div>3. 粘贴 <b>业务背景</b>（系统介绍、需求文档摘要等），让 AI 理解上下文</div>
                  <div>4. AI 根据用例步骤整理成结构化文档</div>
                  <div style={{ color: '#fa8c16', marginTop: 4 }}>限制：无法自动截图，适合快速产出文字初稿</div>
                </div>
              </Card>

              <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
                <Text strong><CodeOutlined /> 方式二：Claude Code 生成（推荐，带截图）</Text>
                <div style={{ fontSize: 13, lineHeight: 1.8, marginTop: 6 }}>
                  <div><b>前提：</b>需要有被测系统的代码和运行环境</div>
                  <div style={{ marginTop: 6 }}><b>操作步骤：</b></div>
                  <div>1. 在被测系统的项目目录下打开终端</div>
                  <div>2. 运行 <Tag>claude</Tag> 启动 Claude Code</div>
                  <div>3. 告诉 AI：<i>"根据这个系统生成操作手册，截图保存到 docs/ 目录"</i></div>
                  <div>4. AI 会自动读代码 → 理解功能 → 操作页面 → 截图 → 写文档</div>
                  <div>5. 文档和截图直接生成在项目目录中</div>
                  <div style={{ marginTop: 6 }}>
                    <Text type="secondary">MCP Server 地址（如需连接平台数据）：</Text>
                    <Tag>{mcpUrl}</Tag>
                  </div>
                </div>
              </Card>
            </div>
          </Empty>
        </Card>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={docs} loading={loading} pagination={false} size="small" />
      )}

      {/* 生成弹窗 */}
      <Modal
        title={<Space><RobotOutlined /> Web 生成文档（纯文字）</Space>}
        open={createOpen}
        onCancel={() => { if (!generating) { setCreateOpen(false); setGenContent('') } }}
        width={720}
        footer={generating ? null : [
          <Button key="cancel" onClick={() => setCreateOpen(false)}>取消</Button>,
          <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={handleGenerate}>
            开始生成{folderCaseCount != null ? `（基于 ${folderCaseCount} 条用例）` : ''}
          </Button>,
        ]}
      >
        {!generating ? (
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
              <Form.Item label={
                <span>
                  用例范围
                  {folderCaseCount != null && <Tag style={{ marginLeft: 8 }} color="blue">{folderCaseCount} 条用例</Tag>}
                </span>
              }>
                <TreeSelect
                  placeholder="选择模块文件夹（不选则读取全部）"
                  treeData={folders}
                  value={selectedFolder}
                  onChange={handleFolderChange}
                  allowClear
                  treeDefaultExpandAll
                />
              </Form.Item>
            </div>

            <Form.Item
              name="additionalInfo"
              label="业务背景 / 系统介绍"
              extra="粘贴系统介绍、需求文档或 PRD 摘要，AI 会据此生成更准确的文档"
            >
              <TextArea rows={5} placeholder={"粘贴系统和业务背景，例如：\n\n本系统是测试管理平台 testBench，面向 QA 团队：\n- 管理测试用例（按模块组织，支持优先级/标签）\n- 管理 API 接口定义（可导入 Postman）\n- 创建和执行测试计划\n- AI 辅助生成用例和脚本\n\n目标读者：新入职的测试工程师"} />
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

function buildTreeData(folders) {
  if (!folders || !folders.length) return []
  const map = {}
  folders.forEach(f => { map[f.id] = { ...f, key: f.id, value: f.id, title: `${f.name} (${f.caseCount || 0})`, children: [] } })
  const tree = []
  folders.forEach(f => {
    if (f.parentId && map[f.parentId]) {
      map[f.parentId].children.push(map[f.id])
    } else {
      tree.push(map[f.id])
    }
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
