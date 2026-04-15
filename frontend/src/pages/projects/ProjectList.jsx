import { useState } from 'react'
import { Card, Row, Col, Button, Tag, Modal, Form, Input, Space, message } from 'antd'
import { PlusOutlined, EditOutlined, SyncOutlined, RightOutlined, GitlabOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { mockProjects } from '../../mock/data'

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState(mockProjects)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()

  const handleCreate = () => {
    form.validateFields().then(values => {
      if (projects.some(p => p.name === values.name)) {
        message.error('项目名称已存在')
        return
      }
      const newProject = {
        id: `proj-${Date.now()}`,
        name: values.name,
        desc: values.desc || '',
        gitUrl: values.gitUrl,
        branch: 'main',
        memberCount: 1,
        caseCount: 0,
        planCount: 0,
        lastRun: null,
      }
      setProjects(prev => [...prev, newProject])
      setCreateOpen(false)
      form.resetFields()
      message.success('项目创建成功，已自动创建默认分支配置（main）')
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1d2129' }}>项目列表</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建项目</Button>
      </div>

      <Row gutter={[12, 12]}>
        {projects.map(p => (
          <Col span={6} key={p.id}>
            <Card
              hoverable
              onClick={() => navigate(`/projects/${p.id}/cases`)}
              style={{ height: '100%' }}
              styles={{ body: { padding: 20 } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, #e8f4fd 0%, #d6e8ff 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>📁</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#86909c' }}>{p.desc}</div>
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
                margin: '16px 0', padding: '12px 0',
                borderTop: '1px solid #f2f3f5', borderBottom: '1px solid #f2f3f5',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#1d2129' }}>{p.caseCount}</div>
                  <div style={{ fontSize: 11, color: '#86909c' }}>用例</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#1d2129' }}>{p.planCount}</div>
                  <div style={{ fontSize: 11, color: '#86909c' }}>计划</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#1d2129' }}>{p.memberCount}</div>
                  <div style={{ fontSize: 11, color: '#86909c' }}>成员</div>
                </div>
              </div>

              {p.lastRun ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Tag color={p.lastRun.status === 'passed' ? '#f6ffed' : '#fff2f0'}
                    style={{ color: p.lastRun.status === 'passed' ? '#6ecf96' : '#f08a8e' }}>
                    通过率 {p.lastRun.passRate}%
                  </Tag>
                  <span style={{ fontSize: 11, color: '#c0c4cc' }}>{p.lastRun.time}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#c0c4cc' }}>暂无执行记录</div>
              )}

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={e => e.stopPropagation()}>编辑</Button>
                <Button size="small" type="text" icon={<SyncOutlined />} onClick={e => e.stopPropagation()} style={{ color: '#6ecf96' }}>更新脚本</Button>
                <div style={{ flex: 1 }} />
                <RightOutlined style={{ color: '#c0c4cc', fontSize: 12, alignSelf: 'center' }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 创建项目弹窗 */}
      <Modal
        title="创建项目"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields() }}
        okText="创建"
        cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name" label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="如：API网关管理系统" />
          </Form.Item>
          <Form.Item name="desc" label="项目描述">
            <Input placeholder="简要描述项目用途" />
          </Form.Item>
          <Form.Item
            name="gitUrl" label="Git 仓库地址"
            rules={[
              { required: true, message: '请输入 Git 仓库地址' },
              { pattern: /^(git@|https?:\/\/)/, message: '请输入有效的 Git 地址（git@ 或 https://）' },
            ]}
          >
            <Input prefix={<GitlabOutlined style={{ color: '#bfc4cd' }} />} placeholder="git@code.example.com:team/repo.git" />
          </Form.Item>
          <Form.Item
            name="scriptPath" label="脚本基础路径"
            rules={[{ required: true, message: '请输入脚本基础路径' }]}
          >
            <Input prefix={<FolderOpenOutlined style={{ color: '#bfc4cd' }} />} placeholder="/workspace/repos/project-name" />
          </Form.Item>
          <div style={{ padding: '8px 12px', background: '#f0f4ff', borderRadius: 8, fontSize: 12, color: '#6b7ef5' }}>
            创建后系统将自动生成默认分支配置（名称: default，分支: main）
          </div>
        </Form>
      </Modal>
    </div>
  )
}
