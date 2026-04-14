// ============ 环境配置（全局） ============
export const mockEnvironments = [
  { id: 'env-001', name: 'staging', label: '测试环境', variables: { BASE_URL: 'https://staging.example.com', DB_HOST: '10.0.1.100' } },
  { id: 'env-002', name: 'production', label: '生产环境', variables: { BASE_URL: 'https://api.example.com', DB_HOST: '10.0.2.100' } },
  { id: 'env-003', name: 'dev', label: '开发环境', variables: { BASE_URL: 'http://localhost:8000', DB_HOST: 'localhost' } },
  { id: 'env-004', name: 'pre-release', label: '预发布环境', variables: { BASE_URL: 'https://pre.example.com', DB_HOST: '10.0.3.100' } },
]

// ============ 项目列表 ============
export const mockProjects = [
  { id: 'proj-001', name: 'API网关管理系统', desc: 'API发布、审批、版本管理的核心服务', gitUrl: 'git@code.example.com:team/api-gateway.git', branch: 'main', memberCount: 8, caseCount: 342, planCount: 12, lastRun: { status: 'passed', passRate: 95.2, time: '2026-04-14 08:48' } },
  { id: 'proj-002', name: '用户中心服务', desc: '用户注册、登录、权限的基础服务', gitUrl: 'git@code.example.com:team/user-center.git', branch: 'main', memberCount: 5, caseCount: 186, planCount: 6, lastRun: { status: 'failed', passRate: 82.1, time: '2026-04-13 22:30' } },
  { id: 'proj-003', name: '订单交易系统', desc: '订单创建、支付、退款全流程', gitUrl: 'git@code.example.com:team/order-service.git', branch: 'develop', memberCount: 12, caseCount: 528, planCount: 18, lastRun: { status: 'passed', passRate: 98.5, time: '2026-04-14 06:00' } },
  { id: 'proj-004', name: '支付网关', desc: '多渠道支付接入和对账', gitUrl: 'git@code.example.com:team/payment.git', branch: 'main', memberCount: 6, caseCount: 95, planCount: 4, lastRun: null },
]

// ============ 模块 ============
export const mockModules = [
  { id: 'mod-auth', code: 'AUTH', label: '认证模块', icon: '🔐', subs: [
    { id: 'sub-login', label: '登录', count: 18 },
    { id: 'sub-register', label: '注册', count: 12 },
    { id: 'sub-password', label: '密码管理', count: 8 },
  ]},
  { id: 'mod-approval', code: 'APPROVAL', label: '审批模块', icon: '📋', subs: [
    { id: 'sub-publish', label: '发布审批', count: 21 },
    { id: 'sub-offline', label: '下线审批', count: 14 },
    { id: 'sub-online', label: '上线审批', count: 10 },
  ]},
  { id: 'mod-api', code: 'API', label: 'API管理', icon: '🔌', subs: [
    { id: 'sub-create', label: '创建API', count: 20 },
    { id: 'sub-version', label: '版本管理', count: 15 },
  ]},
]

// 生成用例
const statuses = ['已自动化', '待自动化', '脚本已移除']
const priorities = ['P0', 'P1', 'P2', 'P3']
const types = ['API', 'E2E']
export const mockCases = (() => {
  const cases = []; let seq = 1
  for (const m of mockModules) for (const s of m.subs) {
    for (let i = 0; i < s.count; i++) {
      cases.push({
        id: `TC-${m.code}-${String(seq++).padStart(5,'0')}`,
        title: `${s.label}-测试场景${i+1}: ${['正常流程','边界校验','异常处理','并发场景','权限校验'][i%5]}`,
        type: types[i%2], moduleId: m.id, moduleCode: m.code, subModuleId: s.id, subModuleLabel: s.label,
        priority: priorities[Math.floor(Math.random()*4)],
        status: statuses[Math.floor(Math.random()*3)],
        source: Math.random()>0.3?'导入':'手动',
        flaky: Math.random()>0.92,
        updatedAt: '2026-04-13',
      })
    }
  }
  return cases
})()

