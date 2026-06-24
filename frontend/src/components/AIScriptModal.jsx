import { useState, useRef, useEffect } from 'react'
import { Modal, Button, Space, message } from 'antd'
import { CodeOutlined, CopyOutlined } from '@ant-design/icons'
import AIStreamPanel from './AIStreamPanel'

export default function AIScriptModal({
  projectId,
  branchId,
  caseIds,
  open,
  onClose,
}) {
  const [generatedScript, setGeneratedScript] = useState('')

  const handleDone = (content) => {
    let script = content.trim()
    const match = script.match(/```(?:python)?\s*([\s\S]*?)```/)
    if (match) script = match[1].trim()
    setGeneratedScript(script)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript || '')
    message.success('脚本已复制到剪贴板')
  }

  const handleClose = () => {
    setGeneratedScript('')
    onClose()
  }

  const url = `/projects/${projectId}/branches/${branchId}/ai/generate-script`
  const body = caseIds?.length ? { caseIds, scriptType: 'api' } : null

  return (
    <Modal
      title={<Space><CodeOutlined /> AI 生成测试脚本</Space>}
      open={open}
      onCancel={handleClose}
      width={900}
      footer={[
        generatedScript && (
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy}>
            复制脚本
          </Button>
        ),
        <Button key="close" onClick={handleClose}>关闭</Button>,
      ].filter(Boolean)}
      destroyOnClose
    >
      <p style={{ color: '#86909c', marginBottom: 12 }}>
        基于选中的 {caseIds?.length || 0} 条用例生成 pytest + httpx 自动化测试脚本
      </p>
      <AIStreamPanel
        url={url}
        body={body}
        autoStart={!!body}
        onDone={handleDone}
      />
    </Modal>
  )
}
