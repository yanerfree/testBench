import { useState, useEffect, useCallback } from 'react'
import { Table, Tag, Input, Select, DatePicker, Space, message } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { api } from '../../utils/request'

const { RangePicker } = DatePicker

const ACTION_CONFIG = {
  create: { label: '创建', color: '#6ecf96', bg: '#eefbf3' },
  update: { label: '修改', color: '#6b7ef5', bg: '#eef0fe' },
  delete: { label: '删除', color: '#f08a8e', bg: '#fef0f1' },
  execute: { label: '执行', color: '#f5b87a', bg: '#fef5eb' },
  import: { label: '导入', color: '#7ec2f7', bg: '#eef6fe' },
  archive: { label: '归档', color: '#bfc4cd', bg: '#f5f5f7' },
  login: { label: '登录', color: '#b89aed', bg: '#f5f0fe' },
  sync: { label: '同步', color: '#7ec2f7', bg: '#eef6fe' },
}

const TARGET_TYPES = ['user', 'project', 'branch', 'case', 'plan', 'environment', 'channel']
const TARGET_TYPE_LABELS = {
  user: '用户', project: '项目', branch: '分支配置', case: '用例',
  plan: '计划', environment: '环境', channel: '通知渠道',
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [keyword, setKeyword] = useState('')
  const [actionFilter, setActionFilter] = useState(null)
  const [targetFilter, setTargetFilter] = useState(null)
  const [dateRange, setDateRange] = useState(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page)
      params.append('pageSize', pageSize)
      if (keyword) params.append('keyword', keyword)
      if (actionFilter) params.append('action', actionFilter)
      if (targetFilter) params.append('targetType', targetFilter)
      if (dateRange?.[0]) params.append('startTime', dateRange[0].toISOString())
      if (dateRange?.[1]) params.append('endTime', dateRange[1].toISOString())

      const res = await api.get(`/logs?${params.toString()}`)
      const data = res.data
      setLogs(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      // 非 admin 会收到 403，静默处理
      if (err?.response?.status !== 403) {
        message.error('加载日志失败')
      }
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, actionFilter, targetFilter, dateRange])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const columns = [
    {
      title: '时间', dataIndex: 'createdAt', width: 170,
      render: v => <span style={{ fontSize: 13, color: '#8c919e', fontFamily: 'monospace' }}>
        {v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '-'}
      </span>,
    },
    {
      title: '操作人', dataIndex: 'username', width: 100,
      render: v => <span style={{ fontWeight: 500 }}>{v || '-'}</span>,
    },
    {
      title: '操作', dataIndex: 'action', width: 80, align: 'center',
      render: v => {
        const cfg = ACTION_CONFIG[v] || { label: v, color: '#86909c', bg: '#f5f5f7' }
        return <Tag style={{ color: cfg.color, background: cfg.bg, border: 'none' }}>{cfg.label}</Tag>
      },
    },
    {
      title: '对象类型', dataIndex: 'targetType', width: 90, align: 'center',
      render: v => <Tag style={{ color: '#555a65', background: '#f5f5f7', border: 'none' }}>
        {TARGET_TYPE_LABELS[v] || v}
      </Tag>,
    },
    {
      title: '对象名称', dataIndex: 'targetName', width: 200,
      render: v => <span style={{ fontSize: 13, color: '#555a65' }}>{v || '-'}</span>,
    },
    {
      title: '变更摘要', dataIndex: 'changes',
      render: v => <span style={{ fontSize: 13, color: '#86909c' }}>
        {v ? JSON.stringify(v).substring(0, 60) : '-'}
      </span>,
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#2e3138' }}>操作日志</h2>
        <span style={{ fontSize: 13, color: '#8c919e' }}>记录所有用户操作行为，默认展示最近 7 天</span>
      </div>

      <div style={{
        display: 'flex', gap: 10, marginBottom: 12, padding: '12px 16px',
        background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3',
      }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bfc4cd' }} />}
          placeholder="搜索对象名称..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onPressEnter={fetchLogs}
          allowClear
          style={{ width: 260 }}
        />
        <Select
          placeholder="操作类型"
          value={actionFilter}
          onChange={v => { setActionFilter(v); setPage(1) }}
          allowClear
          style={{ width: 130 }}
          options={Object.entries(ACTION_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
        />
        <Select
          placeholder="对象类型"
          value={targetFilter}
          onChange={v => { setTargetFilter(v); setPage(1) }}
          allowClear
          style={{ width: 130 }}
          options={TARGET_TYPES.map(t => ({ value: t, label: TARGET_TYPE_LABELS[t] || t }))}
        />
        <RangePicker
          size="middle" style={{ width: 260 }}
          placeholder={['开始日期', '结束日期']}
          onChange={v => { setDateRange(v); setPage(1) }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f0f0f3', padding: 2 }}>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            size: 'small',
            showTotal: t => `共 ${t} 条记录`,
            showSizeChanger: true,
            pageSizeOptions: [15, 30, 50],
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          }}
        />
      </div>
    </div>
  )
}
