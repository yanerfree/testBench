import { Button, Modal, Form, Input, TreeSelect, Select, Tabs } from 'antd'
import { RobotOutlined, LoadingOutlined } from '@ant-design/icons'

const { TextArea } = Input

export default function GenerateModal({
  open, onClose,
  form, generating, genProgress,
  onGenerate,
  folderTree,
  environments, apiList,
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
      width={640}
      footer={!generating ? [
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={onGenerate}>开始生成</Button>,
      ] : null}
    >
      {!generating ? (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}
          initialValues={{ inputMode: 'manual' }}>
          <Form.Item name="inputMode" label="接口来源">
            <Tabs size="small" items={[
              { key: 'manual', label: '手动输入' },
              { key: 'apiList', label: '从 API 列表选择' },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.inputMode !== cur.inputMode}>
            {({ getFieldValue }) => getFieldValue('inputMode') === 'apiList' && apiList?.length > 0 ? (
              <Form.Item name="apiIds" label="选择接口">
                <Select mode="multiple" placeholder="选择要生成测试的接口" allowClear
                  options={apiList.map(a => ({
                    value: a.id,
                    label: `${a.method || ''} ${a.name || a.url || a.id}`.trim(),
                  }))}
                  maxTagCount={5} showSearch optionFilterProp="label" />
              </Form.Item>
            ) : (
              <Form.Item name="apiInfo" label="接口定义" rules={[{ required: true, message: '请输入' }]}>
                <TextArea rows={8} placeholder={"粘贴接口定义，例如：\n\n### POST /api/users — 创建用户\n参数:\n- username (string, required, 3-100位)\n- password (string, required, ≥6位)\n- role (string, required, enum: admin/user)\n需要认证：Bearer Token"} />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="targetFolder" label="目标文件夹（可选）">
            <TreeSelect
              treeData={buildParentSelect(folderTree)}
              placeholder="不选则 AI 自动创建"
              allowClear
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="envId" label="运行环境（可选）">
            <Select placeholder="选择环境（变量将注入测试步骤）" allowClear
              options={(environments || []).map(e => ({ value: e.id, label: e.name }))} />
          </Form.Item>
          <Form.Item name="envVars" label="额外环境变量 (JSON，可选)">
            <TextArea rows={2} placeholder={'{"CUSTOM_VAR": "value"}'} />
          </Form.Item>
        </Form>
      ) : (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <LoadingOutlined style={{ fontSize: 24 }} />
            <div style={{ marginTop: 8, fontWeight: 500 }}>正在生成...</div>
          </div>
          <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, maxHeight: 200, overflow: 'auto' }}>
            {genProgress.map((p, i) => <div key={i} style={{ fontSize: 12, color: '#595959', padding: '2px 0' }}>{p}</div>)}
          </div>
        </div>
      )}
    </Modal>
  )
}
