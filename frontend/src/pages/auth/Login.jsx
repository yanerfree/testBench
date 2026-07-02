import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { api } from '../../utils/request'
import { useLang } from '../../utils/i18n.jsx'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { t, lang, setLang } = useLang()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', {
        username: values.username,
        password: values.password,
      })
      const { token, user } = res.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      message.success(t('login.success'))
      navigate('/', { replace: true })
    } catch {
      // api.post 内部已通过 message.error 展示了后端错误信息
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #e8f5e9 0%, #f0ecfb 40%, #edf5f0 70%, #fff3e0 100%)',
    }}>
      <div style={{
        width: 380,
        padding: '40px 36px 32px',
        background: 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 20,
        boxShadow: '0 8px 40px rgba(54, 179, 126, 0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 16,
            background: 'linear-gradient(135deg, #36b37e, #36b37ecc)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 22, marginBottom: 16,
            boxShadow: '0 4px 16px rgba(54,179,126,0.25)',
          }}>T</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#1d2129', letterSpacing: 1 }}>{t('login.title')}</div>
          <div style={{ fontSize: 13, color: '#86909c', marginTop: 6, letterSpacing: 0.5 }}>{t('login.subtitle')}</div>
        </div>

        <Form onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: t('login.username') }]}>
            <Input prefix={<UserOutlined style={{ color: '#c9cdd4' }} />} placeholder={t('login.username')} id="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('login.password') }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#c9cdd4' }} />} placeholder={t('login.password')} id="password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 42 }}>
              {t('login.submit')}
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button type="link" size="small" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? 'English' : '中文'}
          </Button>
        </div>
      </div>
    </div>
  )
}
