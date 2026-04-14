import { Card, Row, Col, Button, Tag, Progress, Space } from 'antd'
import { PlusOutlined, EditOutlined, SyncOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { mockProjects } from '../../mock/data'

export default function ProjectList() {
  const navigate = useNavigate()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1d2129' }}>项目列表</h2>
        <Button type="primary" icon={<PlusOutlined />}>创建项目</Button>
      </div>

      <Row gutter={[12, 12]}>
        {mockProjects.map(p => (
          <Col span={6} key={p.id}>
            <Card
              hoverable
              onClick={() => navigate(`/projects/${p.id}/cases`)}
              style={{ height: '100%' }}
              styles={{ body: { padding: 20 } }}
            >
              {/* 项目名称 */}
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

              {/* 统计 */}
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

              {/* 最近执行 */}
              {p.lastRun ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Tag color={p.lastRun.status === 'passed' ? '#f6ffed' : '#fff2f0'}
                      style={{ color: p.lastRun.status === 'passed' ? '#6ecf96' : '#f08a8e' }}>
                      通过率 {p.lastRun.passRate}%
                    </Tag>
                  </div>
                  <span style={{ fontSize: 11, color: '#c0c4cc' }}>{p.lastRun.time}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#c0c4cc' }}>暂无执行记录</div>
              )}

              {/* 底部操作 */}
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
    </div>
  )
}
