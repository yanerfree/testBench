import { useState, useEffect, useCallback } from 'react'
import { Table, Button, Tag, Modal, Form, Input, Select, Switch, message, Popconfirm, Space, Avatar, Spin } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../../utils/request'

const ROLE_CONFIG = {
  admin: { label: '系统管理员', color: '#ff4d4f', bg: '#fff2f0' },
  user: { label: '普通用户', color: '#00b96b', bg: '#e6f7ff' },
}

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form] = Form.useForm()

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/users')
      setUsers(res.data)
    } catch { /* request.js 已展示错误 */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const openCreate = () => {
    setEditingUser(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (user) => {
    setEditingUser(user)
    form.setFieldsValue({ username: user.username, role: user.role, isActive: user.isActive })
    setModalOpen(true)
  }

  const handleSave = async () => {
    let values
    try { values = await form.validateFields() } catch { return }

    setSaving(true)
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, {
          role: values.role,
          isActive: values.isActive,
        })
        message.success('用户已更新')
      } else {
        await api.post('/users', {
          username: values.username,
          password: values.password,
          role: values.role,
        })
        message.success('用户创建成功')
      }
      setModalOpen(false)
      form.resetFields()
      fetchUsers()
    } catch { /* request.js 已展示错误 */ } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (user) => {
    try {
      await api.del(`/users/${user.id}`)
      message.success('用户已删除')
      fetchUsers()
    } catch { /* request.js 已展示错误 */ }
  }

  const toggleActive = async (user) => {
    try {
      await api.put(`/users/${user.id}`, { isActive: !user.isActive })
      message.success(user.isActive ? '已停用' : '已启用')
      fetchUsers()
    } catch { /* request.js 已展示错误 */ }
  }

  const columns = [
    {
      title: '用户', dataIndex: 'username', width: 200,
      render: (v) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={28} style={{ background: '#722ed1', fontSize: 12 }}>{v[0].toUpperCase()}</Avatar>
          <span style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ),
    },
    {
      title: '角色', dataIndex: 'role', width: 130, align: 'center',
      render: (v) => {
        const cfg = ROLE_CONFIG[v]
        return <Tag style={{ color: cfg.color, background: cfg.bg, border: 'none' }}>{cfg.label}</Tag>
      },
    },
    {
      title: '状态', dataIndex: 'isActive', width: 100, align: 'center',
      render: (v, record) => (
        <Switch
          size="small"
          checked={v}
          onChange={() => toggleActive(record)}
          checkedChildren="启用"
          unCheckedChildren="停用"
        />
      ),
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 180, align: 'center',
      render: v => <span style={{ fontSize: 13, color: '#86909c' }}>{v ? new Date(v).toLocaleString('zh-CN') : '-'}</span>,
    },
    {
      title: '操作', width: 120, align: 'center',
      render: (_, record) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} style={{ color: '#00b96b' }} />
          {record.username !== 'admin' && (
            <Popconfirm
              title={`确定删除用户 ${record.username}？`}
              description={record.isActive ? '该用户当前处于启用状态' : undefined}
              onConfirm={() => handleDelete(record)}
            >
              <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#ff4d4f' }} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1d2129' }}>用户管理</h2>
          <span style={{ fontSize: 13, color: '#86909c' }}>管理系统用户账号与角色</span>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建用户</Button>
        </Space>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f2f3f5', padding: 2 }}>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 10, size: 'small', showTotal: t => `共 ${t} 位用户` }}
        />
      </div>

      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        okText={editingUser ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username" label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 2, message: '用户名至少 2 个字符' },
              { max: 50, message: '用户名最多 50 个字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '只允许字母、数字和下划线' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#c9cdd4' }} />}
              placeholder="字母、数字、下划线，2-50 位"
              disabled={!!editingUser}
            />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password" label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 个字符' },
                { max: 128, message: '密码最多 128 个字符' },
              ]}
            >
              <Input.Password placeholder="至少 6 位" />
            </Form.Item>
          )}
          <Form.Item
            name="role" label="系统角色"
            rules={[{ required: true, message: '请选择角色' }]}
            initialValue="user"
          >
            <Select options={[
              { value: 'admin', label: '系统管理员 — 可访问所有项目和系统配置' },
              { value: 'user', label: '普通用户 — 需通过项目成员绑定获得访问权限' },
            ]} />
          </Form.Item>
          {editingUser && (
            <Form.Item name="isActive" label="账号状态" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
