import { useState } from 'react'
import { Input, Button, Upload, Collapse, Select, Space, Typography, message, Alert } from 'antd'
import { UploadOutlined, SendOutlined, FileMarkdownOutlined } from '@ant-design/icons'
import { api } from '../../../utils/request'

const { TextArea } = Input
const { Text } = Typography

export default function Stage1Input({ projectId, branchId, onTaskCreated }) {
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('paste')
  const [filename, setFilename] = useState(null)
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({})

  const charCount = content.length
  const tokenEstimate = Math.ceil(charCount * 1.5)

  const handleUpload = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setContent(e.target.result)
      setTitle(file.name.replace(/\.md$/, ''))
      setSource('upload')
      setFilename(file.name)
    }
    reader.readAsText(file)
    return false
  }

  const handleSubmit = async () => {
    if (!content.trim()) { message.warning('请输入或上传需求文档'); return }
    if (!title.trim()) { message.warning('请输入任务名称'); return }
    if (!branchId) { message.warning('请先在顶部选择分支'); return }

    setLoading(true)
    try {
      const res = await api.post(
        `/projects/${projectId}/branches/${branchId}/scenario-gen/tasks`,
        { title: title.trim(), contentMarkdown: content, source, filename, settings },
      )
      message.success('任务已创建')
      onTaskCreated?.(res.data)
    } catch { /* request.js handles */ }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Text strong>任务名称</Text>
        <Input
          placeholder="如：订单退款需求 v2"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ marginTop: 4 }}
          maxLength={200}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text strong>需求材料 *</Text>
          <Upload accept=".md" showUploadList={false} beforeUpload={handleUpload}>
            <Button size="small" icon={<UploadOutlined />}>上传 .md</Button>
          </Upload>
        </div>
        <TextArea
          placeholder="粘贴需求文档（Markdown / 纯文本），或点击右上角上传 .md 文件"
          value={content}
          onChange={e => { setContent(e.target.value); if (source === 'upload') setSource('paste') }}
          rows={12}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
        {filename && source === 'upload' && (
          <div style={{ marginTop: 4 }}>
            <FileMarkdownOutlined style={{ color: '#7cacf8', marginRight: 4 }} />
            <Text type="secondary">{filename}</Text>
          </div>
        )}
      </div>

      <Collapse
        ghost
        size="small"
        items={[{
          key: 'context',
          label: <Text type="secondary">增强上下文（可选）</Text>,
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>业务规则补充</Text>
                <TextArea
                  placeholder="补充 AI 可能不知道的业务规则，如：部分退款后订单状态保持已发货"
                  rows={3}
                  onChange={e => setSettings(s => ({ ...s, business_rules: e.target.value }))}
                />
              </div>
            </Space>
          ),
        }]}
        style={{ marginBottom: 16 }}
      />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', background: 'rgba(124,172,248,0.06)', borderRadius: 8,
      }}>
        <Space size="large">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {charCount.toLocaleString()} 字符
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            预估 ~{(tokenEstimate / 1000).toFixed(0)}k token
          </Text>
        </Space>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          loading={loading}
          disabled={!content.trim() || !title.trim()}
        >
          开始分析
        </Button>
      </div>

      {charCount > 200_000 && (
        <Alert
          type="warning"
          message={`文档超过 200,000 字符上限（当前 ${charCount.toLocaleString()}），请拆分后分批提交`}
          style={{ marginTop: 12 }}
          showIcon
        />
      )}
    </div>
  )
}
