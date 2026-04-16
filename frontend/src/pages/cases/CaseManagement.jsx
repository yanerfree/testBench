import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Input, Table, Tag, Button, Tree, Radio, Space, Pagination, Select, Modal, Upload, message, Form, Popconfirm, Tooltip } from 'antd'
import { SearchOutlined, UploadOutlined, DownloadOutlined, PlusOutlined, BranchesOutlined, SyncOutlined, InboxOutlined, SettingOutlined, EditOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../utils/request'
import { mockModules, mockCases } from '../../mock/data'

const priorityColors = { P0: '#f08a8e', P1: '#f5b87a', P2: '#7c8cf8', P3: '#a8adb6' }
const priorityBg = { P0: '#fef0f1', P1: '#fef5eb', P2: '#f0f1fe', P3: '#f5f5f7' }
const statusColors = { '已自动化': '#6ecf96', '待自动化': '#f5b87a', '脚本已移除': '#f08a8e' }
const statusBg = { '已自动化': '#eefbf3', '待自动化': '#fef5eb', '脚本已移除': '#fef0f1' }

// ---- 分支管理弹窗 ----
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
      await api.post(`/projects/${projectId}/branches`, {
        name: values.name,
        branch: values.branch || 'main',
        description: values.description || null,
      })
      message.success('分支配置创建成功')
      setCreateOpen(false)
      createForm.resetFields()
      fetchBranches()
      onBranchesChanged?.()
    } catch { /* */ } finally { setSaving(false) }
  }

  const handleEdit = async () => {
    let values
    try { values = await editForm.validateFields() } catch { return }
    setSaving(true)
    try {
      await api.put(`/projects/${projectId}/branches/${editBranch.id}`, {
        branch: values.branch,
        description: values.description || null,
      })
      message.success('分支配置已更新')
      setEditBranch(null)
      fetchBranches()
      onBranchesChanged?.()
    } catch { /* */ } finally { setSaving(false) }
  }

  const handleArchive = async (branch) => {
    try {
      await api.post(`/projects/${projectId}/branches/${branch.id}/archive`)
      message.success(`「${branch.name}」已归档`)
      fetchBranches()
      onBranchesChanged?.()
    } catch { /* */ }
  }

  const handleActivate = async (branch) => {
    try {
      await api.post(`/projects/${projectId}/branches/${branch.id}/activate`)
      message.success(`「${branch.name}」已恢复`)
      fetchBranches()
      onBranchesChanged?.()
    } catch { /* */ }
  }

  const openEdit = (b) => {
    setEditBranch(b)
    editForm.setFieldsValue({ branch: b.branch, description: b.description })
  }

  const renderBranchItem = (b) => (
    <div key={b.id} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', borderRadius: 8, background: '#fafbfc', marginBottom: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>
          {b.name}
          <span style={{ fontSize: 12, color: '#8c919e', marginLeft: 8 }}>({b.branch})</span>
        </div>
        {b.description && <div style={{ fontSize: 12, color: '#8c919e', marginTop: 2 }}>{b.description}</div>}
      </div>
      <Space size={4}>
        <Tooltip title="编辑 Git 分支名">
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(b)} />
        </Tooltip>
        {b.status === 'active' ? (
          <Popconfirm title={`确定归档「${b.name}」？归档后用例数据变为只读`} onConfirm={() => handleArchive(b)}>
            <Tooltip title="归档">
              <Button size="small" type="text" icon={<PauseCircleOutlined />} style={{ color: '#f5b87a' }} />
            </Tooltip>
          </Popconfirm>
        ) : (
          <Tooltip title="恢复">
            <Button size="small" type="text" icon={<PlayCircleOutlined />} style={{ color: '#6ecf96' }} onClick={() => handleActivate(b)} />
          </Tooltip>
        )}
      </Space>
    </div>
  )

  return (
    <>
      <Modal
        title="分支配置管理"
        open={open}
        onCancel={onClose}
        footer={null}
        width={560}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateOpen(true) }}>
            新建分支配置
          </Button>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 24 }}>加载中...</div> : (
          <>
            {activeBranches.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#8c919e', marginBottom: 6, fontWeight: 600 }}>活跃（{activeBranches.length}）</div>
                {activeBranches.map(renderBranchItem)}
              </div>
            )}
            {archivedBranches.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#8c919e', marginBottom: 6, fontWeight: 600 }}>已归档（{archivedBranches.length}）</div>
                {archivedBranches.map(renderBranchItem)}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* 创建分支子弹窗 */}
      <Modal
        title="新建分支配置"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={saving}
        width={420}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="配置名称" rules={[
            { required: true, message: '请输入名称' },
            { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅允许字母、数字、下划线、中划线' },
            { max: 50, message: '最长 50 字符' },
          ]}>
            <Input placeholder="如 release-v2（创建后不可修改）" />
          </Form.Item>
          <Form.Item name="branch" label="Git 分支名" initialValue="main">
            <Input placeholder="如 main、release/2.0、develop" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑分支子弹窗 */}
      <Modal
        title={`编辑分支配置 — ${editBranch?.name || ''}`}
        open={!!editBranch}
        onOk={handleEdit}
        onCancel={() => setEditBranch(null)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={420}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="配置名称">
            <Input value={editBranch?.name} disabled />
          </Form.Item>
          <Form.Item name="branch" label="Git 分支名" rules={[{ required: true, message: '请输入 Git 分支名' }]}>
            <Input placeholder="如 main、release/2.0" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ---- 主页面 ----
export default function CaseManagement() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [branches, setBranches] = useState([])
  const [currentBranch, setCurrentBranch] = useState(null)
  const [selectedModule, setSelectedModule] = useState(null)
  const [selectedSub, setSelectedSub] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedRows, setSelectedRows] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [importOpen, setImportOpen] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [branchManageOpen, setBranchManageOpen] = useState(false)

  // 从后端加载分支列表
  const fetchBranches = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await api.get(`/projects/${projectId}/branches`)
      const list = res.data || []
      setBranches(list)
      // 默认选中第一个活跃分支
      if (list.length > 0) {
        const active = list.find(b => b.status === 'active')
        if (active && !list.find(b => b.id === currentBranch)) {
          setCurrentBranch(active.id)
        }
      }
    } catch { /* request.js 已展示错误 */ }
  }, [projectId])

  useEffect(() => { fetchBranches() }, [fetchBranches])

  const activeBranches = branches.filter(b => b.status === 'active')
  const branch = branches.find(b => b.id === currentBranch)

  // 模拟解析 tea-cases.json
  const mockImportPreview = {
    total: 15,
    newCount: 8,
    updateCount: 5,
    removedCount: 2,
    cases: [
      { tea_id: 'auth_login_success', title: '登录成功跳转首页', module: 'AUTH', type: 'API', priority: 'P0', status: '新增' },
      { tea_id: 'auth_login_fail_lock', title: '登录失败锁定账号', module: 'AUTH', type: 'API', priority: 'P0', status: '新增' },
      { tea_id: 'auth_register_email', title: '邮箱注册流程', module: 'AUTH', type: 'API', priority: 'P1', status: '更新' },
      { tea_id: 'approval_submit', title: '发布审批提交', module: 'APPROVAL', type: 'API', priority: 'P0', status: '更新' },
      { tea_id: 'approval_reject', title: '发布审批驳回', module: 'APPROVAL', type: 'API', priority: 'P1', status: '新增' },
      { tea_id: 'api_create_basic', title: '创建API基础流程', module: 'API', type: 'API', priority: 'P0', status: '更新' },
      { tea_id: 'api_version_rollback', title: 'API版本回滚', module: 'API', type: 'API', priority: 'P1', status: '新增' },
      { tea_id: 'auth_token_expire', title: 'Token过期处理', module: 'AUTH', type: 'API', priority: 'P2', status: '移除' },
    ],
  }

  const handleImportFile = (file) => {
    setTimeout(() => setImportPreview(mockImportPreview), 500)
    return false
  }

  const handleImportConfirm = () => {
    message.success(`导入完成：新增 ${importPreview.newCount} / 更新 ${importPreview.updateCount} / 移除 ${importPreview.removedCount}`)
    setImportOpen(false)
    setImportPreview(null)
  }

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
        onMouseEnter={e => e.target.style.color = '#7c8cf8'}
        onMouseLeave={e => e.target.style.color = '#1d2129'}
      >{v}</span>
    )},
    { title: '类型', dataIndex: 'type', width: 65, render: v => <Tag color={v==='API'?'#e6f4ff':'#f6ffed'} style={{ color: v==='API'?'#7c8cf8':'#6ecf96' }}>{v}</Tag> },
    { title: '模块', dataIndex: 'moduleCode', width: 85 },
    { title: '子模块', dataIndex: 'subModuleLabel', width: 80, render: v => <span style={{ color: '#86909c' }}>{v}</span> },
    { title: '优先级', dataIndex: 'priority', width: 68, align: 'center', render: v => <Tag style={{ background: priorityBg[v], color: priorityColors[v], border: 'none' }}>{v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 100, render: v => <Tag style={{ background: statusBg[v], color: statusColors[v], border: 'none' }}>{v}</Tag> },
    { title: '来源', dataIndex: 'source', width: 50, align: 'center', render: v => <span style={{ fontSize: 12, color: '#c0c4cc' }}>{v}</span> },
    { title: 'Flaky', width: 46, align: 'center', render: (_, r) => r.flaky ? <Tag color="#fff7e6" style={{ color: '#f5b87a', border: 'none' }}>F</Tag> : null },
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
              onChange={v => { setCurrentBranch(v); setPage(1) }}
              size="small"
              style={{ width: 180 }}
              options={activeBranches.map(b => ({
                value: b.id,
                label: <span>{b.name} <span style={{ fontSize: 11, color: '#bfc4cd' }}>({b.branch})</span></span>,
              }))}
            />
            {branch && branch.lastSyncAt && (
              <span style={{ fontSize: 11, color: '#bfc4cd' }}>
                最近同步: {new Date(branch.lastSyncAt).toLocaleString('zh-CN')} · {branch.lastCommitSha?.substring(0, 7) || '-'}
              </span>
            )}
            <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => setBranchManageOpen(true)} style={{ color: '#8c919e' }}>
              管理
            </Button>
          </div>
          <Button size="small" icon={<SyncOutlined />}>更新脚本</Button>
        </div>
      </Card>

      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
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

      {/* 导入用例弹窗 */}
      <Modal
        title="导入用例（tea-cases.json）"
        open={importOpen}
        onCancel={() => { setImportOpen(false); setImportPreview(null) }}
        footer={importPreview ? [
          <Button key="cancel" onClick={() => { setImportOpen(false); setImportPreview(null) }}>取消</Button>,
          <Button key="confirm" type="primary" onClick={handleImportConfirm}>
            确认导入（{importPreview.total} 条）
          </Button>,
        ] : null}
        width={680}
      >
        {!importPreview ? (
          <Upload.Dragger
            accept=".json"
            showUploadList={false}
            beforeUpload={handleImportFile}
            style={{ padding: '32px 0' }}
          >
            <p><InboxOutlined style={{ fontSize: 40, color: '#6b7ef5' }} /></p>
            <p style={{ fontSize: 14, color: '#2e3138', marginTop: 8 }}>点击或拖拽上传 tea-cases.json</p>
            <p style={{ fontSize: 12, color: '#8c919e' }}>支持 TEA 框架生成的标准用例清单文件</p>
          </Upload.Dragger>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {[
                { label: '新增', count: importPreview.newCount, color: '#6ecf96', bg: '#eefbf3' },
                { label: '更新', count: importPreview.updateCount, color: '#6b7ef5', bg: '#eef0fe' },
                { label: '移除', count: importPreview.removedCount, color: '#f08a8e', bg: '#fef0f1' },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, textAlign: 'center', padding: '10px 0',
                  background: s.bg, borderRadius: 8,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 12, color: '#8c919e' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <Table
              dataSource={importPreview.cases}
              rowKey="tea_id"
              size="small"
              pagination={false}
              scroll={{ y: 280 }}
              columns={[
                { title: 'TEA ID', dataIndex: 'tea_id', width: 170, render: v => <span style={{ fontSize: 12, color: '#8c919e', fontFamily: 'monospace' }}>{v}</span> },
                { title: '标题', dataIndex: 'title', ellipsis: true },
                { title: '模块', dataIndex: 'module', width: 85 },
                { title: '优先级', dataIndex: 'priority', width: 60, align: 'center', render: v => <Tag style={{ background: priorityBg[v], color: priorityColors[v], border: 'none' }}>{v}</Tag> },
                { title: '操作', dataIndex: 'status', width: 70, align: 'center', render: v => {
                  const cfg = { '新增': { color: '#6ecf96', bg: '#eefbf3' }, '更新': { color: '#6b7ef5', bg: '#eef0fe' }, '移除': { color: '#f08a8e', bg: '#fef0f1' } }
                  const c = cfg[v]
                  return <Tag style={{ color: c.color, background: c.bg, border: 'none' }}>{v}</Tag>
                }},
              ]}
            />
          </>
        )}
      </Modal>

      {/* 分支管理弹窗 */}
      <BranchManageModal
        projectId={projectId}
        open={branchManageOpen}
        onClose={() => setBranchManageOpen(false)}
        onBranchesChanged={fetchBranches}
      />
    </div>
  )
}
