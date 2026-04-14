import { useState } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Button, Tooltip } from 'antd'
import {
  FolderOutlined, FileTextOutlined, UnorderedListOutlined, BarChartOutlined,
  SettingOutlined, UserOutlined, FileSearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined,
} from '@ant-design/icons'
import ProjectList from './pages/projects/ProjectList'
import CaseManagement from './pages/cases/CaseManagement'
import CaseDetail from './pages/cases/CaseDetail'
import PlanDetail from './pages/plan/PlanDetail'
import ReportDetail from './pages/report/ReportDetail'

const { Header, Sider, Content } = Layout

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const isProjectPage = location.pathname.includes('/projects/')

  const menuItems = [
    { key: '/projects', icon: <FolderOutlined />, label: '项目列表' },
    ...(isProjectPage ? [
      { type: 'divider' },
      { key: '/projects/proj-001/cases', icon: <FileTextOutlined />, label: '用例管理' },
      { key: '/projects/proj-001/plans/plan-001', icon: <UnorderedListOutlined />, label: '测试计划' },
      { key: '/projects/proj-001/reports/rpt-001', icon: <BarChartOutlined />, label: '测试报告' },
      { type: 'divider' },
      { key: '/settings/env', icon: <SettingOutlined />, label: '环境配置' },
      { key: '/settings/users', icon: <UserOutlined />, label: '用户管理' },
      { key: '/settings/logs', icon: <FileSearchOutlined />, label: '操作日志' },
    ] : []),
  ]

  const userMenu = {
    items: [
      { key: 'profile', label: '个人设置' },
      { type: 'divider' },
      { key: 'logout', label: '退出登录' },
    ]
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        background: '#1d1d1f', height: 48, lineHeight: '48px', padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 14,
          }}>T</div>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>测试管理平台</span>
          {isProjectPage && (
            <>
              <span style={{ color: '#555', margin: '0 4px' }}>/</span>
              <span style={{ color: '#aaa', fontSize: 13 }}>API网关管理系统</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Tooltip title="通知">
            <Button type="text" icon={<BellOutlined style={{ color: '#999' }} />} size="small" />
          </Tooltip>
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar size={26} style={{ background: '#667eea', fontSize: 12 }}>张</Avatar>
              <span style={{ color: '#ccc', fontSize: 13 }}>张三</span>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout>
        <Sider
          width={220}
          collapsedWidth={56}
          collapsed={collapsed}
          theme="light"
          style={{ background: '#fff', borderRight: '1px solid #f2f3f5', overflow: 'auto' }}
        >
          <div style={{ padding: '12px 8px 4px' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ width: '100%', color: '#86909c' }}
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

        <Content style={{ padding: 24, background: '#f7f8fa', overflow: 'auto', minHeight: 'calc(100vh - 48px)' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/projects/:projectId/cases" element={<CaseManagement />} />
            <Route path="/projects/:projectId/cases/:caseId" element={<CaseDetail />} />
            <Route path="/projects/:projectId/plans/:planId" element={<PlanDetail />} />
            <Route path="/projects/:projectId/reports/:reportId" element={<ReportDetail />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
