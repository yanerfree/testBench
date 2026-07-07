import { Button, Tag, Space, Input, Table, Popconfirm } from 'antd'
import { PlusOutlined, RobotOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons'

const PRIORITY_COLORS = { P0: 'red', P1: 'orange', P2: 'blue', P3: 'default' }

export default function ScenarioList({
  scenarios, selectedFolderId, loading,
  searchKeyword, onSearchChange,
  statusFilter, onStatusChange,
  onSelectScenario, onDelete,
  onGenerate, onCreate,
}) {
  const filtered = (() => {
    let data = selectedFolderId ? scenarios.filter(s => s.folderId === selectedFolderId) : scenarios
    if (statusFilter !== 'all') data = data.filter(s => s.status === statusFilter)
    if (searchKeyword) data = data.filter(s => s.title.includes(searchKeyword) || s.code?.includes(searchKeyword))
    return data
  })()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Space size={8} wrap>
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索场景ID或标题"
            value={searchKeyword}
            onChange={e => onSearchChange(e.target.value)}
            style={{ width: 200 }}
            size="small"
            allowClear
          />
          <Space size={0}>
            {[
              { key: 'all', label: '全部' },
              { key: 'draft', label: '草稿' },
              { key: 'published', label: '已发布' },
              { key: 'deprecated', label: '已废弃' },
            ].map(f => (
              <Button key={f.key} size="small" type={statusFilter === f.key ? 'primary' : 'default'}
                onClick={() => onStatusChange(f.key)} style={{ borderRadius: 0, ...(f.key === 'all' ? { borderRadius: '4px 0 0 4px' } : f.key === 'deprecated' ? { borderRadius: '0 4px 4px 0' } : {}) }}>
                {f.label}
              </Button>
            ))}
          </Space>
        </Space>
        <Space size={8}>
          <Button icon={<RobotOutlined />} type="primary" onClick={onGenerate}>
            AI 生成测试
          </Button>
          <Button icon={<PlusOutlined />} onClick={onCreate}>
            新建场景
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={filtered}
          pagination={{ pageSize: 20, size: 'small', showTotal: t => `共 ${t} 条` }}
          onRow={r => ({ onClick: () => onSelectScenario(r.id), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: '场景ID', dataIndex: 'code', width: 120,
              render: v => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#86909c' }}>{v}</span>,
            },
            {
              title: '标题', dataIndex: 'title', ellipsis: true,
              render: t => <span style={{ fontWeight: 500 }}>{t}</span>,
            },
            {
              title: '来源', dataIndex: 'source', width: 60,
              render: v => <Tag color={v === 'ai' ? 'blue' : 'default'} style={{ fontSize: 11 }}>{v === 'ai' ? 'AI' : '手动'}</Tag>,
            },
            {
              title: '优先级', dataIndex: 'priority', width: 70,
              render: v => <Tag color={PRIORITY_COLORS[v]}>{v}</Tag>,
            },
            {
              title: '状态', dataIndex: 'status', width: 70,
              render: v => <Tag color={v === 'published' ? 'success' : v === 'deprecated' ? 'default' : undefined}>
                {v === 'published' ? '已发布' : v === 'deprecated' ? '已废弃' : '草稿'}
              </Tag>,
            },
            {
              title: '操作', width: 80,
              render: (_, r) => (
                <Space size={4} onClick={e => e.stopPropagation()}>
                  <Popconfirm title="确认删除？" onConfirm={() => onDelete(r.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
