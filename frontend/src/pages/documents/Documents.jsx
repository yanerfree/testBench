import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button, Card, Table, Tag, Space, Typography, Modal, Form, Input, Select,
  message, Empty, Drawer, Popconfirm, Divider,
} from 'antd'
import {
  PlusOutlined, FileTextOutlined, DeleteOutlined, EyeOutlined,
  RobotOutlined, LoadingOutlined, CopyOutlined, CodeOutlined, DesktopOutlined, DownloadOutlined,
  EditOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { marked } from 'marked'
import { api } from '../../utils/request'
import { copyToClipboard } from '../../utils/clipboard'

const { Text } = Typography
const { TextArea } = Input

const DOC_TYPE_LABELS = { manual: '操作手册', acceptance: '验收文档', demo: '演示文档' }
const DOC_TYPE_COLORS = { manual: 'blue', acceptance: 'green', demo: 'purple' }

// marked 配置
marked.setOptions({ breaks: true, gfm: true })

export default function Documents() {
  const { projectId } = useParams()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [ccForm] = Form.useForm()
  const [regenDocId, setRegenDocId] = useState(null)
  const [regenMode, setRegenMode] = useState(null) // null | 'choose' | 'optimize' | 'full'
  const [regenFeedback, setRegenFeedback] = useState('')
  const [taskResult, setTaskResult] = useState(null)

  // 平台生成
  const [platGenerating, setPlatGenerating] = useState(false)
  const [platContent, setPlatContent] = useState('')
  const [platProgress, setPlatProgress] = useState([])

  // 文档预览抽屉
  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const fetchDocs = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try { const res = await api.get(`/projects/${projectId}/documents`); setDocs(res.data || []) }
    catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const loadDoc = async (docId) => {
    try {
      const res = await api.get(`/projects/${projectId}/documents/${docId}`)
      setPreviewDoc(res.data)
      setPreviewOpen(true)
    } catch { /* */ }
  }

  const handleDelete = async (id) => {
    await api.del(`/projects/${projectId}/documents/${id}`).catch(() => {})
    message.success('已删除')
    if (previewDoc?.id === id) { setPreviewOpen(false); setPreviewDoc(null) }
    fetchDocs()
  }

  // 优化已有文档（不重新截图）
  const handleOptimize = async () => {
    if (!regenFeedback.trim()) { message.warning('请输入修改意见'); return }
    setPlatGenerating(true); setPlatContent(''); setPlatProgress([])
    setPlatProgress([`📝 正在根据修改意见优化文档...`])
    api.stream(`/projects/${projectId}/documents/${regenDocId}/optimize`, {
      feedback: regenFeedback,
    }, {
      onChunk: (data) => {
        if (data.type === 'chunk' && data.content) setPlatContent(prev => prev + data.content)
        if (data.type === 'error') { message.error(data.message); setPlatGenerating(false) }
      },
      onDone: (data) => {
        message.success('文档已优化')
        setPlatGenerating(false); setGenOpen(false)
        setRegenDocId(null); setRegenMode(null); setRegenFeedback('')
        fetchDocs()
        if (data?.docId) loadDoc(data.docId)
      },
      onError: (msg) => { message.error(msg); setPlatGenerating(false) },
    })
  }

  // 平台直接生成
  const handlePlatGenerate = async () => {
    try {
      const v = await ccForm.validateFields()
      setPlatGenerating(true); setPlatContent(''); setPlatProgress([])
      api.stream(`/projects/${projectId}/documents/generate-with-screenshots`, {
        systemUrl: v.systemUrl, username: v.username, password: v.password,
        title: v.title, docType: v.docType || 'manual',
        modules: v.modules || undefined, audience: v.audience || undefined,
        businessContext: v.businessContext || undefined,
        docId: regenDocId || undefined,
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
          message.success('文档已生成')
          setPlatGenerating(false); setGenOpen(false); ccForm.resetFields()
          setRegenDocId(null); setRegenMode(null); setRegenFeedback('')
          fetchDocs()
          if (data?.docId) loadDoc(data.docId)
        },
        onError: (msg) => { message.error(msg); setPlatGenerating(false) },
      })
    } catch { /* */ }
  }

  // Claude Code 任务
  const handleCCGenerate = async () => {
    try {
      const v = await ccForm.validateFields()
      const res = await api.post(`/projects/${projectId}/documents/tasks`, {
        _host: window.location.hostname + ':8000',
        systemUrl: v.systemUrl, username: v.username, password: v.password,
        title: v.title, docType: v.docType || 'manual',
        modules: v.modules || undefined, audience: v.audience || undefined,
        outputDir: v.outputDir || 'docs/', businessContext: v.businessContext || undefined,
      })
      setTaskResult(res.data)
    } catch { /* */ }
  }

  const columns = [
    { title: '标题', dataIndex: 'title', ellipsis: true, render: (t, r) => <a onClick={() => loadDoc(r.id)}>{t}</a> },
    { title: '类型', dataIndex: 'docType', width: 90, render: (t) => <Tag color={DOC_TYPE_COLORS[t]}>{DOC_TYPE_LABELS[t] || t}</Tag> },
    { title: '状态', dataIndex: 'status', width: 70, render: (s) => s === 'published' ? <Tag color="success">已生成</Tag> : <Tag>草稿</Tag> },
    { title: '时间', dataIndex: 'createdAt', width: 140, render: (t) => t?.slice(0, 16).replace('T', ' ') },
    {
      title: '操作', width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => loadDoc(r.id)}>查看</Button>
          <Button size="small" icon={<RobotOutlined />} onClick={() => {
            setGenOpen(true); setTaskResult(null); setRegenDocId(r.id)
            setRegenMode('choose'); setRegenFeedback('')
            ccForm.setFieldsValue({ title: r.title, docType: r.docType })
          }}>重新生成</Button>
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
          <Text type="secondary" style={{ fontSize: 13 }}>生成带截图的操作手册、演示文档、验收文档</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setGenOpen(true); setTaskResult(null); setRegenDocId(null); setRegenMode(null); setRegenFeedback(''); ccForm.resetFields() }}>
          生成文档
        </Button>
      </div>

      {docs.length === 0 && !loading ? (
        <Card>
          <Empty description="暂无文档，点击右上角生成" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={docs} loading={loading} pagination={false} size="small" />
      )}

      {/* 生成弹窗 */}
      <Modal
        title={<Space><FileTextOutlined /> {regenDocId && regenMode !== 'full' ? '重新生成文档' : '生成文档'}</Space>}
        open={genOpen}
        onCancel={() => { if (!platGenerating) { setGenOpen(false); setRegenMode(null); setRegenFeedback('') } }}
        width={720}
        footer={null}
      >
        {/* 重新生成 — 选择模式 */}
        {regenDocId && regenMode === 'choose' && !taskResult && !platGenerating ? (
          <div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#595959' }}>
              选择重新生成方式：
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card
                hoverable
                style={{ textAlign: 'center', cursor: 'pointer' }}
                onClick={() => setRegenMode('optimize')}
              >
                <EditOutlined style={{ fontSize: 28, color: '#1677ff', marginBottom: 8 }} />
                <div style={{ fontWeight: 600, marginBottom: 4 }}>优化内容</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  保留已有截图，根据你的修改意见重新写文档内容
                </Text>
              </Card>
              <Card
                hoverable
                style={{ textAlign: 'center', cursor: 'pointer' }}
                onClick={() => setRegenMode('full')}
              >
                <ReloadOutlined style={{ fontSize: 28, color: '#52c41a', marginBottom: 8 }} />
                <div style={{ fontWeight: 600, marginBottom: 4 }}>重新截图+生成</div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  重新打开系统截图并从头生成全新文档
                </Text>
              </Card>
            </div>
          </div>
        ) : regenDocId && regenMode === 'optimize' && !platGenerating ? (
          /* 优化模式 — 输入修改意见 */
          <div>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>基于现有文档内容和截图，根据修改意见进行优化</Text>
            </div>
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              <strong>修改意见：</strong>
              <span style={{ color: '#ff4d4f', fontSize: 12 }}> *必填</span>
            </div>
            <TextArea
              rows={5}
              value={regenFeedback}
              onChange={(e) => setRegenFeedback(e.target.value)}
              placeholder={"描述需要改进的部分，例如：\n• 截图引用搞错了，用户管理的截图应该是用户列表页面\n• 操作步骤不够详细，新增用户要写清楚每个字段\n• 缺少注意事项和常见问题说明\n• 2.3 节内容太简单，需要扩充"}
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setRegenMode('choose')}>返回</Button>
              <Button type="primary" icon={<RobotOutlined />} onClick={handleOptimize}>
                开始优化
              </Button>
            </div>
          </div>
        ) : !taskResult && !platGenerating ? (
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
              <Form.Item name="outputDir" label="输出目录" extra="仅 Claude Code 使用">
                <Input placeholder="docs/操作手册/" />
              </Form.Item>
              <Form.Item name="businessContext" label="业务背景（可选）">
                <TextArea rows={2} placeholder="系统介绍、PRD 摘要" />
              </Form.Item>
            </Form>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setGenOpen(false)}>取消</Button>
              <Space>
                <Button icon={<CodeOutlined />} onClick={handleCCGenerate}>生成 Claude Code 命令</Button>
                <Button type="primary" icon={<DesktopOutlined />} onClick={handlePlatGenerate}>平台直接生成</Button>
              </Space>
            </div>
          </div>
        ) : taskResult ? (
          <div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#52c41a' }}>✅ 任务已保存</div>
            {taskResult.instructions?.map((step, i) => <div key={i} style={{ fontSize: 13, lineHeight: 2 }}>{step}</div>)}
            <div style={{ margin: '16px 0', padding: '12px 16px', background: '#1e1e1e', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#86909c', marginBottom: 4 }}>复制到 Claude Code：</div>
              <div style={{ color: '#d4d4d4', fontFamily: 'monospace', fontSize: 13 }}>{taskResult.command}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setTaskResult(null)}>返回修改</Button>
              <Button type="primary" icon={<CopyOutlined />} onClick={() => { copyToClipboard(taskResult.command); message.success('已复制') }}>复制命令</Button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <LoadingOutlined style={{ fontSize: 24 }} />
              <div style={{ marginTop: 8, fontWeight: 500 }}>正在生成文档...</div>
            </div>
            {platProgress.length > 0 && (
              <div style={{ padding: '8px 12px', background: '#f6f7f9', borderRadius: 6, maxHeight: 150, overflow: 'auto', marginBottom: 12 }}>
                {platProgress.map((p, i) => <div key={i} style={{ fontSize: 12, color: '#595959', padding: '2px 0' }}>{p}</div>)}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 文档预览抽屉 */}
      <Drawer
        title={previewDoc?.title || ''}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        width={800}
        extra={previewDoc?.content && (
          <Space>
            <Button size="small" icon={<RobotOutlined />} onClick={() => {
              setPreviewOpen(false)
              setGenOpen(true); setTaskResult(null); setRegenDocId(previewDoc.id)
              setRegenMode('choose'); setRegenFeedback('')
              ccForm.setFieldsValue({ title: previewDoc.title, docType: previewDoc.docType })
            }}>重新生成</Button>
            <Button size="small" icon={<CopyOutlined />} onClick={() => { copyToClipboard(previewDoc.content); message.success('已复制') }}>复制</Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadFromApi(`/projects/${projectId}/documents/${previewDoc.id}/export-zip`, `${previewDoc.title}.zip`)}>下载</Button>
            <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => downloadFromApi(`/projects/${projectId}/documents/${previewDoc.id}/export-html`, `${previewDoc.title}.html`)}>导出 HTML</Button>
          </Space>
        )}
      >
        {previewDoc?.content && (
          <div
            className="markdown-body"
            style={{ fontSize: 14, lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: marked.parse(previewDoc.content) }}
          />
        )}
        <style>{`
          .markdown-body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
            color: #1f2328;
            word-wrap: break-word;
          }
          .markdown-body > *:first-child { margin-top: 0 !important; }

          /* Headings */
          .markdown-body h1 {
            font-size: 1.75em; font-weight: 700; line-height: 1.3;
            margin: 32px 0 16px; padding-bottom: 10px;
            border-bottom: 2px solid #d1d9e0;
          }
          .markdown-body h2 {
            font-size: 1.35em; font-weight: 600; line-height: 1.35;
            margin: 28px 0 14px; padding-bottom: 8px;
            border-bottom: 1px solid #d8dee4;
            color: #1f2328;
          }
          .markdown-body h3 {
            font-size: 1.15em; font-weight: 600; line-height: 1.4;
            margin: 22px 0 10px; color: #25292e;
          }
          .markdown-body h4 {
            font-size: 1em; font-weight: 600; line-height: 1.4;
            margin: 18px 0 8px; color: #32383f;
          }

          /* Paragraph */
          .markdown-body p { margin: 8px 0 12px; }

          /* Bold / Emphasis */
          .markdown-body strong { font-weight: 600; color: #1f2328; }
          .markdown-body em { color: #656d76; font-style: italic; }
          /* Image caption: em right after img (Typora pattern: *图：xxx*) */
          .markdown-body img + br + em,
          .markdown-body p > em:only-child {
            display: block; text-align: center; font-size: 0.85em;
            color: #656d76; margin: -4px 0 16px;
          }

          /* HR */
          .markdown-body hr {
            border: none; height: 2px;
            background: #d8dee4; margin: 28px 0;
          }

          /* Table */
          .markdown-body table {
            border-collapse: collapse; width: 100%;
            margin: 16px 0; overflow-x: auto; display: block;
            font-variant-numeric: tabular-nums;
          }
          .markdown-body thead { background: #f6f8fa; }
          .markdown-body th {
            font-weight: 600; text-align: left;
            padding: 10px 14px; font-size: 13px;
            border: 1px solid #d0d7de; background: #f6f8fa;
          }
          .markdown-body td {
            padding: 8px 14px; font-size: 13px;
            border: 1px solid #d0d7de; vertical-align: top;
          }
          .markdown-body tbody tr:nth-child(even) { background: #f6f8fa; }

          /* Blockquote */
          .markdown-body blockquote {
            border-left: 4px solid #1a7f37; padding: 12px 20px;
            margin: 16px 0; background: #dafbe1;
            color: #1f2328; border-radius: 0 6px 6px 0;
          }
          .markdown-body blockquote p { margin: 4px 0; }
          .markdown-body blockquote strong { color: #1a7f37; }

          /* Inline code */
          .markdown-body code {
            background: #eff1f3; padding: 2px 7px;
            border-radius: 4px; font-size: 0.9em;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
          }
          /* Code block */
          .markdown-body pre {
            background: #161b22; color: #e6edf3;
            border-radius: 8px; padding: 16px 20px;
            margin: 16px 0; overflow-x: auto;
            line-height: 1.5;
          }
          .markdown-body pre code {
            background: none; padding: 0; border-radius: 0;
            font-size: 13px; color: inherit;
          }

          /* Image */
          .markdown-body img {
            max-width: 100%; border-radius: 8px;
            border: 1px solid #d0d7de;
            margin: 12px 0 4px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          }

          /* Lists */
          .markdown-body ul, .markdown-body ol {
            padding-left: 24px; margin: 8px 0;
          }
          .markdown-body li { margin: 4px 0; line-height: 1.7; }
          .markdown-body li > p { margin: 2px 0; }
          .markdown-body ul ul, .markdown-body ol ul,
          .markdown-body ul ol, .markdown-body ol ol {
            margin: 2px 0;
          }

          /* Links */
          .markdown-body a { color: #0969da; text-decoration: none; }
          .markdown-body a:hover { text-decoration: underline; }
        `}</style>
      </Drawer>
    </div>
  )
}

async function downloadFromApi(url, filename) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) { message.error('下载失败'); return }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename; a.click()
  URL.revokeObjectURL(a.href)
}