// ============ 报告 ============
export const mockReport = {
  reportId: 'rpt-20260414-001',
  planName: 'API审批流程回归-Sprint 12',
  environment: 'staging',
  executedAt: '2026-04-14 08:30:00',
  completedAt: '2026-04-14 08:48:00',
  executedBy: '张三',
  summary: {
    totalScenarios: 120, passed: 95, failed: 8, error: 3, flaky: 2, skipped: 7, xfail: 5,
    passRate: 87.96,
    totalDurationMs: 1079600, avgScenarioDurationMs: 8997,
    totalRequests: 2840, totalAssertions: 5160, failedAssertions: 23,
    automatedCount: 100, manualCount: 20,
  },
  modules: [
    { moduleId: 'mod-approval', label: '审批模块', code: 'APPROVAL', scenarioCount: 45, passed: 36, failed: 5, error: 2, flaky: 1, skipped: 1, xfail: 0, durationMs: 482000,
      subModules: [
        { id: 'sub-publish', label: '发布审批', count: 21, passed: 18, failed: 2, error: 1 },
        { id: 'sub-offline', label: '下线审批', count: 14, passed: 11, failed: 2, error: 0 },
        { id: 'sub-online', label: '上线审批', count: 10, passed: 7, failed: 1, error: 1 },
      ]},
    { moduleId: 'mod-auth', label: '认证模块', code: 'AUTH', scenarioCount: 40, passed: 33, failed: 2, error: 1, flaky: 1, skipped: 3, xfail: 0, durationMs: 352000,
      subModules: [
        { id: 'sub-login', label: '登录', count: 20, passed: 17, failed: 1, error: 1 },
        { id: 'sub-register', label: '注册', count: 12, passed: 10, failed: 1, error: 0 },
        { id: 'sub-password', label: '密码管理', count: 8, passed: 6, failed: 0, error: 0 },
      ]},
    { moduleId: 'mod-api', label: 'API管理', code: 'API', scenarioCount: 35, passed: 26, failed: 1, error: 0, flaky: 0, skipped: 3, xfail: 5, durationMs: 245600,
      subModules: [
        { id: 'sub-create', label: '创建API', count: 20, passed: 15, failed: 1, error: 0 },
        { id: 'sub-version', label: '版本管理', count: 15, passed: 11, failed: 0, error: 0 },
      ]},
  ],
  scenarios: (() => {
    const list = []; let idx = 1
    const mods = [
      { id: 'mod-approval', subs: ['sub-publish','sub-offline','sub-online'], names: ['发布审批','下线审批','上线审批'] },
      { id: 'mod-auth', subs: ['sub-login','sub-register','sub-password'], names: ['登录','注册','密码管理'] },
      { id: 'mod-api', subs: ['sub-create','sub-version'], names: ['创建API','版本管理'] },
    ]
    const sts = ['passed','passed','passed','passed','passed','passed','failed','error','flaky','skipped','xfail']
    for (const m of mods) for (let s=0;s<m.subs.length;s++) {
      const n = 5+Math.floor(Math.random()*10)
      for (let i=0;i<n;i++) {
        const st = sts[Math.floor(Math.random()*sts.length)]
        const manual = Math.random()>0.85
        const sc = manual?0:(3+Math.floor(Math.random()*20))
        list.push({
          scenarioId: `scn-${String(idx++).padStart(3,'0')}`,
          name: `${m.names[s]}-场景${i+1}`,
          moduleId: m.id, subModuleId: m.subs[s],
          status: st, executionType: manual?'manual':'automated',
          stepCount: sc, durationMs: manual?null:(200+Math.floor(Math.random()*8000)),
          errorSummary: st==='failed'?`步骤${Math.ceil(Math.random()*sc)}失败: 预期状态码200，实际500`:st==='error'?'fixture异常: 连接超时':null,
          assignee: manual?['李四','王五','赵六'][Math.floor(Math.random()*3)]:null,
          remark: manual?(st==='passed'?'全流程通过，无异常':'发现问题，已记录'):null,
        })
      }
    }
    return list
  })(),
}

// 步骤列表
export function getMockSteps(scenarioId) {
  const n = 5+Math.floor(Math.random()*12)
  const methods = ['GET','POST','PUT','DELETE']
  const urls = ['/api/auth/login','/api/approval/list','/api/approval/submit','/api/approval/review','/api/users/me','/api/config/env','/api/cases/import']
  return Array.from({length:n},(_,i)=>{
    const fail = i===n-2&&Math.random()>0.4
    return {
      stepId: `${scenarioId}-s${i+1}`,
      name: `${['查询','提交','确认','校验','获取','更新','删除','验证'][i%8]}${['列表','详情','状态','权限','配置','记录'][i%6]}`,
      method: methods[Math.floor(Math.random()*4)],
      url: urls[Math.floor(Math.random()*urls.length)],
      status: fail?'failed':'passed',
      statusCode: fail?500:200,
      durationMs: 30+Math.floor(Math.random()*280),
    }
  })
}

