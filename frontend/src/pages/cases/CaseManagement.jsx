import { useState, useMemo } from 'react'
import { Card, Input, Table, Tag, Button, Tree, Radio, Space, Pagination } from 'antd'
import { SearchOutlined, UploadOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { mockModules, mockCases } from '../../mock/data'

const priorityColors = { P0: '#dc4446', P1: '#fa8c16', P2: '#4C8BF5', P3: '#86909c' }
const statusColors = { '已自动化': '#52c41a', '待自动化': '#fa8c16', '脚本已移除': '#dc4446' }

export default function CaseManagement() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [selectedModule, setSelectedModule] = useState(null)
  const [selectedSub, setSelectedSub] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedRows, setSelectedRows] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const treeData = [
    { title: 'API 测试', key: 'type-api', children: mockModules.map(m => ({
      title: `${m.icon} ${m.label}`, key: m.id,
      children: m.subs.map(s => ({ title: `${s.label} (${s.count})`, key: `${m.id}|${s.id}` }))
    }))},
    { title: 'E2E 测试', key: 'type-e2e', children: mockModules.map(m => ({
      title: `${m.icon} ${m.label}`, key: `${m.id}-e2e`,
      children: m.subs.map(s => ({ title: `${s.label} (${s.count})`, key: `${m.id}-e2e|${s.id}` }))
    }))},
  ]

  const filtered = useMemo(() => {
    let r = mockCases
    if (selectedModule) r = r.filter(c => c.moduleId === selectedModule)
    if (selectedSub) r = r.filter(c => c.subModuleId === selectedSub)
    if (keyword) { const k = keyword.toLowerCase(); r = r.filter(c => c.title.toLowerCase().includes(k) || c.id.toLowerCase().includes(k)) }
    if (statusFilter !== 'all') r = r.filter(c => c.status === statusFilter)
    return r
  }, [selectedModule, selectedSub, keyword, statusFilter])

  const paged = filtered.slice((page-1)*pageSize, page*pageSize)

  const onTreeSelect = (keys) => {
    if (!keys.length) { setSelectedModule(null); setSelectedSub(null); return }
    const k = keys[0]
    if (k.includes('|')) {
      const [mod, sub] = k.split('|')
      setSelectedModule(mod.replace('-e2e', ''))
      setSelectedSub(sub)
    } else {
      setSelectedModule(k.replace('-e2e', '').replace('type-api', '').replace('type-e2e', '') || null)
      setSelectedSub(null)
    }
    setPage(1)
  }

  const columns = [
    { title: '用例ID', dataIndex: 'id', width: 155, render: v => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#86909c' }}>{v}</span> },
    { title: '标题', dataIndex: 'title', ellipsis: true, render: (v, row) => (
      <span
        onClick={() => navigate(`/projects/${projectId}/cases/${row.id}`)}
        style={{ color: '#1d2129', cursor: 'pointer', fontWeight: 500 }}
        onMouseEnter={e => e.target.style.color = '#4C8BF5'}
        onMouseLeave={e => e.target.style.color = '#1d2129'}
      >{v}</span>
    )},
    { title: '类型', dataIndex: 'type', width: 65, render: v => <Tag color={v==='API'?'#e6f4ff':'#f6ffed'} style={{ color: v==='API'?'#4C8BF5':'#52c41a' }}>{v}</Tag> },
    { title: '模块', dataIndex: 'moduleCode', width: 85 },
    { title: '子模块', dataIndex: 'subModuleLabel', width: 80, render: v => <span style={{ color: '#86909c' }}>{v}</span> },
    { title: '优先级', dataIndex: 'priority', width: 68, align: 'center', render: v => <Tag style={{ background: priorityColors[v], color: '#fff', border: 'none' }}>{v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 100, render: v => <Tag style={{ background: statusColors[v]+'18', color: statusColors[v], border: 'none' }}>{v}</Tag> },
    { title: '来源', dataIndex: 'source', width: 50, align: 'center', render: v => <span style={{ fontSize: 12, color: '#c0c4cc' }}>{v}</span> },
    { title: 'Flaky', width: 46, align: 'center', render: (_, r) => r.flaky ? <Tag color="#fff7e6" style={{ color: '#fa8c16', border: 'none' }}>F</Tag> : null },
  ]

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 96px)' }}>
      {/* 左侧树 */}
      <Card style={{ width: 240, flexShrink: 0, overflow: 'auto' }} styles={{ body: { padding: '12px 8px' }, header: { padding: '0 16px', minHeight: 40, borderBottom: '1px solid #f2f3f5' } }}
        title={<span style={{ fontSize: 13, fontWeight: 600 }}>用例导航</span>}>
        <Tree treeData={treeData} defaultExpandAll onSelect={onTreeSelect} blockNode style={{ fontSize: 13 }} />
      </Card>

      {/* 右侧列表 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {/* 工具栏 */}
        <Card styles={{ body: { padding: '12px 16px' } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={12}>
              <Input prefix={<SearchOutlined style={{ color: '#c0c4cc' }} />} placeholder="搜索用例ID或标题" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1) }} allowClear style={{ width: 260 }} />
              <Radio.Group value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} size="small" buttonStyle="solid">
                <Radio.Button value="all">全部 ({mockCases.length})</Radio.Button>
                <Radio.Button value="已自动化">已自动化</Radio.Button>
                <Radio.Button value="待自动化">待自动化</Radio.Button>
                <Radio.Button value="脚本已移除">已移除</Radio.Button>
              </Radio.Group>
            </Space>
            <Space>
              <Button icon={<UploadOutlined />} size="small">导入</Button>
              <Button icon={<DownloadOutlined />} size="small">导出</Button>
              <Button type="primary" icon={<PlusOutlined />} size="small">新建用例</Button>
            </Space>
          </div>
          {selectedRows.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#e6f4ff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#4C8BF5' }}>已选 {selectedRows.length} 条</span>
              <Button size="small" type="link">批量移动</Button>
              <Button size="small" type="link">批量归档</Button>
              <Button size="small" type="link">修改优先级</Button>
              <Button size="small" type="link">加入计划</Button>
            </div>
          )}
        </Card>

        {/* 表格 */}
        <Card style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} styles={{ body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column' } }}>
          <Table
            dataSource={paged}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ y: 'calc(100vh - 330px)' }}
            rowSelection={{ selectedRowKeys: selectedRows, onChange: setSelectedRows }}
            style={{ flex: 1 }}
            onRow={(record) => ({
              style: { cursor: 'pointer' },
              onDoubleClick: () => navigate(`/projects/${projectId}/cases/${record.id}`),
            })}
          />
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f2f3f5', display: 'flex', justifyContent: 'flex-end' }}>
            <Pagination current={page} pageSize={pageSize} total={filtered.length}
              showSizeChanger pageSizeOptions={[20,50,100]} size="small" showTotal={t => `共 ${t} 条`}
              onChange={(p,s) => { setPage(p); setPageSize(s) }} />
          </div>
        </Card>
      </div>
    </div>
  )
}
