import { useState } from 'react'
import { Table, Button, Tag, Space, message, Input } from 'antd'
import { ImportOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { api } from '../utils/request'

const PRIORITY_COLORS = { P0: 'red', P1: 'orange', P2: 'blue', P3: 'default' }

export default function AICasePreview({ cases, projectId, branchId, folderId, onImported }) {
  const [selectedKeys, setSelectedKeys] = useState(() => cases.map((_, i) => i))
  const [importing, setImporting] = useState(false)
  const [editIdx, setEditIdx] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const handleImport = async () => {
    const selected = selectedKeys.map(i => cases[i]).filter(Boolean)
    if (!selected.length) { message.warning('请至少选择一条用例'); return }
    setImporting(true)
    try {
      const res = await api.post(
        `/projects/${projectId}/branches/${branchId}/ai/apply-cases`,
        { cases: selected, folderId: folderId || null },
      )
      const d = res.data
      message.success(`导入完成：成功 ${d.imported} 条，跳过 ${d.skipped} 条`)
      onImported?.(d)
    } catch {
      message.error('导入失败')
    } finally {
      setImporting(false)
    }
  }

  const startEdit = (idx) => {
    setEditIdx(idx)
    setEditTitle(cases[idx].title)
  }

  const confirmEdit = () => {
    if (editIdx !== null && editTitle.trim()) {
      cases[editIdx].title = editTitle.trim()
    }
    setEditIdx(null)
  }

  const columns = [
    {
      title: '用例标题',
      dataIndex: 'title',
      render: (text, _, idx) => editIdx === idx ? (
        <Space>
          <Input
            size="small"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onPressEnter={confirmEdit}
            style={{ width: 300 }}
          />
          <Button size="small" icon={<CheckOutlined />} onClick={confirmEdit} type="link" />
          <Button size="small" icon={<CloseOutlined />} onClick={() => setEditIdx(null)} type="link" />
        </Space>
      ) : (
        <Space>
          <span>{text}</span>
          <Button size="small" icon={<EditOutlined />} type="link" onClick={() => startEdit(idx)} />
        </Space>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (p) => <Tag color={PRIORITY_COLORS[p] || 'default'}>{p || 'P2'}</Tag>,
    },
    {
      title: '步骤数',
      dataIndex: 'steps',
      width: 80,
      render: (steps) => Array.isArray(steps) ? steps.length : 0,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 180,
      render: (tags) => (tags || []).map(t => <Tag key={t}>{t}</Tag>),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>共 {cases.length} 条用例，已选 {selectedKeys.length} 条</span>
        <Button
          type="primary"
          icon={<ImportOutlined />}
          loading={importing}
          onClick={handleImport}
          disabled={!selectedKeys.length}
        >
          导入选中用例
        </Button>
      </div>
      <Table
        dataSource={cases.map((c, i) => ({ ...c, key: i }))}
        columns={columns}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
        }}
        pagination={false}
        size="small"
        scroll={{ y: 350 }}
      />
    </div>
  )
}
