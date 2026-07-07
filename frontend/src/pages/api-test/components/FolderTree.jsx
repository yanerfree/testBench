import { Button, Tree, Tooltip, Popconfirm, Spin, message } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'

export default function FolderTree({
  folderTree, scenarios, loading,
  selectedFolderId, selectedScenarioId,
  onSelectFolder, onSelectScenario, onDeleteScenario, onDeleteFolder,
  onCreateFolder, onMoveScenario,
}) {
  const buildTreeData = (nodes) => nodes.map(n => ({
    key: n.id,
    title: `${n.name} (${n.scenarioCount || 0})`,
    isFolder: true,
    folderId: n.id,
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
      title: `未分类 (${unassigned.length})`,
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
                else if (node.isFolder && node.folderId) onSelectFolder(node.folderId)
              }}
              allowDrop={({ dropNode }) => {
                return dropNode.isFolder || (dropNode.isLeaf && dropNode.scenario)
              }}
              titleRender={(node) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {node.title}
                  </span>
                  {(node.isLeaf && node.scenario) ? (
                    <Popconfirm title="确定删除此场景？" onConfirm={e => { e?.stopPropagation(); onDeleteScenario(node.scenario.id) }} onCancel={e => e?.stopPropagation()}>
                      <Button type="text" size="small" icon={<DeleteOutlined />} onClick={e => e.stopPropagation()}
                        style={{ color: '#c9cdd4', opacity: 0, fontSize: 11, transition: 'opacity 0.2s' }} className="tree-delete-btn" />
                    </Popconfirm>
                  ) : (node.isFolder && node.folderId) ? (
                    <Popconfirm title="确定删除此文件夹？" description="仅允许删除空文件夹" onConfirm={e => { e?.stopPropagation(); onDeleteFolder(node.folderId) }} onCancel={e => e?.stopPropagation()}>
                      <Button type="text" size="small" icon={<DeleteOutlined />} onClick={e => e.stopPropagation()}
                        style={{ color: '#c9cdd4', opacity: 0, fontSize: 11, transition: 'opacity 0.2s' }} className="tree-delete-btn" />
                    </Popconfirm>
                  ) : null}
                </div>
              )}
            />
          )
        }
      </div>
      <style>{`.ant-tree-treenode:hover .tree-delete-btn { opacity: 0.6 !important; } .ant-tree-treenode:hover .tree-delete-btn:hover { opacity: 1 !important; }`}</style>
    </div>
  )
}
