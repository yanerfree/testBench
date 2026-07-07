import { Button, Modal, Form, Input, TreeSelect } from 'antd'
import { RobotOutlined, LoadingOutlined } from '@ant-design/icons'

const { TextArea } = Input

export default function GenerateModal({
  open, onClose,
  form, generating, genProgress,
  onGenerate,
  folderTree,
}) {
  const buildParentSelect = (nodes) => nodes.map(n => ({
    value: n.id, title: n.name,
    children: n.children?.length > 0 ? buildParentSelect(n.children) : undefined,
  }))

  return (
    <Modal
      title="生成接口测试"
      open={open}
      onCancel={() => { if (!generating) onClose() }}
      width={600}
      footer={!generating ? [
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={onGenerate}>开始生成</Button>,
      ] : null}
    >
      {!generating ? (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="apiInfo" label="接口定义" rules={[{ required: true, message: '请输入' }]}>
            <TextArea rows={8} placeholder={"粘贴接口定义，例如：\n\n### POST /api/users — 创建用户\n参数:\n- username (string, required, 3-100位)\n- password (string, required, ≥6位)\n- role (string, required, enum: admin/user)\n需要认证：Bearer Token"} />
          </Form.Item>
          <Form.Item name="targetFolder" label="目标文件夹（可选）">
            <TreeSelect
              treeData={buildParentSelect(folderTree)}
              placeholder="不选则 AI 自动创建"
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="envVars" label="环境变量 (JSON)">
            <TextArea rows={3} placeholder={'{"BASE_URL": "http://localhost:8000", "ADMIN_USER": "admin"}'} />
          </Form.Item>
        </Form>
      ) : (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <LoadingOutlined style={{ fontSize: 24 }} />
            <div style={{ marginTop: 8, fontWeight: 500 }}>正在生成...</div>
          </div>
          <div style={{ padding: '8px 12px', background: '#f6f7f9', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
            {genProgress.map((p, i) => <div key={i} style={{ fontSize: 12, color: '#595959', padding: '2px 0' }}>{p}</div>)}
          </div>
        </div>
      )}
    </Modal>
  )
}
