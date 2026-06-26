import { useState, useRef, useEffect } from 'react'
import { Button, Space, Alert, Spin } from 'antd'
import { LoadingOutlined, StopOutlined, CheckCircleOutlined, CopyOutlined } from '@ant-design/icons'
import { api } from '../utils/request'
import { copyToClipboard } from '../utils/clipboard'

const STATUS = { IDLE: 'idle', STREAMING: 'streaming', DONE: 'done', ERROR: 'error' }

export default function AIStreamPanel({
  url,
  body,
  autoStart = false,
  onDone,
  onStart,
  style,
}) {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const contentRef = useRef('')
  const panelRef = useRef(null)

  const startGenerate = () => {
    if (!url || !body) return
    setStatus(STATUS.STREAMING)
    setContent('')
    setError('')
    contentRef.current = ''
    onStart?.()

    const { abort } = api.stream(url, body, {
      onChunk: (data) => {
        if (data.content) {
          contentRef.current += data.content
          setContent(contentRef.current)
        }
      },
      onDone: (data) => {
        setStatus(STATUS.DONE)
        const finalContent = data.content || contentRef.current
        setContent(finalContent)
        onDone?.(finalContent)
      },
      onError: (msg) => {
        setStatus(STATUS.ERROR)
        setError(msg)
      },
    })
    abortRef.current = abort
  }

  const handleStop = () => {
    abortRef.current?.()
    setStatus(STATUS.DONE)
    onDone?.(contentRef.current)
  }

  const handleCopy = () => {
    copyToClipboard(content)
  }

  useEffect(() => {
    if (autoStart && status === STATUS.IDLE) startGenerate()
  }, [autoStart])

  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
  }, [content])

  useEffect(() => {
    return () => abortRef.current?.()
  }, [])

  return (
    <div style={style}>
      {status === STATUS.IDLE && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Button type="primary" onClick={startGenerate}>
            开始 AI 生成
          </Button>
        </div>
      )}

      {status === STATUS.STREAMING && (
        <div>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spin indicator={<LoadingOutlined spin />} size="small" />
            <span style={{ color: '#1677ff' }}>AI 正在生成...</span>
            <Button size="small" icon={<StopOutlined />} onClick={handleStop} danger>
              停止
            </Button>
          </div>
          <pre ref={panelRef} style={preStyle}>{content}<span style={cursorStyle}>|</span></pre>
        </div>
      )}

      {status === STATUS.DONE && (
        <div>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span style={{ color: '#52c41a' }}>生成完成</span>
            <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
            <Button size="small" onClick={startGenerate}>重新生成</Button>
          </div>
          <pre ref={panelRef} style={preStyle}>{content}</pre>
        </div>
      )}

      {status === STATUS.ERROR && (
        <div>
          <Alert type="error" message="生成失败" description={error} showIcon style={{ marginBottom: 12 }} />
          <Button onClick={startGenerate}>重试</Button>
        </div>
      )}
    </div>
  )
}

const preStyle = {
  background: '#1e1e1e',
  color: '#d4d4d4',
  padding: 16,
  borderRadius: 8,
  maxHeight: 500,
  overflow: 'auto',
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const cursorStyle = {
  animation: 'blink 1s step-end infinite',
  color: '#569cd6',
}
