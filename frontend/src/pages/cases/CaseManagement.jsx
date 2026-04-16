import { useState, useEffect, useCallback } from 'react'
import { Card, Input, Table, Tag, Button, Tree, Radio, Space, Pagination, Select, Modal, Upload, message, Form, Popconfirm, Tooltip, Empty, Spin } from 'antd'
import { SearchOutlined, UploadOutlined, DownloadOutlined, PlusOutlined, BranchesOutlined, SyncOutlined, InboxOutlined, SettingOutlined, EditOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'

const priorityColors = { P0: '#f08a8e', P1: '#f5b87a', P2: '#7c8cf8', P3: '#a8adb6' }
const priorityBg = { P0: '#fef0f1', P1: '#fef5eb', P2: '#f0f1fe', P3: '#f5f5f7' }
const statusMap = { automated: '已自动化', pending: '待自动化', script_removed: '脚本已移除', archived: '已归档' }
const statusColors = { automated: '#6ecf96', pending: '#f5b87a', script_removed: '#f08a8e', archived: '#a8adb6' }
const statusBg = { automated: '#eefbf3', pending: '#fef5eb', script_removed: '#fef0f1', archived: '#f5f5f7' }

// ---- 分支管理弹窗（保持不变） ----
function BranchManageModal({ projectId, open, onClose, onBranchesChanged }) {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editBranch, setEditBranch] = useState(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const fetchBranches = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/branches`)
      setBranches(res.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { if (open) fetchBranches() }, [open, fetchBranches])

  const activeBranches = branches.filter(b => b.status === 'active')
  const archivedBranches = branches.filter(b => b.status === 'archived')

  const handleCreate = async () => {
    let values
    try { values = await createForm.validateFields() } catch { return }
    setSaving(true)
    try {
      await api.post(`/projects/${projectId}/branches`, { name: values.name, branch: values.branch || 'main', description: values.description || null })
      message.success('分支配置创建成功')
      setCreateOpen(false); createForm.resetFields(); fetchBranches(); onBranchesChanged?.()
    } catch { /* */ } finally { setSaving(false) }
  }

  const handleEdit = async () => {
    let values
    try { values = await editForm.validateFields() } catch { return }
    setSaving(true)
    try {
      await api.put(`/projects/${projectId}/branches/${editBranch.id}`, { branch: values.branch, description: values.description || null })
      message.success('分支配置已更新')
      setEditBranch(null); fetchBranches(); onBranchesChanged?.()
    } catch { /* */ } finally { setSaving(false) }
  }

  const handleArchive = async (b) => { try { await api.post(`/projects/${projectId}/branches/${b.id}/archive`); message.success(`「${b.name}」已归档`); fetchBranches(); onBranchesChanged?.() } catch { /* */ } }
  const handleActivate = async (b) => { try { await api.post(`/projects/${projectId}/branches/${b.id}/activate`); message.success(`「${b.name}」已恢复`); fetchBranches(); onBranchesChanged?.() } catch { /* */ } }
  const openEdit = (b) => { setEditBranch(b); editForm.setFieldsValue({ branch: b.branch, description: b.description }) }

  const renderBranchItem = (b) => (
    <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: '#fafbfc', marginBottom: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{b.name}<span style={{ fontSize: 12, color: '#8c919e', marginLeft: 8 }}>({b.branch})</span></div>
        {b.description && <div style={{ fontSize: 12, color: '#8c919e', marginTop: 2 }}>{b.description}</div>}
      </div>
      <Space size={4}>
        <Tooltip title="编辑"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(b)} /></Tooltip>
        {b.status === 'active' ? (
          <Popconfirm title={`确定归档「${b.name}」？`} onConfirm={() => handleArchive(b)}><Tooltip title="归档"><Button size="small" type="text" icon={<PauseCircleOutlined />} style={{ color: '#f5b87a' }} /></Tooltip></Popconfirm>
        ) : (
          <Tooltip title="恢复"><Button size="small" type="text" icon={<PlayCircleOutlined />} style={{ color: '#6ecf96' }} onClick={() => handleActivate(b)} /></Tooltip>
        )}
      </Space>
    </div>
  )

  return (
    <>
      <Modal title="分支配置管理" open={open} onCancel={onClose} footer={null} width={560}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateOpen(true) }}>新建分支配置</Button>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 24 }}>加载中...</div> : (<>
          {activeBranches.length > 0 && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: '#8c919e', marginBottom: 6, fontWeight: 600 }}>活跃（{activeBranches.length}）</div>{activeBranches.map(renderBranchItem)}</div>}
          {archivedBranches.length > 0 && <div><div style={{ fontSize: 12, color: '#8c919e', marginBottom: 6, fontWeight: 600 }}>已归档（{archivedBranches.length}）</div>{archivedBranches.map(renderBranchItem)}</div>}
        </>)}
      </Modal>
      <Modal title="新建分支配置" open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)} okText="创建" cancelText="取消" confirmLoading={saving} width={420}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入名称' }, { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅允许字母、数字、下划线、中划线' }, { max: 50 }]}><Input placeholder="如 release-v2（创建后不可修改）" /></Form.Item>
          <Form.Item name="branch" label="Git 分支名" initialValue="main"><Input placeholder="如 main、release/2.0" /></Form.Item>
          <Form.Item name="description" label="描述"><Input placeholder="可选" /></Form.Item>
        </Form>
      </Modal>
      <Modal title={`编辑分支配置 — ${editBranch?.name || ''}`} open={!!editBranch} onOk={handleEdit} onCancel={() => setEditBranch(null)} okText="保存" cancelText="取消" confirmLoading={saving} width={420}>
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="配置名称"><Input value={editBranch?.name} disabled /></Form.Item>
          <Form.Item name="branch" label="Git 分支名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input placeholder="可选" /></Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ---- 主页面 ----
export default function CaseManagement() {
  const navigate = useNavigate()
  const { projectId } = useParams()

  // 分支
  const [branches, setBranches] = useState([])
  const [currentBranch, setCurrentBranch] = useState(null)
  const [branchManageOpen, setBranchManageOpen] = useState(false)

  // 目录树
  const [folderTree, setFolderTree] = useState([])
  const [selectedFolderId, setSelectedFolderId] = useState(null)

  // 用例列表
  const [cases, setCases] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedRows, setSelectedRows] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 导入
  const [importOpen, setImportOpen] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)

  // ---- 数据加载 ----
  const fetchBranches = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await api.get(`/projects/${projectId}/branches`)
      const list = res.data || []
      setBranches(list)
      if (list.length > 0 && !list.find(b => b.id === currentBranch)) {
        const active = list.find(b => b.status === 'active')
        if (active) setCurrentBranch(active.id)
      }
    } catch { /* */ }
  }, [projectId])

  const fetchFolders = useCallback(async () => {
    if (!projectId || !currentBranch) return
    try {
      const res = await api.get(`/projects/${projectId}/branches/${currentBranch}/folders`)
      setFolderTree(res.data || [])
    } catch { /* */ }
  }, [projectId, currentBranch])

  const fetchCases = useCallback(async () => {
    if (!projectId || !currentBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize })
      if (keyword) params.set('keyword', keyword)
      if (statusFilter) params.set('automationStatus', statusFilter)
      if (selectedFolderId) params.set('folderId', selectedFolderId)
      const res = await api.get(`/projects/${projectId}/branches/${currentBranch}/cases?${params}`)
      setCases(res.data || [])
      setTotal(res.pagination?.total || 0)
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, currentBranch, page, pageSize, keyword, statusFilter, selectedFolderId])

  useEffect(() => { fetchBranches() }, [fetchBranches])
  useEffect(() => { fetchFolders() }, [fetchFolders])
  useEffect(() => { fetchCases() }, [fetchCases])

  const activeBranches = branches.filter(b => b.status === 'active')
  const branch = branches.find(b => b.id === currentBranch)

  // ---- 导入 ----
  const handleImportFile = async (file) => {
    if (!currentBranch) return false
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/projects/${projectId}/branches/${currentBranch}/cases/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data?.error?.message || '导入失败')
      } else {
        setImportResult(data.data)
      }
    } catch { message.error('导入失败') } finally { setImporting(false) }
    return false
  }

  const handleImportClose = () => {
    setImportOpen(false)
    if (importResult) {
      setImportResult(null)
      fetchCases()
      fetchFolders()
    }
  }

  // ---- 目录树 ----
  const buildTreeData = (nodes) => nodes.map(n => ({
    title: `${n.name} (${n.caseCount})`,
    key: n.id,
    children: n.children?.length > 0 ? buildTreeData(n.children) : undefined,
  }))

  const treeData = buildTreeData(folderTree)

  const onTreeSelect = (keys) => {
    setSelectedFolderId(keys.length > 0 ? keys[0] : null)
    setPage(1)
  }

  // ---- 列表列 ----
  const columns = [
    { title: '用例ID', dataIndex: 'caseCode', width: 155, render: v => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#86909c' }}>{v}</span> },
    { title: '标题', dataIndex: 'title', ellipsis: true, render: (v, row) => (
      <span
        onClick={() => navigate(`/projects/${projectId}/cases/${row.id}?branchId=${currentBranch}`)}
        style={{ color: '#1d2129', cursor: 'pointer', fontWeight: 500 }}
        onMouseEnter={e => e.target.style.color = '#7c8cf8'}
        onMouseLeave={e => e.target.style.color = '#1d2129'}
      >{v}</span>
    )},
    { title: '类型', dataIndex: 'type', width: 65, render: v => <Tag color={v === 'api' ? '#e6f4ff' : '#f6ffed'} style={{ color: v === 'api' ? '#7c8cf8' : '#6ecf96' }}>{v?.toUpperCase()}</Tag> },
    { title: '优先级', dataIndex: 'priority', width: 68, align: 'center', render: v => <Tag style={{ background: priorityBg[v], color: priorityColors[v], border: 'none' }}>{v}</Tag> },
    { title: '状态', dataIndex: 'automationStatus', width: 100, render: v => <Tag style={{ background: statusBg[v] || '#f5f5f7', color: statusColors[v] || '#a8adb6', border: 'none' }}>{statusMap[v] || v}</Tag> },
    { title: '来源', dataIndex: 'source', width: 60, align: 'center', render: v => <span style={{ fontSize: 12, color: '#c0c4cc' }}>{v === 'imported' ? '导入' : '手动'}</span> },
    { title: 'Flaky', dataIndex: 'isFlaky', width: 46, align: 'center', render: v => v ? <Tag color="#fff7e6" style={{ color: '#f5b87a', border: 'none' }}>F</Tag> : null },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: 'calc(100vh - 96px)' }}>
      {/* 分支选择栏 */}
      <Card styles={{ body: { padding: '8px 16px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BranchesOutlined style={{ color: '#6b7ef5' }} />
            <span style={{ fontSize: 13, color: '#8c919e' }}>分支配置</span>
            <Select
              value={currentBranch}
              onChange={v => { setCurrentBranch(v); setPage(1); setSelectedFolderId(null) }}
              size="small" style={{ width: 180 }}
              options={activeBranches.map(b => ({ value: b.id, label: <span>{b.name} <span style={{ fontSize: 11, color: '#bfc4cd' }}>({b.branch})</span></span> }))}
            />
            {branch?.lastSyncAt && (
              <span style={{ fontSize: 11, color: '#bfc4cd' }}>最近同步: {new Date(branch.lastSyncAt).toLocaleString('zh-CN')} · {branch.lastCommitSha?.substring(0, 7) || '-'}</span>
            )}
            <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => setBranchManageOpen(true)} style={{ color: '#8c919e' }}>管理</Button>
          </div>
          <Button size="small" icon={<SyncOutlined />}>更新脚本</Button>
        </div>
      </Card>

      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
        {/* 左侧树 */}
        <Card style={{ width: 240, flexShrink: 0, overflow: 'auto' }} styles={{ body: { padding: '12px 8px' }, header: { padding: '0 16px', minHeight: 40, borderBottom: '1px solid #f2f3f5' } }}
          title={<span style={{ fontSize: 13, fontWeight: 600 }}>用例导航</span>}>
          {treeData.length > 0 ? (
            <Tree treeData={treeData} defaultExpandAll onSelect={onTreeSelect} blockNode style={{ fontSize: 13 }} selectedKeys={selectedFolderId ? [selectedFolderId] : []} />
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#8c919e', fontSize: 12 }}>暂无目录，导入用例后自动生成</div>
          )}
        </Card>

        {/* 右侧列表 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* 工具栏 */}
          <Card styles={{ body: { padding: '12px 16px' } }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={12}>
                <Input prefix={<SearchOutlined style={{ color: '#c0c4cc' }} />} placeholder="搜索用例ID或标题" value={keyword}
                  onChange={e => { setKeyword(e.target.value); setPage(1) }} allowClear style={{ width: 260 }}
                  onPressEnter={fetchCases} />
                <Radio.Group value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} size="small" buttonStyle="solid">
                  <Radio.Button value="">全部 ({total})</Radio.Button>
                  <Radio.Button value="automated">已自动化</Radio.Button>
                  <Radio.Button value="pending">待自动化</Radio.Button>
                  <Radio.Button value="script_removed">已移除</Radio.Button>
                </Radio.Group>
              </Space>
              <Space>
                <Button icon={<UploadOutlined />} size="small" onClick={() => setImportOpen(true)}>导入</Button>
                <Button icon={<DownloadOutlined />} size="small">导出</Button>
                <Button type="primary" icon={<PlusOutlined />} size="small">新建用例</Button>
              </Space>
            </div>
            {selectedRows.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#e6f4ff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#7c8cf8' }}>已选 {selectedRows.length} 条</span>
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
              dataSource={cases}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="small"
              loading={loading}
              scroll={{ y: 'calc(100vh - 330px)' }}
              rowSelection={{ selectedRowKeys: selectedRows, onChange: setSelectedRows }}
              style={{ flex: 1 }}
              locale={{ emptyText: <Empty description="暂无用例" /> }}
              onRow={(record) => ({ style: { cursor: 'pointer' }, onDoubleClick: () => navigate(`/projects/${projectId}/cases/${record.id}?branchId=${currentBranch}`) })}
            />
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f2f3f5', display: 'flex', justifyContent: 'flex-end' }}>
              <Pagination current={page} pageSize={pageSize} total={total}
                showSizeChanger pageSizeOptions={[20, 50, 100]} size="small" showTotal={t => `共 ${t} 条`}
                onChange={(p, s) => { setPage(p); setPageSize(s) }} />
            </div>
          </Card>
        </div>
      </div>

      {/* 导入用例弹窗 */}
      <Modal
        title="导入用例（tea-cases.json）"
        open={importOpen}
        onCancel={handleImportClose}
        footer={importResult ? [<Button key="ok" type="primary" onClick={handleImportClose}>完成</Button>] : null}
        width={520}
      >
        {!importResult ? (
          <Upload.Dragger accept=".json" showUploadList={false} beforeUpload={handleImportFile} disabled={importing} style={{ padding: '32px 0' }}>
            {importing ? <Spin tip="正在导入..." /> : (<>
              <p><InboxOutlined style={{ fontSize: 40, color: '#6b7ef5' }} /></p>
              <p style={{ fontSize: 14, color: '#2e3138', marginTop: 8 }}>点击或拖拽上传 tea-cases.json</p>
              <p style={{ fontSize: 12, color: '#8c919e' }}>支持 TEA 框架生成的标准用例清单文件</p>
            </>)}
          </Upload.Dragger>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: '新增', count: importResult.new, color: '#6ecf96', bg: '#eefbf3' },
              { label: '更新', count: importResult.updated, color: '#6b7ef5', bg: '#eef0fe' },
              { label: '移除', count: importResult.removed, color: '#f08a8e', bg: '#fef0f1' },
              { label: '跳过', count: importResult.skipped, color: '#a8adb6', bg: '#f5f5f7' },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '16px 0', background: s.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 12, color: '#8c919e' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 分支管理弹窗 */}
      <BranchManageModal projectId={projectId} open={branchManageOpen} onClose={() => setBranchManageOpen(false)} onBranchesChanged={fetchBranches} />
    </div>
  )
}
