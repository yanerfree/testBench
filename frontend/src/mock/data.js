// ============ 用户数据 ============
export const mockUsers = [
  { id: 'user-001', username: 'admin', password: 'admin123', role: 'admin', isActive: true, createdAt: '2026-03-01' },
  { id: 'user-002', username: 'zhangsan', password: '123456', role: 'user', isActive: true, createdAt: '2026-03-05' },
  { id: 'user-003', username: 'lisi', password: '123456', role: 'user', isActive: true, createdAt: '2026-03-10' },
  { id: 'user-004', username: 'wangwu', password: '123456', role: 'user', isActive: true, createdAt: '2026-03-15' },
  { id: 'user-005', username: 'zhaoliu', password: '123456', role: 'user', isActive: false, createdAt: '2026-04-01' },
]

// ============ 全局变量 ============
export const mockGlobalVariables = [
  { key: 'TIMEOUT', value: '30' },
  { key: 'RETRY_COUNT', value: '3' },
  { key: 'LOG_LEVEL', value: 'INFO' },
  { key: 'DEFAULT_PAGE_SIZE', value: '20' },
]

// ============ 环境配置 ============
export const mockEnvironments = [
  { id: 'env-001', name: 'staging', description: '测试环境，日常回归用', variables: [
    { key: 'BASE_URL', value: 'https://staging.example.com' },
    { key: 'DB_HOST', value: '10.0.1.100' },
    { key: 'DB_PORT', value: '5432' },
    { key: 'API_KEY', value: 'sk-staging-xxxxxxxxxxxx', sensitive: true },
  ]},
  { id: 'env-002', name: 'production', description: '生产环境，谨慎操作', variables: [
    { key: 'BASE_URL', value: 'https://api.example.com' },
    { key: 'DB_HOST', value: '10.0.2.100' },
    { key: 'DB_PORT', value: '5432' },
    { key: 'API_KEY', value: 'sk-prod-xxxxxxxxxxxx', sensitive: true },
  ]},
  { id: 'env-003', name: 'dev', description: '本地开发环境', variables: [
    { key: 'BASE_URL', value: 'http://localhost:8000' },
    { key: 'DB_HOST', value: 'localhost' },
    { key: 'DB_PORT', value: '5432' },
  ]},
  { id: 'env-004', name: 'pre-release', description: '预发布环境，上线前验证', variables: [
    { key: 'BASE_URL', value: 'https://pre.example.com' },
    { key: 'DB_HOST', value: '10.0.3.100' },
    { key: 'DB_PORT', value: '5432' },
  ]},
]

// ============ 迭代 ============
export const mockIterations = [
  { id: 'iter-001', name: 'v1.0', description: '首个正式版本', status: 'active', createdAt: '2026-03-15' },
  { id: 'iter-002', name: 'v2.0', description: '二期功能迭代', status: 'active', createdAt: '2026-04-01' },
  { id: 'iter-003', name: 'v0.9-beta', description: '内测版本', status: 'archived', createdAt: '2026-02-20' },
]

