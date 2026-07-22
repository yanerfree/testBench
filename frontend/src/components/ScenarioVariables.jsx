import { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Tag, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { api } from '../utils/request'

const KIND_META = {
  literal: { label: '固定值', color: 'default', hint: '直接用该值' },
  random: { label: '随机唯一', color: 'purple', hint: '执行时补 _${runId}_${rand} 保唯一' },
  global_ref: { label: '引用全局', color: 'geekblue', hint: '引用项目全局数据(值为全局键名)' },
}

/**
 * 场景变量编辑区 —— 挂在用例上，UI 与接口测试共用同一份。
 * random 类型执行时自动加随机后缀保唯一；global_ref 引用项目全局数据。
 * 场景内"上一步提取→下一步用"的中间值不在这里维护（走脚本内 extract）。
 */
export default function ScenarioVariables({ projectId, branchId, caseId }) {
  const base = `/projects/${projectId}/branches/${branchId}/cases/${caseId}/scenario-variables`
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form] = Form.useForm()

  const load = async () => {
    if (!projectId || !branchId || !caseId) return
    setLoading(true)
    try {
      const res = await api.get(base)
      setRows(res.data || [])
    } catch (e) {
      message.error(e?.message || '加载场景变量失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [projectId, branchId, caseId])

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ kind: 'literal', varType: 'string' }); setModalOpen(true) }
  const openEdit = (r) => { setEditing(r); form.setFieldsValue(r); setModalOpen(true) }

  const submit = async () => {
    const v = await form.validateFields()
    try {
      if (editing) await api.put(`${base}/${editing.id}`, v)
      else await api.post(base, v)
      message.success(editing ? '已更新' : '已新增')
      setModalOpen(false); load()
    } catch (e) {
      message.error(e?.message || '保存失败')
    }
  }
  const del = async (r) => {
    try { await api.delete(`${base}/${r.id}`); message.success('已删除'); load() }
    catch (e) { message.error(e?.message || '删除失败') }
  }

  const columns = [
    { title: '变量名', dataIndex: 'name', width: 160, render: (t) => <code>{`\${${t}}`}</code> },
    { title: '类型', dataIndex: 'kind', width: 110, render: (k) => {
      const m = KIND_META[k] || KIND_META.literal
      return <Tooltip title={m.hint}><Tag color={m.color}>{m.label}</Tag></Tooltip>
    } },
    { title: '值 / 模板', dataIndex: 'valueTemplate', ellipsis: true, render: (t) => t || <span style={{ color: '#c9cdd4' }}>—</span> },
    { title: '说明', dataIndex: 'description', ellipsis: true, render: (t) => t || <span style={{ color: '#c9cdd4' }}>—</span> },
    { title: '操作', width: 100, render: (_, r) => (
      <>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        <Popconfirm title="删除该场景变量？" onConfirm={() => del(r)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </>
    ) },
  ]

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: '#86909c' }}>
          场景变量 · UI 与接口测试共用 · <code>{'${变量名}'}</code> 引用；random 执行时自动唯一化
        </div>
        <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={openAdd}>新增变量</Button>
      </div>
      <Table
        rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false}
        locale={{ emptyText: '暂无场景变量，点「新增变量」把该场景用到的数据抽成变量' }}
      />
      <Modal title={editing ? '编辑场景变量' : '新增场景变量'} open={modalOpen} onOk={submit} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="变量名" rules={[{ required: true, message: '请输入变量名' }, { pattern: /^[A-Za-z_][A-Za-z0-9_]*$/, message: '字母/数字/下划线，且不以数字开头' }]}>
            <Input placeholder="如 serviceName" />
          </Form.Item>
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Select options={Object.entries(KIND_META).map(([v, m]) => ({ value: v, label: `${m.label} — ${m.hint}` }))} />
          </Form.Item>
          <Form.Item name="valueTemplate" label="值 / 模板"
            tooltip="固定值:最终值；随机唯一:前缀(执行时补随机后缀)；引用全局:全局数据键名">
            <Input placeholder="如 svc （random 会生成 svc_xxx）" />
          </Form.Item>
          <Form.Item name="varType" label="数据类型" initialValue="string">
            <Select options={[{ value: 'string' }, { value: 'number' }, { value: 'json' }]} />
          </Form.Item>
          <Form.Item name="description" label="说明（调试可读）">
            <Input.TextArea rows={2} placeholder="这个变量是什么、给哪些步骤用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
