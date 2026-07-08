import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Modal, Form, Input, TreeSelect, message, Select } from 'antd'
import { api } from '../../utils/request'
import { useBranch } from '../../utils/branch'
import FolderTree from './components/FolderTree'
import ScenarioList from './components/ScenarioList'
import StepList from './components/StepList'
import StepEditor from './components/StepEditor'
import GenerateModal from './components/GenerateModal'

export default function ApiTest() {
  const { projectId } = useParams()
  const [globalBranchId] = useBranch(projectId)
  const [branchId, setBranchId] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState(null)
  const [selectedStep, setSelectedStep] = useState(null)
  const [genOpen, setGenOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState([])
  const [form] = Form.useForm()
  const [running, setRunning] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderParent, setNewFolderParent] = useState(null)
  const [folderTree, setFolderTree] = useState([])
  const [selectedFolderId, setSelectedFolderId] = useState(null)
  const [selectedFolderIds, setSelectedFolderIds] = useState([])
  const [runResponse, setRunResponse] = useState(null)
  const [createScenarioOpen, setCreateScenarioOpen] = useState(false)
  const [createForm] = Form.useForm()

  useEffect(() => {
    if (!projectId) return
    // 优先使用全局分支；没有则取第一个分支
    if (globalBranchId) {
      setBranchId(globalBranchId)
      // 切换分支时清空选中状态
      setSelectedScenario(null)
      setSelectedStep(null)
      setSelectedFolderId(null)
      setSelectedFolderIds([])
      return
    }
    api.get(`/projects/${projectId}/branches`).then(res => {
      const b = (res.data || [])[0]
      if (b) setBranchId(b.id)
    }).catch(() => {})
  }, [projectId, globalBranchId])

  const fetchFolders = useCallback(async () => {
    if (!branchId) return
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests/folders`)
      const tree = res.data || []
      setFolderTree(tree)
      if (!selectedFolderId && !selectedScenario && tree.length > 0) {
        setSelectedFolderId(tree[0].id)
      }
    } catch { /* */ }
  }, [projectId, branchId])

  useEffect(() => { fetchFolders() }, [fetchFolders])

  const fetchScenarios = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests`)
      setScenarios(res.data || [])
    } catch { /* */ } finally { setLoading(false) }
  }, [projectId, branchId])

  useEffect(() => { fetchScenarios() }, [fetchScenarios])

  const loadScenario = async (id) => {
    try {
      const res = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`)
      setSelectedScenario(res.data)
      setRunResponse(null)
      const steps = res.data?.steps || []
      const firstStep = steps.length > 0 ? steps[0] : null
      setSelectedStep(firstStep)
    } catch { /* */ }
  }

  const handleDelete = async (id) => {
    await api.del(`/projects/${projectId}/branches/${branchId}/api-tests/${id}`).catch(() => {})
    message.success('已删除')
    if (selectedScenario?.id === id) { setSelectedScenario(null); setSelectedStep(null) }
    fetchScenarios()
  }

  const handleGenerate = async () => {
    try {
      const v = await form.validateFields()
      setGenerating(true); setGenProgress([])
      api.stream(`/projects/${projectId}/branches/${branchId}/api-tests/generate`, {
        apiInfo: v.apiInfo,
        folderId: v.targetFolder || undefined,
        envVariables: v.envVars ? JSON.parse(v.envVars) : undefined,
      }, {
        onChunk: (data) => {
          if (data.type === 'step_start') setGenProgress(prev => [...prev, `⏳ ${data.title}`])
          if (data.type === 'step_done') setGenProgress(prev => [...prev, `✅ ${data.summary}`])
          if (data.type === 'scenario_created') setGenProgress(prev => [...prev, `📋 ${data.code} ${data.title} (${data.stepCount}步)`])
          if (data.type === 'error') { message.error(data.message); setGenerating(false) }
        },
        onDone: () => {
          message.success('测试场景已生成')
          setGenerating(false); setGenOpen(false); form.resetFields()
          fetchScenarios(); fetchFolders()
        },
        onError: (msg) => { message.error(msg); setGenerating(false) },
      })
    } catch { /* */ }
  }

  const handleRunStep = async () => {
    if (!selectedStep) return
    setRunning(true); setRunResponse(null)
    try {
      const res = await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/run-step/${selectedStep.id}`)
      setRunResponse(res.data)
      loadScenario(selectedScenario.id)
    } catch (e) {
      setRunResponse({ error: e.message || '执行失败' })
    } finally { setRunning(false) }
  }

  const handleRunAll = async () => {
    if (!selectedScenario) return
    setRunning(true)
    api.stream(`/projects/${projectId}/branches/${branchId}/api-tests/run`, {
      scenarioIds: [selectedScenario.id],
    }, {
      onChunk: (data) => {
        if (data.type === 'step_result') {
          const icon = data.status === 'pass' ? '✅' : data.status === 'skip' ? '⏭️' : '❌'
          message.info(`${icon} ${data.stepName}`, 2)
        }
        if (data.type === 'scenario_done') {
          message.success(`场景执行完成：通过 ${data.passCount}，失败 ${data.failCount}`)
        }
        if (data.type === 'report_created') {
          message.success('测试报告已生成')
        }
      },
      onDone: () => {
        setRunning(false)
        loadScenario(selectedScenario.id)
      },
      onError: (msg) => { message.error(msg); setRunning(false) },
    })
  }

  const handleAiOptimize = async (suggestion) => {
    const res = await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/ai-optimize`, { suggestion })
    return res.data
  }

  const handleApplyOptimize = async (changes) => {
    try {
      const res = await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/ai-optimize/apply`, { changes })
      loadScenario(selectedScenario.id)
      return res.data
    } catch { message.error('应用失败'); return null }
  }

  const handleCopyScenario = async () => {
    if (!selectedScenario) return
    try {
      const res = await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/copy`)
      message.success('场景已复制')
      fetchScenarios(); fetchFolders()
      loadScenario(res.data.id)
    } catch { message.error('复制失败') }
  }

  const handleNewVersion = async () => {
    if (!selectedScenario) return
    try {
      const res = await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/new-version`)
      message.success('已创建新版本（草稿），原版本已废弃')
      fetchScenarios(); fetchFolders()
      loadScenario(res.data.id)
    } catch (e) { message.error(e.message || '更新版本失败') }
  }

  const saveStep = async (stepId, updates) => {
    try {
      const res = await api.put(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/steps/${stepId}`, updates)
      message.success('已保存')
      if (selectedStep?.id === stepId) {
        setSelectedStep(prev => ({ ...prev, ...res.data }))
      }
      const scRes = await api.get(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}`)
      setSelectedScenario(scRes.data)
    } catch { message.error('保存失败') }
  }

  const saveScenario = async (updates) => {
    try {
      await api.put(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}`, updates)
      fetchScenarios()
      loadScenario(selectedScenario.id)
    } catch { message.error('保存失败') }
  }

  const addStep = async () => {
    try {
      await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/steps`, { name: '新步骤', method: 'GET', url: '${BASE_URL}/' })
      loadScenario(selectedScenario.id)
    } catch { message.error('添加失败') }
  }

  const removeStep = async (stepId) => {
    try {
      await api.del(`/projects/${projectId}/branches/${branchId}/api-tests/${selectedScenario.id}/steps/${stepId}`)
      if (selectedStep?.id === stepId) setSelectedStep(null)
      loadScenario(selectedScenario.id)
    } catch { message.error('删除失败') }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await api.post(`/projects/${projectId}/branches/${branchId}/api-tests/folders?name=${encodeURIComponent(newFolderName.trim())}${newFolderParent ? `&parent_id=${newFolderParent}` : ''}`)
      message.success('文件夹已创建')
      setFolderModalOpen(false)
      setNewFolderName('')
      setNewFolderParent(null)
      fetchFolders()
    } catch { /* */ }
  }

  const handleDeleteFolder = async (folderId) => {
    try {
      await api.del(`/projects/${projectId}/branches/${branchId}/api-tests/folders/${folderId}`)
      message.success('文件夹已删除')
      fetchFolders()
    } catch { /* */ }
  }

  const handleCreateScenario = async () => {
    try {
      const v = await createForm.validateFields()
      await api.post(`/projects/${projectId}/branches/${branchId}/api-tests`, {
        title: v.title,
        priority: v.priority || 'P1',
        folderId: v.folderId || undefined,
      })
      message.success('场景已创建')
      setCreateScenarioOpen(false)
      createForm.resetFields()
      fetchScenarios()
    } catch { /* */ }
  }

  const handleBatchOperation = async (action, ids) => {
    if (!ids?.length) { message.warning('请先选择场景'); return }
    try {
      await api.put(`/projects/${projectId}/branches/${branchId}/api-tests/batch`, {
        ids, action,
      })
      message.success('操作成功')
      fetchScenarios(); fetchFolders()
    } catch (e) { message.error(e.message || '操作失败') }
  }

  const handleMoveScenario = async (scenarioId, folderId) => {
    try {
      await api.put(`/projects/${projectId}/branches/${branchId}/api-tests/${scenarioId}`, {
        folderId: folderId || '',
      })
      message.success('已移动')
      fetchScenarios(); fetchFolders()
    } catch { message.error('移动失败') }
  }

  const buildParentSelect = (nodes) => nodes.map(n => ({
    value: n.id, title: n.name,
    children: n.children?.length > 0 ? buildParentSelect(n.children) : undefined,
  }))

  const stepWithResponse = selectedStep ? { ...selectedStep, _runResponse: runResponse || selectedStep.lastResponse } : null

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <FolderTree
        folderTree={folderTree}
        scenarios={scenarios}
        loading={loading}
        selectedFolderId={selectedFolderId}
        selectedScenarioId={selectedScenario?.id}
        onSelectFolder={(folderId, descendantIds) => { setSelectedFolderId(folderId); setSelectedFolderIds(descendantIds || [folderId]); setSelectedScenario(null); setSelectedStep(null) }}
        onSelectScenario={(id) => { setSelectedFolderId(null); loadScenario(id) }}
        onDeleteScenario={handleDelete}
        onDeleteFolder={handleDeleteFolder}
        onCreateFolder={() => { setNewFolderName(''); setFolderModalOpen(true) }}
        onMoveScenario={handleMoveScenario}
      />

      {!selectedScenario ? (
        <ScenarioList
          scenarios={scenarios}
          selectedFolderIds={selectedFolderIds}
          loading={loading}
          searchKeyword={searchKeyword}
          onSearchChange={setSearchKeyword}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          onSelectScenario={(id) => loadScenario(id)}
          onDelete={handleDelete}
          onGenerate={() => { setGenOpen(true); form.resetFields() }}
          onCreate={() => { setCreateScenarioOpen(true); createForm.resetFields() }}
          onBatch={handleBatchOperation}
        />
      ) : (
        <>
          <StepList
            scenario={selectedScenario}
            selectedStepId={selectedStep?.id}
            readonly={selectedScenario?.status !== 'draft'}
            onSelectStep={(step) => { setSelectedStep(step); setRunResponse(null) }}
            onAddStep={addStep}
            onClose={() => { setSelectedScenario(null); setSelectedStep(null) }}
            onSaveScenario={saveScenario}
            onRunAll={handleRunAll}
            onAiOptimize={handleAiOptimize}
            onApplyOptimize={handleApplyOptimize}
            onCopyScenario={handleCopyScenario}
            onNewVersion={handleNewVersion}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>
            <StepEditor
              step={stepWithResponse}
              running={running}
              readonly={selectedScenario?.status !== 'draft'}
              onSaveStep={saveStep}
              onRemoveStep={removeStep}
              onRunStep={handleRunStep}
              onStepChange={setSelectedStep}
            />
          </div>
        </>
      )}

      <GenerateModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        form={form}
        generating={generating}
        genProgress={genProgress}
        onGenerate={handleGenerate}
        folderTree={folderTree}
      />

      <Modal
        title="新建模块"
        open={folderModalOpen}
        onOk={handleCreateFolder}
        onCancel={() => setFolderModalOpen(false)}
        okText="创建"
        cancelText="取消"
        width={420}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="模块名称" required>
            <Input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="如：AUTH、USER_MGMT"
              onPressEnter={handleCreateFolder}
            />
          </Form.Item>
          <Form.Item label="父模块（可选）">
            <TreeSelect
              value={newFolderParent}
              onChange={setNewFolderParent}
              treeData={buildParentSelect(folderTree)}
              placeholder="顶级模块（不选则为一级模块）"
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建场景"
        open={createScenarioOpen}
        onOk={handleCreateScenario}
        onCancel={() => setCreateScenarioOpen(false)}
        okText="创建"
        cancelText="取消"
        width={480}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="场景标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：创建用户-正向测试" />
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="P1">
            <Select options={[
              { value: 'P0', label: 'P0 - 最高' },
              { value: 'P1', label: 'P1 - 高' },
              { value: 'P2', label: 'P2 - 中' },
              { value: 'P3', label: 'P3 - 低' },
            ]} />
          </Form.Item>
          <Form.Item name="folderId" label="目标文件夹（可选）">
            <TreeSelect
              treeData={buildParentSelect(folderTree)}
              placeholder="不选则不归入文件夹"
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