// 步骤详情
export function getMockStepDetail(stepId) {
  return {
    request: {
      headers: {'Content-Type':'application/json','Authorization':'Bearer eyJhbGciOiJIUzI1Ni...','X-Request-ID':'req-'+Math.random().toString(36).substr(2,8)},
      params: {page:1,pageSize:20},
      body: {approvalId:'apr-001',action:'approve',comment:'同意发布',operator:'admin'},
    },
    response: {
      statusCode: 200,
      headers: {'Content-Type':'application/json','X-Response-Time':'135ms'},
      body: {code:0,message:'success',data:{id:'apr-001',status:'approved',updatedAt:'2026-04-14T08:35:00Z',approver:{id:'user-001',name:'张三'}}},
    },
    assertions: [
      {id:'a1',type:'status_code',expression:'status == 200',expected:'200',actual:'200',passed:true},
      {id:'a2',type:'json_path',expression:'$.code == 0',expected:'0',actual:'0',passed:true},
      {id:'a3',type:'json_path',expression:'$.data.status',expected:'approved',actual:'approved',passed:true},
    ],
  }
}

// 计划
// ============ 测试计划列表 ============
export const mockPlans = [
  { id: 'plan-001', name: 'API审批流程回归-Sprint 12', type: '自动化', testType: 'API', environment: 'staging', status: '已完成', createdBy: '张三', executedAt: '2026-04-14 08:30', completedAt: '2026-04-14 08:48', scenarioCount: 120, automated: 100, manual: 20, summary: { passed:95,failed:8,error:3,flaky:2,skipped:7,xfail:5 }, passRate: 87.96, durationMs: 1079600 },
  { id: 'plan-002', name: '用户认证模块冒烟测试', type: '自动化', testType: 'E2E', environment: 'staging', status: '执行中', createdBy: '李四', executedAt: '2026-04-14 10:00', completedAt: null, scenarioCount: 40, automated: 35, manual: 5, summary: { passed:28,failed:2,error:1,flaky:0,skipped:4,xfail:0 }, passRate: 90.32, durationMs: 352000 },
  { id: 'plan-003', name: '订单流程手动验证-v2.1', type: '手动', testType: 'API', environment: 'production', status: '已完成', createdBy: '王五', executedAt: '2026-04-13 14:00', completedAt: '2026-04-13 16:30', scenarioCount: 25, automated: 0, manual: 25, summary: { passed:22,failed:3,error:0,flaky:0,skipped:0,xfail:0 }, passRate: 88.0, durationMs: null },
  { id: 'plan-004', name: '支付网关全量回归', type: '自动化', testType: 'API', environment: 'staging', status: '已暂停', createdBy: '张三', executedAt: '2026-04-13 22:00', completedAt: null, scenarioCount: 95, automated: 95, manual: 0, summary: { passed:40,failed:15,error:5,flaky:3,skipped:32,xfail:0 }, passRate: 63.49, durationMs: 580000 },
  { id: 'plan-005', name: 'API管理模块-Sprint 11 补测', type: '自动化', testType: 'API', environment: 'dev', status: '已完成', createdBy: '赵六', executedAt: '2026-04-12 09:00', completedAt: '2026-04-12 09:25', scenarioCount: 35, automated: 30, manual: 5, summary: { passed:33,failed:1,error:0,flaky:1,skipped:0,xfail:0 }, passRate: 94.29, durationMs: 245600 },
  { id: 'plan-006', name: '注册流程每日冒烟', type: '自动化', testType: 'E2E', environment: 'staging', status: '已完成', createdBy: '李四', executedAt: '2026-04-14 06:00', completedAt: '2026-04-14 06:15', scenarioCount: 12, automated: 12, manual: 0, summary: { passed:12,failed:0,error:0,flaky:0,skipped:0,xfail:0 }, passRate: 100, durationMs: 89000 },
  { id: 'plan-007', name: '密码重置功能验收', type: '手动', testType: 'E2E', environment: 'staging', status: '草稿', createdBy: '王五', executedAt: null, completedAt: null, scenarioCount: 8, automated: 0, manual: 8, summary: { passed:0,failed:0,error:0,flaky:0,skipped:0,xfail:0 }, passRate: 0, durationMs: null },
]

export const mockPlan = {
  id: 'plan-001', name: 'API审批流程回归-Sprint 12',
  type: '自动化', testType: 'API', environment: 'staging', channel: '测试团队群',
  retry: 2, circuitBreaker: { consecutive: 5, rate: 50 },
  status: '已完成', createdBy: '张三',
  executedAt: '2026-04-14 08:30', completedAt: '2026-04-14 08:48',
  total: 120, automated: 100, manual: 20,
  summary: { passed:95,failed:8,error:3,flaky:2,skipped:7,xfail:5 },
}
