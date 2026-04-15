import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { mockUsers } from '../../mock/data'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onFinish = (values) => {
    setLoading(true)
    // 模拟登录请求延迟
    setTimeout(() => {
      const user = mockUsers.find(
        u => u.username === values.username && u.password === values.password && u.isActive
      )
      if (user) {
        localStorage.setItem('token', `mock-jwt-${user.id}`)
        localStorage.setItem('user', JSON.stringify({ id: user.id, username: user.username, role: user.role }))
        message.success('登录成功')
        navigate('/', { replace: true })
      } else {
        message.error('用户名或密码错误')
      }
      setLoading(false)
    }, 600)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7ff 0%, #ede9fe 50%, #f0f4ff 100%)',
    }}>
      <div style={{
        width: 380,
        padding: '40px 36px 32px',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 4px 24px rgba(107, 126, 245, 0.08)',
      }}>
        {/* Logo + 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #a78bfa 0%, #7c8cf8 100%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 22, marginBottom: 16,
          }}>T</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#2e3138' }}>测试管理平台</div>
          <div style={{ fontSize: 13, color: '#8c919e', marginTop: 6 }}>TestBench - 统一测试管理与执行</div>
        </div>

        <Form onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#bfc4cd' }} />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfc4cd' }} />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 42 }}>
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#bfc4cd' }}>
          默认账号: admin / admin123
        </div>
      </div>
    </div>
  )
}
