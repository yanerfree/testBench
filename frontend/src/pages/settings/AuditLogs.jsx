import { useState, useMemo } from 'react'
import { Table, Tag, Input, Select, DatePicker, Space } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const { RangePicker } = DatePicker

const ACTION_CONFIG = {
  create: { label: '创建', color: '#6ecf96', bg: '#eefbf3' },
  update: { label: '修改', color: '#6b7ef5', bg: '#eef0fe' },
  delete: { label: '删除', color: '#f08a8e', bg: '#fef0f1' },
  execute: { label: '执行', color: '#f5b87a', bg: '#fef5eb' },
  import: { label: '导入', color: '#7ec2f7', bg: '#eef6fe' },
  archive: { label: '归档', color: '#bfc4cd', bg: '#f5f5f7' },
  login: { label: '登录', color: '#b89aed', bg: '#f5f0fe' },
}

const TARGET_TYPES = ['用例', '计划', '项目', '环境', '用户', '分支配置', '通知渠道']

const mockLogs = (() => {
  const operators = ['admin', 'zhangsan', 'lisi', 'wangwu', 'zhaoliu']
  const actions = Object.keys(ACTION_CONFIG)
  const targets = [
    { type: '用例', name: 'TC-AUTH-00001 登录-密码错误锁定' },
    { type: '用例', name: 'TC-API-00015 创建API-重名校验' },
    { type: '计划', name: 'API审批流程回归-Sprint 12' },
    { type: '计划', name: '用户认证模块冒烟测试' },
    { type: '项目', name: 'API网关管理系统' },
    { type: '项目', name: '用户中心服务' },
    { type: '环境', name: 'staging' },
    { type: '环境', name: 'production' },
    { type: '用户', name: 'zhangsan' },
    { type: '用户', name: 'lisi' },
    { type: '分支配置', name: 'default (main)' },
    { type: '通知渠道', name: '测试团队群' },
  ]
  const logs = []
  const baseTime = new Date('2026-04-15T10:00:00')
  for (let i = 0; i < 50; i++) {
    const target = targets[Math.floor(Math.random() * targets.length)]
    const action = actions[Math.floor(Math.random() * actions.length)]
    const time = new Date(baseTime.getTime() - i * 1000 * 60 * (5 + Math.floor(Math.random() * 30)))
    logs.push({
      id: `log-${String(i + 1).padStart(3, '0')}`,
      operator: operators[Math.floor(Math.random() * operators.length)],
      action,
      targetType: target.type,
      targetName: target.name,
      createdAt: time.toISOString().replace('T', ' ').substring(0, 19),
      summary: getSummary(action, target),
    })
  }
  return logs
})()

function getSummary(action, target) {
  const map = {
    create: `创建了${target.type}「${target.name}」`,
    update: `修改了${target.type}「${target.name}」的配置`,
    delete: `删除了${target.type}「${target.name}」`,
    execute: `执行了${target.type}「${target.name}」`,
    import: `导入了${target.type}「${target.name}」`,
    archive: `归档了${target.type}「${target.name}」`,
    login: `用户登录系统`,
  }
  return map[action] || `操作了${target.type}「${target.name}」`
}

export default function AuditLogs() {
  const [keyword, setKeyword] = useState('')
  const [actionFilter, setActionFilter] = useState(null)
  const [targetFilter, setTargetFilter] = useState(null)

  const filteredLogs = useMemo(() => {
    let result = mockLogs
    if (keyword) {
      const kw = keyword.toLowerCase()
      result = result.filter(l =>
        l.operator.toLowerCase().includes(kw) ||
        l.targetName.toLowerCase().includes(kw) ||
        l.summary.toLowerCase().includes(kw)
      )
    }
    if (actionFilter) result = result.filter(l => l.action === actionFilter)
    if (targetFilter) result = result.filter(l => l.targetType === targetFilter)
    return result
  }, [keyword, actionFilter, targetFilter])

  const columns = [
    {
      title: '时间', dataIndex: 'createdAt', width: 170,
      render: v => <span style={{ fontSize: 13, color: '#8c919e', fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '操作人', dataIndex: 'operator', width: 100,
      render: v => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '操作', dataIndex: 'action', width: 80, align: 'center',
      render: v => {
        const cfg = ACTION_CONFIG[v]
        return <Tag style={{ color: cfg.color, background: cfg.bg, border: 'none' }}>{cfg.label}</Tag>
      },
    },
    {
      title: '对象类型', dataIndex: 'targetType', width: 90, align: 'center',
      render: v => <Tag style={{ color: '#555a65', background: '#f5f5f7', border: 'none' }}>{v}</Tag>,
    },
    {
      title: '操作详情', dataIndex: 'summary',
      render: v => <span style={{ fontSize: 13, color: '#555a65' }}>{v}</span>,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#2e3138' }}>操作日志</h2>
        <span style={{ fontSize: 13, color: '#8c919e' }}>记录所有用户操作行为，默认展示最近 7 天</span>
      </div>

      {/* 筛选栏 */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 12, padding: '12px 16px',
        background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3',
      }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bfc4cd' }} />}
          placeholder="搜索操作人、对象名称..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          allowClear
          style={{ width: 260 }}
        />
        <Select
          placeholder="操作类型"
          value={actionFilter}
          onChange={setActionFilter}
          allowClear
          style={{ width: 130 }}
          options={Object.entries(ACTION_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
        />
        <Select
          placeholder="对象类型"
          value={targetFilter}
          onChange={setTargetFilter}
          allowClear
          style={{ width: 130 }}
          options={TARGET_TYPES.map(t => ({ value: t, label: t }))}
        />
        <RangePicker size="middle" style={{ width: 260 }} placeholder={['开始日期', '结束日期']} />
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3', padding: 2 }}>
        <Table
          dataSource={filteredLogs}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{
            pageSize: 15,
            size: 'small',
            showTotal: t => `共 ${t} 条记录`,
            showSizeChanger: true,
            pageSizeOptions: [15, 30, 50],
          }}
        />
      </div>
    </div>
  )
}
