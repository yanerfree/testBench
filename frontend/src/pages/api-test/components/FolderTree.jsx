import { useState } from 'react'
import { Button, Tree, Tooltip, Popconfirm, Spin, Dropdown, Modal, TreeSelect } from 'antd'
import { PlusOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons'

export default function FolderTree({
  folderTree, scenarios, loading,
  selectedFolderId, selectedScenarioId,
  onSelectFolder, onSelectScenario, onDeleteScenario, onDeleteFolder,
  onCreateFolder, onMoveScenario,
}) {
  const [moveModal, setMoveModal] = useState({ open: false, scenarioId: null, scenarioTitle: '' })
  const [moveTarget, setMoveTarget] = useState(null)

  const buildTreeData = (nodes) => nodes.map(n => ({
    key: n.id,
    title: n.name,
    scenarioCount: n.scenarioCount || 0,
    isFolder: true,
    folderId: n.id,
    descendantFolderIds: n.descendantFolderIds || [n.id],
    children: [
      ...(n.children?.length > 0 ? buildTreeData(n.children) : []),
      ...scenarios.filter(s => s.folderId === n.id).map(s => ({
        key: s.id, title: s.title, isLeaf: true, scenario: s,
      })),
    ],
  }))

  const unassigned = scenarios.filter(s => !s.folderId)
  const treeData = [
    ...buildTreeData(folderTree),
    ...(unassigned.length > 0 ? [{
      key: '__unassigned__',
      title: '未分类',
      scenarioCount: unassigned.length,
      isFolder: true,
      folderId: null,
      selectable: false,
      children: unassigned.map(s => ({ key: s.id, title: s.title, isLeaf: true, scenario: s })),
    }] : []),
  ]

  const handleDrop = (info) => {
    const dragNode = info.dragNode
    const dropNode = info.node
    if (!dragNode.isLeaf || !dragNode.scenario) return
    let targetFolderId = null
    if (dropNode.isFolder) {
      targetFolderId = dropNode.folderId
    } else if (dropNode.isLeaf && dropNode.scenario) {
      targetFolderId = dropNode.scenario.folderId || null
    }
    if (dragNode.scenario.folderId === targetFolderId) return
    onMoveScenario(dragNode.scenario.id, targetFolderId)
  }

  const buildFolderSelect = (nodes) => nodes.map(n => ({
    value: n.id, title: n.name,
    children: n.children?.length > 0 ? buildFolderSelect(n.children) : undefined,
  }))

  const scenarioMenuItems = (scenario) => [
    { key: 'move', label: '移动到文件夹' },
    { type: 'divider' },
    { key: 'delete', label: '删除', danger: true },
  ]

  const folderMenuItems = (folderId) => [
    { key: 'delete', label: '删除文件夹', danger: true },
  ]

  return (
    <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>测试场景</span>
        <Tooltip title="新建文件夹">
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={onCreateFolder} style={{ color: '#0ea5a0' }} />
        </Tooltip>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? <Spin style={{ display: 'block', margin: '40px auto' }} /> :
          treeData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#86909c', fontSize: 12 }}>暂无场景</div>
          ) : (
            <Tree
              treeData={treeData}
              defaultExpandAll
              blockNode
              draggable={{ icon: false }}
              onDrop={handleDrop}
              style={{ fontSize: 12 }}
              selectedKeys={selectedScenarioId ? [selectedScenarioId] : selectedFolderId ? [selectedFolderId] : []}
              onSelect={(keys, { node }) => {
                if (node.isLeaf && node.scenario) onSelectScenario(node.scenario.id)
                else if (node.isFolder && node.folderId) onSelectFolder(node.folderId, node.descendantFolderIds)
              }}
              allowDrop={({ dropNode }) => dropNode.isFolder || (dropNode.isLeaf && dropNode.scenario)}
              titleRender={(node) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {node.isFolder ? `${node.title} (${node.scenarioCount || node.children?.filter(c => c.isLeaf)?.length || 0})` : node.title}
                  </span>
                  {(node.isLeaf && node.scenario) ? (
                    <Dropdown menu={{ items: scenarioMenuItems(node.scenario), onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'move') setMoveModal({ open: true, scenarioId: node.scenario.id, scenarioTitle: node.title })
                      if (key === 'delete') onDeleteScenario(node.scenario.id)
                    }}} trigger={['click']}>
                      <Button type="text" size="small" icon={<MoreOutlined />} onClick={e => e.stopPropagation()}
                        style={{ color: '#c9cdd4', opacity: 0, fontSize: 11, transition: 'opacity 0.2s' }} className="tree-action-btn" />
                    </Dropdown>
                  ) : (node.isFolder && node.folderId) ? (
                    <Dropdown menu={{ items: folderMenuItems(node.folderId), onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation()
                      if (key === 'delete') onDeleteFolder(node.folderId)
                    }}} trigger={['click']}>
                      <Button type="text" size="small" icon={<MoreOutlined />} onClick={e => e.stopPropagation()}
                        style={{ color: '#c9cdd4', opacity: 0, fontSize: 11, transition: 'opacity 0.2s' }} className="tree-action-btn" />
                    </Dropdown>
                  ) : null}
                </div>
              )}
            />
          )
        }
      </div>

      <Modal
        title="移动到文件夹"
        open={moveModal.open}
        onOk={() => {
          onMoveScenario(moveModal.scenarioId, moveTarget)
          setMoveModal({ open: false, scenarioId: null, scenarioTitle: '' })
          setMoveTarget(null)
        }}
        onCancel={() => { setMoveModal({ open: false, scenarioId: null, scenarioTitle: '' }); setMoveTarget(null) }}
        okText="移动" cancelText="取消" width={400}
      >
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          将 <b>{moveModal.scenarioTitle}</b> 移动到：
        </div>
        <TreeSelect
          value={moveTarget}
          onChange={setMoveTarget}
          treeData={buildFolderSelect(folderTree)}
          placeholder="选择目标文件夹"
          allowClear
          style={{ width: '100%' }}
        />
      </Modal>

      <style>{`
        .ant-tree-treenode:hover .tree-action-btn { opacity: 0.6 !important; }
        .ant-tree-treenode:hover .tree-action-btn:hover { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
