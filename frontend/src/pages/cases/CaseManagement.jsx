import { useState, useEffect, useCallback } from 'react'
import { Card, Input, Table, Tag, Button, Tree, Radio, Space, Pagination, Select, Modal, Upload, message, Form, Popconfirm, Tooltip, Empty, Spin, TreeSelect } from 'antd'
import { SearchOutlined, UploadOutlined, DownloadOutlined, PlusOutlined, BranchesOutlined, SyncOutlined, InboxOutlined, SettingOutlined, EditOutlined, PauseCircleOutlined, PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons'
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
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 导入
  const [importOpen, setImportOpen] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)

  // 新建用例
  const [createCaseOpen, setCreateCaseOpen] = useState(false)
  const [createCaseForm] = Form.useForm()
  const [savingCase, setSavingCase] = useState(false)

  // 新建模块
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderForm] = Form.useForm()
  const [savingFolder, setSavingFolder] = useState(false)

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

  // ---- 新建模块 ----
  const handleCreateFolder = async () => {
    let values
    try { values = await folderForm.validateFields() } catch { return }
    if (!currentBranch) { message.warning('请先选择分支'); return }
    setSavingFolder(true)
    try {
      const params = new URLSearchParams({ name: values.name })
      if (values.parentId) params.set('parentId', values.parentId)
      await api.post(`/projects/${projectId}/branches/${currentBranch}/folders?${params}`)
      message.success('模块创建成功')
      setFolderModalOpen(false)
      folderForm.resetFields()
      fetchFolders()
    } catch { /* */ } finally { setSavingFolder(false) }
  }

  // 从 folderTree 中根据 id 找到 folder name（递归查找）
  const findFolderNameById = (nodes, targetId) => {
    for (const n of nodes) {
      if (n.id === targetId) return n.name
      if (n.children?.length) {
        const found = findFolderNameById(n.children, targetId)
        if (found) return found
      }
    }
    return null
  }

  // 构建模块 TreeSelect 数据（支持 N 层，显示完整路径）
  const buildFolderTreeSelect = (nodes, parentPath = '') => nodes.map(n => {
    const fullPath = parentPath ? `${parentPath} / ${n.name}` : n.name
    return {
      value: n.name,
      title: fullPath,
      id: n.id,
      fullPath,
      children: n.children?.length > 0 ? buildFolderTreeSelect(n.children, fullPath) : undefined,
    }
  })
  const folderTreeSelectData = buildFolderTreeSelect(folderTree)

  // 构建父模块 TreeSelect（创建模块时选父级）
  const buildParentTreeSelect = (nodes, parentPath = '') => nodes.map(n => {
    const fullPath = parentPath ? `${parentPath} / ${n.name}` : n.name
    return {
      value: n.id,
      title: fullPath,
      children: n.children?.length > 0 ? buildParentTreeSelect(n.children, fullPath) : undefined,
    }
  })
  const parentTreeSelectData = buildParentTreeSelect(folderTree)

  // ---- 新建用例 ----
  const handleCreateCase = async () => {
    let values
    try { values = await createCaseForm.validateFields() } catch { return }
    if (!currentBranch) { message.warning('请先选择分支'); return }
    setSavingCase(true)
    try {
      await api.post(`/projects/${projectId}/branches/${currentBranch}/cases`, {
        title: values.title,
        type: values.type,
        module: values.module,
        priority: values.priority || 'P2',
        steps: [{ action: '待补充' }],
      })
      message.success('用例创建成功')
      setCreateCaseOpen(false)
      createCaseForm.resetFields()
      fetchCases()
      fetchFolders()
    } catch { /* */ } finally { setSavingCase(false) }
  }

  // ---- 导出 ----
  // ---- 导出 Excel（后端生成） ----
  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    if (!currentBranch) { message.warning('请先选择分支'); return }
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (statusFilter) params.set('automationStatus', statusFilter)
      if (selectedFolderId) params.set('folderId', selectedFolderId)

      const token = localStorage.getItem('token')
      const res = await fetch(`/api/projects/${projectId}/branches/${currentBranch}/cases/export/excel?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        message.error('导出失败')
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `用例导出-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch {
      message.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

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

  // ---- 列表列（可配置） ----
  const allColumns = [
    { key: 'caseCode', title: '用例ID', dataIndex: 'caseCode', width: 155, defaultVisible: true, render: v => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#86909c' }}>{v}</span> },
    { key: 'title', title: '标题', dataIndex: 'title', ellipsis: true, defaultVisible: true, fixed: true, render: (v, row) => (
      <span
        onClick={() => navigate(`/projects/${projectId}/cases/${row.id}?branchId=${currentBranch}`)}
        style={{ color: '#1d2129', cursor: 'pointer', fontWeight: 500 }}
        onMouseEnter={e => e.target.style.color = '#7c8cf8'}
        onMouseLeave={e => e.target.style.color = '#1d2129'}
      >{v}</span>
    )},
    { key: 'type', title: '类型', dataIndex: 'type', width: 65, defaultVisible: true, render: v => <Tag color={v === 'api' ? '#e6f4ff' : '#f6ffed'} style={{ color: v === 'api' ? '#7c8cf8' : '#6ecf96' }}>{v?.toUpperCase()}</Tag> },
    { key: 'priority', title: '优先级', dataIndex: 'priority', width: 68, align: 'center', defaultVisible: true, render: v => <Tag style={{ background: priorityBg[v], color: priorityColors[v], border: 'none' }}>{v}</Tag> },
    { key: 'module', title: '模块', dataIndex: 'module', width: 100, defaultVisible: false, render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'subModule', title: '子模块', dataIndex: 'subModule', width: 100, defaultVisible: false, render: v => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
    { key: 'automationStatus', title: '状态', dataIndex: 'automationStatus', width: 100, defaultVisible: true, render: v => <Tag style={{ background: statusBg[v] || '#f5f5f7', color: statusColors[v] || '#a8adb6', border: 'none' }}>{statusMap[v] || v}</Tag> },
    { key: 'source', title: '来源', dataIndex: 'source', width: 60, align: 'center', defaultVisible: true, render: v => <span style={{ fontSize: 12, color: '#c0c4cc' }}>{v === 'imported' ? '导入' : '手动'}</span> },
    { key: 'isFlaky', title: 'Flaky', dataIndex: 'isFlaky', width: 46, align: 'center', defaultVisible: true, render: v => v ? <Tag color="#fff7e6" style={{ color: '#f5b87a', border: 'none' }}>F</Tag> : null },
    { key: 'scriptRefFile', title: '脚本文件', dataIndex: 'scriptRefFile', width: 200, ellipsis: true, defaultVisible: false, render: v => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#86909c' }}>{v || '-'}</span> },
    { key: 'teaId', title: 'TEA ID', dataIndex: 'teaId', width: 150, defaultVisible: false, render: v => <span style={{ fontSize: 12, color: '#86909c' }}>{v || '-'}</span> },
    { key: 'createdAt', title: '创建时间', dataIndex: 'createdAt', width: 150, defaultVisible: false, render: v => <span style={{ fontSize: 12, color: '#8c919e' }}>{v ? new Date(v).toLocaleString('zh-CN') : '-'}</span> },
    { key: 'updatedAt', title: '更新时间', dataIndex: 'updatedAt', width: 150, defaultVisible: false, render: v => <span style={{ fontSize: 12, color: '#8c919e' }}>{v ? new Date(v).toLocaleString('zh-CN') : '-'}</span> },
    { key: 'actions', title: '操作', width: 60, align: 'center', defaultVisible: true, render: (_, row) => (
      <Popconfirm title="确定删除此用例？" onConfirm={async () => {
        try {
          await api.del(`/projects/${projectId}/branches/${currentBranch}/cases/${row.id}`)
          message.success('已删除')
          fetchCases()
        } catch { /* */ }
      }}>
        <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#f08a8e' }} />
      </Popconfirm>
    )},
  ]

  const [visibleColumnKeys, setVisibleColumnKeys] = useState(() =>
    allColumns.filter(c => c.defaultVisible).map(c => c.key)
  )
  const [columnSettingOpen, setColumnSettingOpen] = useState(false)

  const columns = [
    ...allColumns.filter(c => c.fixed || visibleColumnKeys.includes(c.key)),
    {
      title: (
        <Tooltip title="列设置">
          <SettingOutlined
            onClick={() => setColumnSettingOpen(true)}
            style={{ color: '#bfc4cd', cursor: 'pointer', fontSize: 14 }}
            onMouseEnter={e => e.target.style.color = '#6b7ef5'}
            onMouseLeave={e => e.target.style.color = '#bfc4cd'}
          />
        </Tooltip>
      ),
      key: '_settings',
      width: 40,
      align: 'center',
      render: () => null,
    },
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
        <Card style={{ width: 240, flexShrink: 0, overflow: 'auto' }}
          styles={{ body: { padding: '12px 8px' }, header: { padding: '0 16px', minHeight: 40, borderBottom: '1px solid #f2f3f5' } }}
          title={<span style={{ fontSize: 13, fontWeight: 600 }}>用例导航</span>}
          extra={<Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setFolderModalOpen(true)} style={{ color: '#6b7ef5' }} />}>
          {treeData.length > 0 ? (
            <Tree
              treeData={treeData}
              defaultExpandAll
              onSelect={onTreeSelect}
              blockNode
              style={{ fontSize: 13 }}
              selectedKeys={selectedFolderId ? [selectedFolderId] : []}
              titleRender={(node) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>{node.title}</span>
                  <Popconfirm
                    title="确定删除此目录？"
                    description="仅允许删除空目录"
                    onConfirm={async (e) => {
                      e?.stopPropagation()
                      try {
                        await api.del(`/projects/${projectId}/branches/${currentBranch}/folders/${node.key}`)
                        message.success('目录已删除')
                        fetchFolders()
                      } catch { /* request.js 显示错误 */ }
                    }}
                    onCancel={e => e?.stopPropagation()}
                  >
                    <Button type="text" size="small" icon={<DeleteOutlined />}
                      onClick={e => e.stopPropagation()}
                      style={{ color: '#c0c4cc', opacity: 0.5, fontSize: 11 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0.5} />
                  </Popconfirm>
                </div>
              )}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#8c919e', fontSize: 12 }}>
              暂无目录
              <br />
              <Button type="link" size="small" onClick={() => setFolderModalOpen(true)}>+ 创建模块</Button>
            </div>
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
                  <Radio.Button value="archived">已归档</Radio.Button>
                </Radio.Group>
              </Space>
              <Space>
                <Button icon={<UploadOutlined />} size="small" onClick={() => setImportOpen(true)}>导入</Button>
                <Button icon={<DownloadOutlined />} size="small" onClick={handleExport} loading={exporting}>导出</Button>
                <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => {
                  createCaseForm.resetFields()
                  if (selectedFolderId) {
                    const folderName = findFolderNameById(folderTree, selectedFolderId)
                    if (folderName) createCaseForm.setFieldValue('module', folderName)
                  }
                  setCreateCaseOpen(true)
                }}>新建用例</Button>
              </Space>
            </div>
            {selectedRowKeys.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#e6f4ff', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#7c8cf8' }}>已选 {selectedRowKeys.length} 条</span>
                <Popconfirm title={`确定归档 ${selectedRowKeys.length} 条用例？`} onConfirm={async () => {
                  try {
                    await api.post(`/projects/${projectId}/branches/${currentBranch}/cases/batch`, { caseIds: selectedRowKeys, action: 'archive' })
                    message.success('批量归档成功'); setSelectedRowKeys([]); fetchCases()
                  } catch { /* */ }
                }}>
                  <Button size="small" type="link">批量归档</Button>
                </Popconfirm>
                <Select size="small" placeholder="修改优先级" style={{ width: 110 }}
                  onChange={async (val) => {
                    try {
                      await api.post(`/projects/${projectId}/branches/${currentBranch}/cases/batch`, { caseIds: selectedRowKeys, action: 'set_priority', priority: val })
                      message.success('优先级已修改'); setSelectedRowKeys([]); fetchCases()
                    } catch { /* */ }
                  }}
                  options={['P0','P1','P2','P3'].map(p => ({ value: p, label: p }))}
                />
                <Popconfirm title={`确定删除 ${selectedRowKeys.length} 条用例？`} onConfirm={async () => {
                  for (const caseId of selectedRowKeys) {
                    try { await api.del(`/projects/${projectId}/branches/${currentBranch}/cases/${caseId}`) } catch { /* */ }
                  }
                  message.success('批量删除成功'); setSelectedRowKeys([]); fetchCases()
                }}>
                  <Button size="small" type="link" danger>批量删除</Button>
                </Popconfirm>
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
              rowSelection={{ selectedRowKeys: selectedRowKeys, onChange: setSelectedRowKeys }}
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

      {/* 新建用例弹窗 */}
      <Modal
        title="新建用例"
        open={createCaseOpen}
        onOk={handleCreateCase}
        onCancel={() => setCreateCaseOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={savingCase}
        width={520}
      >
        <Form form={createCaseForm} layout="vertical" style={{ marginTop: 12 }} initialValues={{ type: 'api', priority: 'P2' }}>
          <Form.Item name="title" label="用例标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：登录成功跳转首页" maxLength={200} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="type" label="测试类型" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={[{ value: 'api', label: 'API' }, { value: 'e2e', label: 'E2E' }]} />
            </Form.Item>
            <Form.Item name="priority" label="优先级" style={{ flex: 1 }}>
              <Select options={[{ value: 'P0', label: 'P0' }, { value: 'P1', label: 'P1' }, { value: 'P2', label: 'P2' }, { value: 'P3', label: 'P3' }]} />
            </Form.Item>
          </div>
          <div>
            <Form.Item name="module" label="所属目录" rules={[{ required: true, message: '请选择目录' }]}>
              <TreeSelect
                placeholder="选择目录"
                showSearch
                treeNodeFilterProp="title"
                treeData={folderTreeSelectData}
                treeDefaultExpandAll
                style={{ width: '100%' }}
                notFoundContent={<span style={{ color: '#8c919e', fontSize: 12 }}>无目录，请先在左侧导航创建</span>}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 新建模块弹窗 */}
      <Modal
        title="新建模块"
        open={folderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => { setFolderModalOpen(false); folderForm.resetFields() }}
        okText="创建"
        cancelText="取消"
        confirmLoading={savingFolder}
        width={420}
      >
        <Form form={folderForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="模块名称"
            rules={[{ required: true, message: '请输入模块名称' }, { pattern: /^[A-Za-z0-9_-]+$/, message: '仅允许字母、数字、下划线、横线' }]}
          >
            <Input placeholder="如：AUTH、USER_MGMT" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="parentId" label="父模块（可选）">
            <TreeSelect
              placeholder="顶级模块（不选则为一级模块）"
              allowClear
              treeData={parentTreeSelectData}
              treeDefaultExpandAll
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 列设置弹窗 */}
      <Modal
        title="列表字段设置"
        open={columnSettingOpen}
        onCancel={() => setColumnSettingOpen(false)}
        footer={[
          <Button key="reset" onClick={() => setVisibleColumnKeys(allColumns.filter(c => c.defaultVisible).map(c => c.key))}>恢复默认</Button>,
          <Button key="ok" type="primary" onClick={() => setColumnSettingOpen(false)}>确定</Button>,
        ]}
        width={400}
      >
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: '#8c919e', marginBottom: 12 }}>勾选需要显示的列（标题列始终显示）</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allColumns.filter(c => !c.fixed).map(col => (
              <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: visibleColumnKeys.includes(col.key) ? '#f0f7ff' : 'transparent' }}>
                <input
                  type="checkbox"
                  checked={visibleColumnKeys.includes(col.key)}
                  onChange={e => {
                    if (e.target.checked) {
                      setVisibleColumnKeys(prev => [...prev, col.key])
                    } else {
                      setVisibleColumnKeys(prev => prev.filter(k => k !== col.key))
                    }
                  }}
                />
                <span style={{ fontSize: 13 }}>{col.title}</span>
                {col.defaultVisible && <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', border: 'none', background: '#e6f4ff', color: '#7c8cf8' }}>默认</Tag>}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