// ============ 分支配置 ============
export const mockBranches = [
  { id: 'br-001', name: 'default', branch: 'main', description: '主分支', status: 'active', lastSyncAt: '2026-04-14 10:30', lastCommitSha: 'e2ba92f' },
  { id: 'br-002', name: 'release-2.0', branch: 'release/2.0', description: 'v2.0 发布分支', status: 'active', lastSyncAt: '2026-04-13 18:00', lastCommitSha: 'a1b2c3d' },
  { id: 'br-003', name: 'hotfix-auth', branch: 'hotfix/auth-fix', description: '认证模块紧急修复', status: 'archived', lastSyncAt: '2026-04-10 09:00', lastCommitSha: 'f4e5d6c' },
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

// ============ 手动录入用例 ============
export const mockManualCases = [
  {
    id: 'mc-001', caseId: 'TC-AUTH-00001', title: '登录-密码错误锁定',
    module: '认证模块', subModule: '登录', priority: 'P0',
    preconditions: '1. 用户已注册\n2. 连续错误次数归零',
    steps: [
      { seq: 1, action: '输入正确用户名 + 错误密码', expected: '提示"密码错误"' },
      { seq: 2, action: '点击登录按钮', expected: '提示"密码错误，还剩 4 次机会"' },
      { seq: 3, action: '重复上述操作共 5 次', expected: '每次提示剩余次数递减' },
      { seq: 4, action: '第 6 次输入错误密码', expected: '提示"账号已锁定，请 30 分钟后重试"' },
    ],
    expectedResult: '连续 5 次错误后账号锁定 30 分钟',
    result: null, remark: '', assignee: '李四',
  },
  {
    id: 'mc-002', caseId: 'TC-AUTH-00002', title: '登录-验证码过期校验',
    module: '认证模块', subModule: '登录', priority: 'P1',
    preconditions: '1. 用户已注册\n2. 验证码有效期为 5 分钟',
    steps: [
      { seq: 1, action: '获取验证码', expected: '验证码发送成功' },
      { seq: 2, action: '等待 5 分钟后输入验证码', expected: '提示"验证码已过期"' },
      { seq: 3, action: '重新获取验证码并立即输入', expected: '验证通过' },
    ],
    expectedResult: '过期验证码无法使用，重新获取后正常',
    result: 'passed', remark: '验证通过，表现正常', assignee: '李四',
  },
  {
    id: 'mc-003', caseId: 'TC-AUTH-00003', title: '登录-记住密码功能',
    module: '认证模块', subModule: '登录', priority: 'P2',
    preconditions: '1. 用户已注册',
    steps: [
      { seq: 1, action: '勾选"记住密码"后登录', expected: '登录成功' },
      { seq: 2, action: '关闭浏览器后重新打开登录页', expected: '用户名和密码已自动填充' },
      { seq: 3, action: '取消勾选"记住密码"后登录再重开浏览器', expected: '登录页为空' },
    ],
    expectedResult: '勾选后自动填充，取消后清空',
    result: 'failed', remark: '关闭浏览器后密码未自动填充，cookie 似乎未持久化', assignee: '王五',
  },
  {
    id: 'mc-004', caseId: 'TC-APPROVAL-00001', title: '发布审批-正常审批流程',
    module: '审批模块', subModule: '发布审批', priority: 'P0',
    preconditions: '1. 至少存在一个待审批的发布申请\n2. 当前用户有审批权限',
    steps: [
      { seq: 1, action: '进入审批列表页', expected: '显示待审批列表' },
      { seq: 2, action: '点击某条待审批记录', expected: '进入审批详情页' },
      { seq: 3, action: '填写审批意见并点击"通过"', expected: '审批状态变为"已通过"' },
      { seq: 4, action: '返回列表查看该记录', expected: '状态显示"已通过"' },
    ],
    expectedResult: '审批流程顺利完成，状态正确流转',
    result: null, remark: '', assignee: '王五',
  },
  {
    id: 'mc-005', caseId: 'TC-APPROVAL-00002', title: '发布审批-驳回后重新提交',
    module: '审批模块', subModule: '发布审批', priority: 'P0',
    preconditions: '1. 存在一个待审批的发布申请',
    steps: [
      { seq: 1, action: '审批人点击"驳回"并填写驳回原因', expected: '状态变为"已驳回"' },
      { seq: 2, action: '申请人查看驳回原因', expected: '显示驳回原因' },
      { seq: 3, action: '申请人修改后重新提交', expected: '状态变为"待审批"' },
      { seq: 4, action: '审批人再次审批通过', expected: '状态变为"已通过"' },
    ],
    expectedResult: '驳回后可重新提交并再次审批',
    result: null, remark: '', assignee: null,
  },
  {
    id: 'mc-006', caseId: 'TC-APPROVAL-00003', title: '发布审批-超时自动通过',
    module: '审批模块', subModule: '发布审批', priority: 'P1',
    preconditions: '1. 审批超时时间配置为 24 小时',
    steps: [
      { seq: 1, action: '提交发布申请', expected: '状态为"待审批"' },
      { seq: 2, action: '等待超过 24 小时无人审批', expected: '系统自动通过' },
      { seq: 3, action: '查看审批记录', expected: '显示"系统自动通过"标记' },
    ],
    expectedResult: '超时后自动通过并有明确标记',
    result: null, remark: '', assignee: null,
  },
  {
    id: 'mc-007', caseId: 'TC-API-00001', title: 'API创建-必填字段校验',
    module: 'API管理', subModule: '创建API', priority: 'P0',
    preconditions: '1. 用户已登录且有创建权限',
    steps: [
      { seq: 1, action: '不填任何字段直接点击"创建"', expected: '提示所有必填字段' },
      { seq: 2, action: '仅填写 API 名称', expected: '提示其他必填字段' },
      { seq: 3, action: '填写所有必填字段并提交', expected: '创建成功' },
    ],
    expectedResult: '必填字段校验完整，全部填写后可正常创建',
    result: null, remark: '', assignee: '李四',
  },
  {
    id: 'mc-008', caseId: 'TC-API-00002', title: 'API创建-重名校验',
    module: 'API管理', subModule: '创建API', priority: 'P1',
    preconditions: '1. 已存在名为"用户查询接口"的 API',
    steps: [
      { seq: 1, action: '创建 API 时输入已存在的名称"用户查询接口"', expected: '提示名称已存在' },
      { seq: 2, action: '修改为不重复的名称后提交', expected: '创建成功' },
    ],
    expectedResult: '重名时提示，修改后可正常创建',
    result: 'passed', remark: '重名提示正常', assignee: '赵六',
  },
  {
    id: 'mc-009', caseId: 'TC-API-00003', title: 'API版本-回滚到历史版本',
    module: 'API管理', subModule: '版本管理', priority: 'P0',
    preconditions: '1. API 至少有 2 个版本',
    steps: [
      { seq: 1, action: '进入 API 版本列表', expected: '显示所有历史版本' },
      { seq: 2, action: '选择一个历史版本点击"回滚"', expected: '弹出确认对话框' },
      { seq: 3, action: '确认回滚', expected: 'API 配置恢复为该版本内容' },
      { seq: 4, action: '查看版本列表', expected: '新增一条回滚记录' },
    ],
    expectedResult: '回滚后配置正确恢复，版本记录完整',
    result: null, remark: '', assignee: null,
  },
  {
    id: 'mc-010', caseId: 'TC-AUTH-00004', title: '注册-邮箱格式校验',
    module: '认证模块', subModule: '注册', priority: 'P1',
    preconditions: '无',
    steps: [
      { seq: 1, action: '输入无效邮箱格式（如 abc@）', expected: '提示邮箱格式错误' },
      { seq: 2, action: '输入有效邮箱格式', expected: '校验通过' },
    ],
    expectedResult: '无效邮箱被拦截，有效邮箱通过',
    result: null, remark: '', assignee: '赵六',
  },
  {
    id: 'mc-011', caseId: 'TC-AUTH-00005', title: '密码管理-修改密码',
    module: '认证模块', subModule: '密码管理', priority: 'P0',
    preconditions: '1. 用户已登录',
    steps: [
      { seq: 1, action: '进入个人设置-修改密码', expected: '显示修改密码表单' },
      { seq: 2, action: '输入错误的旧密码', expected: '提示旧密码错误' },
      { seq: 3, action: '输入正确的旧密码和新密码', expected: '修改成功' },
      { seq: 4, action: '用新密码重新登录', expected: '登录成功' },
    ],
    expectedResult: '旧密码验证正确后可修改，新密码立即生效',
    result: null, remark: '', assignee: null,
  },
  {
    id: 'mc-012', caseId: 'TC-APPROVAL-00004', title: '下线审批-批量审批',
    module: '审批模块', subModule: '下线审批', priority: 'P1',
    preconditions: '1. 存在多条待审批的下线申请',
    steps: [
      { seq: 1, action: '勾选多条待审批记录', expected: '批量操作栏出现' },
      { seq: 2, action: '点击"批量通过"', expected: '弹出确认对话框' },
      { seq: 3, action: '确认批量通过', expected: '所有选中记录状态变为"已通过"' },
    ],
    expectedResult: '批量审批一次性完成，状态全部正确',
    result: 'passed', remark: '批量通过 3 条记录，全部状态正常', assignee: '李四',
  },
]
