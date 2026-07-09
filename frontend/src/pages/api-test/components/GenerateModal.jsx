import { useState } from 'react'
import { Button, Modal, Form, Input, TreeSelect, Select } from 'antd'
import { RobotOutlined, LoadingOutlined } from '@ant-design/icons'

const { TextArea } = Input

export default function GenerateModal({
  open, onClose,
  form, generating, genProgress,
  onGenerate,
  folderTree,
  environments, apiList,
}) {
  const [inputMode, setInputMode] = useState('manual')

  const buildParentSelect = (nodes) => nodes.map(n => ({
    value: n.id, title: n.name,
    children: n.children?.length > 0 ? buildParentSelect(n.children) : undefined,
  }))

  return (
    <Modal
      title="生成接口测试"
      open={open}
      onCancel={() => { if (!generating) { onClose(); setInputMode('manual') } }}
      width={640}
      footer={!generating ? [
        <Button key="cancel" onClick={() => { onClose(); setInputMode('manual') }}>取消</Button>,
        <Button key="gen" type="primary" icon={<RobotOutlined />} onClick={onGenerate}>开始生成</Button>,
      ] : null}
    >
      {!generating ? (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="接口来源">
            <div style={{ display: 'flex', gap: 0, marginBottom: 4 }}>
              {[
                { key: 'manual', label: '手动输入' },
                { key: 'apiList', label: `从 API 列表选择 (${apiList?.length || 0})` },
              ].map(t => (
                <Button key={t.key} size="small"
                  type={inputMode === t.key ? 'primary' : 'default'}
                  onClick={() => setInputMode(t.key)}
                  style={{ borderRadius: 0, ...(t.key === 'manual' ? { borderRadius: '6px 0 0 6px' } : { borderRadius: '0 6px 6px 0' }) }}>
                  {t.label}
                </Button>
              ))}
            </div>
          </Form.Item>

          {inputMode === 'apiList' && apiList?.length > 0 ? (
            <Form.Item name="apiIds" label="选择接口" rules={[{ required: true, message: '请选择至少一个接口' }]}>
              <Select mode="multiple" placeholder="选择要生成测试的接口" allowClear
                options={apiList.map(a => ({
                  value: a.id,
                  label: `${a.method || 'GET'} ${a.url || ''} — ${a.name || ''}`.trim(),
                }))}
                maxTagCount={5} showSearch optionFilterProp="label"
                style={{ width: '100%' }} />
            </Form.Item>
          ) : (
            <Form.Item name="apiInfo" label="接口定义" rules={inputMode === 'manual' ? [{ required: true, message: '请输入接口定义' }] : []}>
              <TextArea rows={8} placeholder={"粘贴接口定义，例如：\n\n### POST /api/users — 创建用户\n参数:\n- username (string, required, 3-100位)\n- password (string, required, ≥6位)\n- role (string, required, enum: admin/user)\n需要认证：Bearer Token"} />
            </Form.Item>
          )}

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
