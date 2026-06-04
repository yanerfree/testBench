import { useState, useEffect, useRef } from 'react'
import { Button, Select, Space, Tag, Tooltip, Upload, message, Modal, Input, Spin, Empty } from 'antd'
import {
  SaveOutlined, HistoryOutlined, CodeOutlined, UploadOutlined,
  ImportOutlined, PlayCircleOutlined, CopyOutlined,
} from '@ant-design/icons'
import Editor from '@monaco-editor/react'

const langMap = { python: 'python', typescript: 'typescript' }

export default function ScriptEditor({
  projectId, branchId, caseId, scriptType,
  accentColor = '#1890ff',
  onRunScript,
}) {
  const [script, setScript] = useState(null)
  const [versions, setVersions] = useState([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteContent, setPasteContent] = useState('')
  const editorRef = useRef(null)

  const apiBase = `/api/projects/${projectId}/branches/${branchId}/cases/${caseId}/scripts`
  const token = localStorage.getItem('token')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchActive = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/active?type=${scriptType}`, { headers })
      const data = await res.json()
      if (data.data) {
        setScript(data.data)
        setContent(data.data.content || '')
        setDirty(false)
      } else {
        setScript(null)
        setContent('')
      }
    } catch { /* */ }
    finally { setLoading(false) }
  }

  const fetchVersions = async () => {
    try {
      const res = await fetch(`${apiBase}?type=${scriptType}`, { headers })
      const data = await res.json()
      setVersions(data.data || [])
    } catch { /* */ }
  }

  useEffect(() => {
    if (caseId && scriptType) { fetchActive(); fetchVersions() }
  }, [caseId, scriptType])

  const handleSave = async (newContent) => {
    const body = newContent || content
    if (!body.trim()) { message.warning('脚本内容不能为空'); return }
    setSaving(true)
    try {
      const res = await fetch(apiBase, {
        method: 'POST', headers,
        body: JSON.stringify({
          scriptType,
          content: body,
          fileName: script?.fileName || `test_${scriptType}.py`,
          funcName: script?.funcName || null,
          language: script?.language || 'python',
          source: 'manual',
        }),
      })
      const data = await res.json()
      if (data.data) {
        setScript(data.data)
        setContent(data.data.content)
        setDirty(false)
        message.success(`已保存 v${data.data.version}`)
        fetchVersions()
      }
    } catch { message.error('保存失败') }
    finally { setSaving(false) }
  }

  const handleActivateVersion = async (scriptId) => {
    try {
      const res = await fetch(`${apiBase}/${scriptId}/activate`, { method: 'POST', headers })
      const data = await res.json()
      if (data.data) {
        setScript(data.data)
        setContent(data.data.content)
        setDirty(false)
        message.success(`已切换到 v${data.data.version}`)
        fetchVersions()
      }
    } catch { message.error('版本切换失败') }
  }

  const handleCreate = (initialContent = '') => {
    const tpl = initialContent || (scriptType === 'api'
      ? `import pytest\nimport httpx\n\n\nBASE_URL = "http://localhost:8000"\n\n\ndef test_example():\n    \"\"\"示例测试\"\"\"\n    response = httpx.get(f"{BASE_URL}/api/health")\n    assert response.status_code == 200\n`
      : `from playwright.sync_api import Page\n\n\ndef test_example(page: Page):\n    \"\"\"示例 UI 测试\"\"\"\n    page.goto("http://localhost:3000")\n    assert page.title()\n`)
    setContent(tpl)
    setScript({ language: scriptType === 'ui' ? 'typescript' : 'python', fileName: `test_${scriptType}.py` })
    setDirty(true)
  }

  const handleUpload = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      setContent(text)
      setScript(prev => prev ? { ...prev } : { language: file.name.endsWith('.ts') ? 'typescript' : 'python', fileName: file.name })
      setDirty(true)
      message.success(`已加载 ${file.name}`)
    }
    reader.readAsText(file)
    return false
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><Spin tip="加载脚本..." /></div>

  if (!script && !dirty) return (
    <div style={{ padding: '16px 0' }}>
      <Empty description={`暂无${scriptType === 'api' ? '接口' : 'UI'}测试脚本`} image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Space>
            <Button type="primary" icon={<CodeOutlined />} onClick={() => handleCreate()}>创建脚本</Button>
            <Upload accept=".py,.ts" showUploadList={false} beforeUpload={handleUpload}>
              <Button icon={<UploadOutlined />}>上传文件</Button>
            </Upload>
            <Button icon={<ImportOutlined />} onClick={() => setShowPaste(true)}>粘贴代码</Button>
          </Space>
        </div>
      </Empty>
      <Modal title="粘贴脚本代码" open={showPaste} onCancel={() => setShowPaste(false)}
        onOk={() => { if (pasteContent.trim()) { handleCreate(pasteContent); setShowPaste(false); setPasteContent('') } }}>
        <Input.TextArea rows={12} value={pasteContent} onChange={e => setPasteContent(e.target.value)}
          placeholder="在此粘贴 Python / TypeScript 测试脚本..." style={{ fontFamily: 'monospace', fontSize: 13 }} />
      </Modal>
    </div>
  )

  const language = langMap[script?.language] || 'python'

  return (
    <div style={{ border: '1px solid #f2f3f5', borderRadius: 8, overflow: 'hidden' }}>
      {/* 工具栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', background: '#1e1e1e', borderBottom: '1px solid #333',
      }}>
        <Space size={8}>
          <Tag color={accentColor} style={{ fontSize: 11, margin: 0 }}>{language}</Tag>
          {script?.fileName && <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#aaa' }}>{script.fileName}</span>}
          {dirty && <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>未保存</Tag>}
          {script?.version && <Tag style={{ fontSize: 10, margin: 0, background: '#333', color: '#aaa', border: 'none' }}>v{script.version}</Tag>}
        </Space>
        <Space size={6}>
          {versions.length > 1 && (
            <Select size="small" style={{ width: 100 }} value={script?.id}
              onChange={(v) => handleActivateVersion(v)}
              options={versions.map(ver => ({
                value: ver.id,
                label: <span style={{ fontSize: 11 }}>v{ver.version}{ver.status === 'active' ? ' ✓' : ''}</span>,
              }))} />
          )}
          <Tooltip title="保存 (Ctrl+S)">
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving}
              disabled={!dirty} onClick={() => handleSave()}>保存</Button>
          </Tooltip>
          <Tooltip title="复制代码">
            <Button size="small" type="text" icon={<CopyOutlined />} style={{ color: '#aaa' }}
              onClick={() => { navigator.clipboard.writeText(content); message.success('已复制') }} />
          </Tooltip>
          {onRunScript && (
            <Tooltip title="运行脚本">
              <Button size="small" icon={<PlayCircleOutlined />}
                style={{ color: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => onRunScript(script)}>运行</Button>
            </Tooltip>
          )}
        </Space>
      </div>

      {/* Monaco 编辑器 */}
      <Editor
        height={400}
        language={language}
        theme="vs-dark"
        value={content}
        onChange={(val) => { setContent(val || ''); setDirty(true) }}
        onMount={(editor) => {
          editorRef.current = editor
          editor.addCommand(2097 /* KeyMod.CtrlCmd | KeyCode.KeyS */, () => handleSave())
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          wordWrap: 'on',
          padding: { top: 8 },
        }}
      />

      {/* 粘贴弹窗 */}
      <Modal title="粘贴脚本代码" open={showPaste} onCancel={() => setShowPaste(false)}
        onOk={() => { if (pasteContent.trim()) { setContent(pasteContent); setDirty(true); setShowPaste(false); setPasteContent('') } }}>
        <Input.TextArea rows={12} value={pasteContent} onChange={e => setPasteContent(e.target.value)}
          placeholder="在此粘贴代码..." style={{ fontFamily: 'monospace', fontSize: 13 }} />
      </Modal>
    </div>
  )
}
