import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Modal, Form, Input, TreeSelect, message, Select } from 'antd'
import { api } from '../../utils/request'
import FolderTree from './components/FolderTree'
import ScenarioList from './components/ScenarioList'
import StepList from './components/StepList'
import StepEditor from './components/StepEditor'
import GenerateModal from './components/GenerateModal'

export default function ApiTest() {
  const { projectId } = useParams()
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
  const [runResponse, setRunResponse] = useState(null)
  const [createScenarioOpen, setCreateScenarioOpen] = useState(false)
  const [createForm] = Form.useForm()

  useEffect(() => {
    if (!projectId) return
    api.get(`/projects/${projectId}/branches`).then(res => {
      const b = (res.data || [])[0]
      if (b) setBranchId(b.id)
    }).catch(() => {})
  }, [projectId])

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

  const buildParentSelect = (nodes) => nodes.map(n => ({
    value: n.id, title: n.name,
    children: n.children?.length > 0 ? buildParentSelect(n.children) : undefined,
  }))

  const stepWithResponse = selectedStep ? { ...selectedStep, _runResponse: runResponse } : null

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      <FolderTree
        folderTree={folderTree}
        scenarios={scenarios}
        loading={loading}
        selectedFolderId={selectedFolderId}
        selectedScenarioId={selectedScenario?.id}
        onSelectFolder={(folderId) => { setSelectedFolderId(folderId); setSelectedScenario(null); setSelectedStep(null) }}
        onSelectScenario={(id) => { setSelectedFolderId(null); loadScenario(id) }}
        onDeleteScenario={handleDelete}
        onDeleteFolder={handleDeleteFolder}
        onCreateFolder={() => { setNewFolderName(''); setFolderModalOpen(true) }}
      />

      {!selectedScenario ? (
        <ScenarioList
          scenarios={scenarios}
          selectedFolderId={selectedFolderId}
          loading={loading}
          searchKeyword={searchKeyword}
          onSearchChange={setSearchKeyword}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          onSelectScenario={(id) => loadScenario(id)}
          onDelete={handleDelete}
          onGenerate={() => { setGenOpen(true); form.resetFields() }}
          onCreate={() => {/* TODO */}}
        />
      ) : (
        <>
          <StepList
            scenario={selectedScenario}
            selectedStepId={selectedStep?.id}
            onSelectStep={(step) => { setSelectedStep(step); setRunResponse(null) }}
            onAddStep={addStep}
            onClose={() => { setSelectedScenario(null); setSelectedStep(null) }}
            onSaveScenario={saveScenario}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>
            <StepEditor
              step={stepWithResponse}
              running={running}
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
    </div>
  )
}
