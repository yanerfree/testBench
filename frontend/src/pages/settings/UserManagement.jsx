import { useState } from 'react'
import { Table, Button, Tag, Modal, Form, Input, Select, Switch, message, Popconfirm, Space, Avatar } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons'
import { mockUsers } from '../../mock/data'

const ROLE_CONFIG = {
  admin: { label: '系统管理员', color: '#f08a8e', bg: '#fef0f1' },
  user: { label: '普通用户', color: '#6b7ef5', bg: '#eef0fe' },
}

export default function UserManagement() {
  const [users, setUsers] = useState(mockUsers.map(u => ({ ...u })))
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form] = Form.useForm()

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

  const handleSave = () => {
    form.validateFields().then(values => {
      if (editingUser) {
        setUsers(prev => prev.map(u => u.id === editingUser.id
          ? { ...u, role: values.role, isActive: values.isActive }
          : u
        ))
        message.success('用户已更新')
      } else {
        if (users.some(u => u.username === values.username)) {
          message.error('用户名已存在')
          return
        }
        const newUser = {
          id: `user-${Date.now()}`,
          username: values.username,
          password: values.password,
          role: values.role,
          isActive: true,
          createdAt: new Date().toISOString().split('T')[0],
        }
        setUsers(prev => [...prev, newUser])
        message.success('用户创建成功')
      }
      setModalOpen(false)
      form.resetFields()
    })
  }

  const handleDelete = (user) => {
    setUsers(prev => prev.filter(u => u.id !== user.id))
    message.success('用户已删除')
  }

  const toggleActive = (user) => {
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u))
    message.success(user.isActive ? '已停用' : '已启用')
  }

  const columns = [
    {
      title: '用户', dataIndex: 'username', width: 200,
      render: (v) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={28} style={{ background: '#a78bfa', fontSize: 12 }}>{v[0].toUpperCase()}</Avatar>
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
      title: '创建时间', dataIndex: 'createdAt', width: 130, align: 'center',
      render: v => <span style={{ fontSize: 13, color: '#8c919e' }}>{v}</span>,
    },
    {
      title: '操作', width: 120, align: 'center',
      render: (_, record) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} style={{ color: '#6b7ef5' }} />
          {record.username !== 'admin' && (
            <Popconfirm
              title={`确定删除用户 ${record.username}？`}
              description={record.isActive ? '该用户当前处于启用状态' : undefined}
              onConfirm={() => handleDelete(record)}
            >
              <Button type="text" size="small" icon={<DeleteOutlined />} style={{ color: '#f08a8e' }} />
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
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#2e3138' }}>用户管理</h2>
          <span style={{ fontSize: 13, color: '#8c919e' }}>管理系统用户账号与角色</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建用户</Button>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3', padding: 2 }}>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          size="small"
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
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username" label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfc4cd' }} />}
              placeholder="用户名"
              disabled={!!editingUser}
            />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password" label="密码"
              rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少 6 位' }]}
            >
              <Input.Password placeholder="密码" />
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
