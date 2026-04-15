import { useState } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Button, Tooltip, message, Select } from 'antd'
import {
  FolderOutlined, FileTextOutlined, UnorderedListOutlined, BarChartOutlined,
  SettingOutlined, UserOutlined, FileSearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined, TagOutlined,
} from '@ant-design/icons'
import ProjectList from './pages/projects/ProjectList'
import CaseManagement from './pages/cases/CaseManagement'
import CaseDetail from './pages/cases/CaseDetail'
import PlanList from './pages/plan/PlanList'
import PlanDetail from './pages/plan/PlanDetail'
import ReportDetail from './pages/report/ReportDetail'
import Login from './pages/auth/Login'
import { mockIterations } from './mock/data'
import ManualRecord from './pages/plan/ManualRecord'
import EnvConfig from './pages/settings/EnvConfig'
import UserManagement from './pages/settings/UserManagement'
import AuditLogs from './pages/settings/AuditLogs'

const { Header, Sider, Content } = Layout

function RequireAuth({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [currentIteration, setCurrentIteration] = useState('iter-001')
  const navigate = useNavigate()
  const location = useLocation()

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isProjectPage = location.pathname.includes('/projects/')
  const activeIterations = mockIterations.filter(i => i.status === 'active')

  const menuItems = [
    { key: '/projects', icon: <FolderOutlined />, label: '项目列表' },
    ...(isProjectPage ? [
      { type: 'divider' },
      { key: '/projects/proj-001/cases', icon: <FileTextOutlined />, label: '用例管理' },
      { key: '/projects/proj-001/plans', icon: <UnorderedListOutlined />, label: '测试计划' },
      { key: '/projects/proj-001/reports/rpt-001', icon: <BarChartOutlined />, label: '测试报告' },
      { type: 'divider' },
      { key: '/settings/env', icon: <SettingOutlined />, label: '环境配置' },
      { key: '/settings/users', icon: <UserOutlined />, label: '用户管理' },
      { key: '/settings/logs', icon: <FileSearchOutlined />, label: '操作日志' },
    ] : []),
  ]

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    message.success('已退出登录')
    navigate('/login', { replace: true })
  }

  const userMenu = {
    items: [
      { key: 'profile', label: '个人设置' },
      { type: 'divider' },
      { key: 'logout', label: '退出登录', onClick: handleLogout },
    ]
  }

  const displayName = user.username === 'admin' ? '管理员' : user.username || '用户'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 浅色顶栏 - Apifox 风格 */}
      <Header style={{
        background: '#fff', height: 46, lineHeight: '46px', padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f3',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'linear-gradient(135deg, #a78bfa 0%, #7c8cf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 13,
          }}>T</div>
          <span style={{ color: '#2e3138', fontSize: 14, fontWeight: 600 }}>测试管理平台</span>
          {isProjectPage && (
            <>
              <span style={{ color: '#e0e0e3', margin: '0 4px' }}>/</span>
              <span style={{ color: '#8c919e', fontSize: 13 }}>API网关管理系统</span>
              <span style={{ color: '#e0e0e3', margin: '0 4px' }}>/</span>
              <Select
                value={currentIteration}
                onChange={setCurrentIteration}
                size="small"
                variant="borderless"
                style={{ width: 110 }}
                suffixIcon={<TagOutlined style={{ color: '#bfc4cd', fontSize: 11 }} />}
                options={activeIterations.map(i => ({ value: i.id, label: i.name }))}
              />
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tooltip title="通知">
            <Button type="text" icon={<BellOutlined style={{ color: '#bfc4cd' }} />} size="small" />
          </Tooltip>
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Avatar size={24} style={{ background: '#a78bfa', fontSize: 11 }}>{displayName[0]}</Avatar>
              <span style={{ color: '#8c919e', fontSize: 13 }}>{displayName}</span>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout>
        <Sider
          width={200}
          collapsedWidth={52}
          collapsed={collapsed}
          theme="light"
          style={{ background: '#fff', borderRight: '1px solid #f0f0f3', overflow: 'auto' }}
        >
          <div style={{ padding: '8px 6px 2px' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ width: '100%', color: '#bfc4cd' }}
              size="small"
            />
          </div>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ border: 'none', fontSize: 13 }}
          />
        </Sider>

        {/* 内容区：紧凑间距 */}
        <Content style={{ padding: '12px 16px', background: '#fafafa', overflow: 'auto', minHeight: 'calc(100vh - 46px)' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/projects/:projectId/cases" element={<CaseManagement />} />
            <Route path="/projects/:projectId/cases/:caseId" element={<CaseDetail />} />
            <Route path="/projects/:projectId/plans" element={<PlanList />} />
            <Route path="/projects/:projectId/plans/:planId" element={<PlanDetail />} />
            <Route path="/projects/:projectId/plans/:planId/manual-record" element={<ManualRecord />} />
            <Route path="/projects/:projectId/reports/:reportId" element={<ReportDetail />} />
            <Route path="/settings/env" element={<EnvConfig />} />
            <Route path="/settings/users" element={<UserManagement />} />
            <Route path="/settings/logs" element={<AuditLogs />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<RequireAuth><AppLayout /></RequireAuth>} />
    </Routes>
  )
}
