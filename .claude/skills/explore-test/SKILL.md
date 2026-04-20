---
name: explore-test
description: 对指定页面进行一次性系统测试（功能 + 安全 + 性能 + UI），支持有文档（spec）和无文档（explore）两种模式，输出结构化测试报告到 error.md。
allowed-tools: Bash(playwright-cli:*) Read Write Glob
---

# 页面系统测试技能

对目标页面执行一次性系统测试，涵盖功能、安全、性能、UI 四个维度，结果写入指定路径的 `error.md`。

## 输入参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `目标页面` | ✅ | 要测试的页面完整 URL 或路径 |
| `报告路径` | ✅ | `report.md` 的输出目录（如 `./discover_test/`） |
| `测试模式` | ✅ | `spec`（有文档）或 `explore`（无文档，默认） |
| `文档路径` | spec 模式必填 | 需求/接口/设计文档的本地路径，支持多个文件 |
| `凭据来源` | 可选 | 默认从 `.env` 读取 `USERNAME`/`PASSWORD` |

---

## 执行流程总览

```
spec 模式：  [Step 0 读文档] → Step 1 准备凭据 → Step 2 登录 → Step 3 功能测试(规格验证) → Step 3.5 响应式检查 → Step 4 安全测试 → [Step 4.5 RBAC] → Step 5 性能测试 → Step 6 关闭 → Step 7 写报告
explore 模式：                  Step 1 准备凭据 → Step 2 登录 → Step 3 功能测试(单遍扫描) → Step 3.5 响应式检查 → Step 4 安全测试 → [Step 4.5 RBAC] → Step 5 性能测试 → Step 6 关闭 → Step 7 写报告
```

- Step 3.5（响应式检查）、Step 4（安全测试）、Step 5（性能测试）两种模式完全相同
- Step 4.5（RBAC 角色权限）：仅当 `.env` 中配置了第二账号时执行，用方括号标注

---

## Step 0：读取文档【仅 spec 模式】

在打开浏览器之前，用 `Read` 工具读取用户提供的文档，提取以下信息并保存到工作记忆，供 Step 3 使用：

1. **功能点清单**：页面应具备哪些功能，每条对应哪个需求编号（如 REQ-001）
2. **接口契约**：核心 API 的请求/响应格式、状态码约定、字段含义
3. **字段规则**：必填项、长度限制、格式约束、枚举值
4. **UI 规范**：关键交互的预期行为（如删除需二次确认、搜索实时触发等）
5. **边界条件**：文档中明确提到的特殊情况

> 读取完成后，基于以上内容生成本次测试的**定制化测试用例列表**，替代 Step 3 中的通用功能清单。

---

## Step 1：准备凭据

用 `Read` 工具读取项目根目录 `.env` 文件获取登录凭据。若用户在参数中已提供则直接使用。

```
.env 格式示例：
USERNAME=admin
PASSWORD=secret
APP_URL=https://example.com
USERNAME_LIJH=lowperm_user    # 低权限账号（Step 4.5 使用，可选）
PASSWORD_LIJH=lowperm_pass
```

---

## Step 2：登录并导航到目标页面

```bash
playwright-cli open <APP_URL>
playwright-cli snapshot
# 识别登录表单元素后填写凭据
playwright-cli fill <用户名输入框ref> "<USERNAME>"
playwright-cli fill <密码输入框ref> "<PASSWORD>"
playwright-cli click <登录按钮ref>
# 导航到目标页面
playwright-cli goto <目标页面>
playwright-cli snapshot
```

登录后的 snapshot 同时作为 Step 3 的起始状态，**不再单独做一次「观察快照」**。

---

## Step 3：功能测试

### spec 模式：规格验证

基于 Step 0 提取的定制用例逐条执行，每条用例节奏：

```
执行操作 → 对照文档中的预期行为 → 记录通过/偏差/缺失
```

额外检查项（文档无法覆盖的通用质量点）：
- 列表计数与实际条目数量是否一致
- 网络请求是否有非预期的 4xx/5xx 响应

### explore 模式：单遍扫描

**一次 snapshot，边识别边测试，不重复读取页面。** 每发现一个可交互元素按以下节奏处理：

```
识别元素（从当前 snapshot 读取，不重新 snapshot）
    ↓
内联推断预期行为（依据：标签文字、placeholder、相邻元素语义、通用交互惯例）
    ↓
立即执行测试操作
    ↓
记录结果（符合推断 / 偏差 / 崩溃）
    ↓
继续下一个元素
```

**推断依据参考：**
- 带 `*` 号的字段 → 必填，空提交应有校验提示
- 搜索框 + 提交/回车 → 应过滤列表，清空应恢复全量
- 「删除」按钮 → 应有二次确认对话框
- 「编辑」按钮 → 打开表单应回填现有数据
- 列表底部数字（如「共 8 条」）→ 应与实际渲染条目数一致
- 下拉筛选 → 选择某项后列表应按该条件过滤
- 空列表 → 应显示"暂无数据"等占位组件，而非空白区域
- 页面初始加载 → 应有 loading 骨架屏或 spinner
- 接口报错时 → 应显示错误提示，而非白屏或无任何提示

**覆盖顺序（从上到下，从主到次）：**

1. 列表加载与计数
2. 搜索与过滤（含清空还原）
3. 分页（切换每页条数）
4. 新建/创建（空提交验证 → 有效提交验证）
5. 编辑（数据回填验证 → 保存验证）
6. 删除（确认流程 → 取消或使用测试数据执行删除）
7. 展开/详情（子数据加载）
8. UI 三状态检查（空状态 / 加载态 / 网络错误态）

**UI 三状态检查命令：**

```bash
# 1. 空状态：搜索不可能存在的关键词
playwright-cli fill <搜索框ref> "__empty_state_test_xyz__"
playwright-cli press Enter
# 预期：显示"暂无数据"等占位组件；实际：空白区域或页面报错 → 记录 P2

# 2. 加载态：刷新并立即截图（捕捉 skeleton/spinner）
playwright-cli reload
playwright-cli screenshot --filename=ui-loading.png
# 预期：可见 loading 骨架屏或 spinner；截图留档即可

# 3. 错误态：路由拦截模拟接口 500
playwright-cli route "**/api/**" --status=500
playwright-cli reload
playwright-cli screenshot --filename=ui-error.png
# 预期：显示错误提示 UI（如"加载失败，请重试"）；实际：白屏或无提示 → 记录 P2
playwright-cli unroute "**/api/**"
playwright-cli reload
```

> **数据还原原则**：写操作测试后若使用了真实数据，必须恢复原始值；XSS payload 保存成功后必须立即改回原始值。

---

### 功能测试增强项（按需执行）

> 以下 7 类场景**检测到对应元素/功能则执行，检测不到则跳过**，不强制覆盖。每项附有适用条件与价值说明。

---

#### E1：表单深度验证

**适用条件：** 页面存在新建或编辑表单

**为什么重要：** 基础空提交校验仅验证了「字段是否必填」，但实际业务中格式错误、超长内容、重名冲突、字段联动等是最高频的 P2 问题，且往往前端没有防护、只靠后端报错。

**测试动作：**
```
1. 格式验证
   - 在邮箱/手机号/日期等格式敏感字段填入随机字符串（如 "abc@@@@"），提交
   - 预期：提示格式错误；实际：无提示或 500 → 记录缺陷

2. 长度边界
   - 找到有明显长度限制的字段（name、description 等），粘贴 256/512/1001 个字符，提交
   - 预期：截断或校验提示；实际：无限制存储 → 记录缺陷

3. 重复/唯一性
   - 使用已存在的唯一键（名称、编码等）再次提交相同值
   - 预期：提示"已存在"；实际：重复写入 → 记录缺陷

4. 字段联动（若存在）
   - 操作触发字段（如类型、状态下拉），检查关联字段是否随之显示/隐藏/变为必填
   - 预期：逻辑联动生效；实际：联动无效 → 记录缺陷

5. 未保存离开提醒
   - 在表单中输入内容后，点击取消或关闭弹窗
   - 预期：出现"确定放弃修改？"确认提示；实际：直接关闭丢失数据 → 记录 P3 缺陷
```

---

#### E2：状态驱动的操作可用性

**适用条件：** 列表存在状态列（如：启用/禁用、运行中/已停止、草稿/已发布）

**为什么重要：** 不同状态下允许执行的操作不同是常见业务规则。按钮应随状态禁用/隐藏，服务端也需拒绝非法操作，否则可能造成数据不一致。

**测试动作：**
```
1. 找到处于特定状态的记录（如"运行中"），检查操作列按钮
   - 预期：不适用的操作（如"启动"）灰显或隐藏
   - 实际：按钮仍可点击且成功执行 → 记录缺陷

2. 若页面存在状态切换按钮（启用/禁用），点击后
   - 预期：状态文字和操作按钮均即时更新
   - 实际：状态切换但按钮无变化（前端未响应） → 记录 P2 缺陷

3. 绕过前端：对"运行中"状态的记录，直接通过网络工具发送"删除"请求
   - 预期：服务端返回 400/409，拒绝操作
   - 实际：返回 200 删除成功 → 记录 P1 缺陷（缺少服务端状态保护）
```

---

#### E3：搜索边界测试

**适用条件：** 页面有搜索框或筛选条件

**为什么重要：** 基础搜索测试只验证正常关键词是否生效，但边界输入（特殊字符、超长、全半角混合）容易引发搜索报错、注入风险或用户体验问题。

**测试动作：**
```
1. 特殊字符输入
   - 输入 %、&、#、<>、单引号等，提交
   - 预期：返回空结果或过滤结果，不报 5xx；实际：报错 → 记录缺陷

2. 全角/半角混合
   - 输入全角数字或字母（如 "１２３"），与半角等效
   - 预期：能匹配到对应记录（若业务应支持）；实际：不匹配 → 记录 P3

3. 超长输入
   - 粘贴 500 字符搜索词
   - 预期：请求正常发出，不崩溃；实际：请求错误或页面卡死 → 记录缺陷

4. 仅空格
   - 搜索框输入若干空格后提交
   - 预期：等价于空搜索，返回全量列表；实际：返回空结果 → 记录 P3

5. 多条件组合（若有多个筛选字段）
   - 同时设置多个筛选条件，检查是否 AND 过滤生效
   - 预期：结果满足全部条件；实际：仅生效最后一个条件 → 记录 P2
```

---

#### E4：操作后跳转与刷新逻辑

**适用条件：** 执行新建、编辑、删除后

**为什么重要：** 操作成功后的导航行为（停留/跳转/刷新列表）直接影响用户工作流连续性；操作失败时表单若被清空，用户需重新输入，是高频体验投诉点。

**测试动作：**
```
1. 新建成功后
   - 观察：是否跳转到详情页？还是返回列表？列表是否自动包含新建记录？
   - 若列表未刷新而停留在旧数据 → 记录 P2

2. 编辑保存成功后
   - 观察：列表对应行数据是否即时更新？还是需要手动刷新？
   - 需手动刷新才能看到新数据 → 记录 P2

3. 删除成功后
   - 观察：被删记录是否从列表消失？总数是否减少 1？
   - 记录消失但总数未变 → 记录 P2（计数逻辑未同步）

4. 提交失败时表单数据保留
   - 故意触发服务端错误（如填入非法格式），提交失败后
   - 预期：表单字段保持用户已填内容，不被清空
   - 实际：表单清空，需重新填写 → 记录 P2
```

---

#### E5：列表排序

**适用条件：** 列表表头存在可点击的列名（带排序图标或可点击样式）

**为什么重要：** 列表排序是最常用的数据浏览手段之一，多次点击时排序方向循环逻辑容易实现错误（如升序→降序后无法回到默认）。

**测试动作：**
```
1. 识别可排序列（通常有 ↑↓ 图标或悬停变为 pointer）
2. 第一次点击该列头 → 预期：升序，图标变为 ↑
3. 第二次点击 → 预期：降序，图标变为 ↓
4. 第三次点击（若支持）→ 预期：恢复默认顺序，图标消失或重置
5. 切换排序后检查：数据是否真正按该字段重新排列（不只是图标变化）
   - 图标变化但数据顺序不变 → 记录 P2（排序纯前端假响应）
```

---

#### E6：导入 / 导出功能

**适用条件：** 页面存在"导出"或"导入"按钮

**为什么重要：** 导出功能易暴露全量数据（无分页限制），是潜在数据泄露点；导入功能的错误处理是最容易被遗漏的测试场景。

**测试动作（导出）：**
```
1. 点击"导出"按钮，等待文件下载
2. 检查：文件格式是否符合预期（xlsx/csv）
3. 检查：导出数据是否与当前列表数据一致（字段数量、内容）
4. 若当前有搜索/过滤条件：导出的是过滤结果还是全量数据？
   - 有过滤条件但导出全量 → 记录 P2（用户意图不一致）
5. 使用无认证会话直接请求导出接口 → 预期：401；返回文件 → P0 漏洞
```

**测试动作（导入）：**
```
1. 上传格式正确但含边界数据（空行、超长字段、重复键）的文件
   - 预期：部分导入成功，报告错误行；实际：全量失败或无错误提示 → 记录缺陷
2. 上传格式错误文件（如将 .jpg 改名为 .xlsx）
   - 预期：格式校验失败，提示错误；实际：500 崩溃 → 记录 P1
3. 上传超大文件（> 10MB）
   - 预期：提示文件过大；实际：请求挂起或服务端超时 → 记录 P2
```

---

#### E7：跨页数据一致性

**适用条件：** 应用有仪表盘、统计面板或汇总卡片，且其数据与当前页面的列表相关联

**为什么重要：** 在当前页面新增/删除记录后，其他页面的统计数据（如"任务总数"、"用户数量"卡片）若未同步更新，用户无法信任这些指标，是常见的 P2 数据问题。

**测试动作：**
```
1. 记录仪表盘/概览页某指标的当前值（如"总任务数：42"）
2. 在当前测试页面新建一条记录，返回仪表盘
3. 检查对应指标是否变为 43
   - 未更新 → 记录 P2（跨页数据未同步）
4. 删除刚才新建的记录，再次检查仪表盘指标是否恢复 42
   - 未恢复 → 记录 P2
```

> **注意**：跨页测试需额外导航，consume 更多 token，若测试 token 预算紧张可降低优先级，仅在发现明显统计异常时执行。

---

## Step 3.5：响应式基础检查（两种模式相同）

验证页面在移动端和宽屏两个极端尺寸下的布局是否正常，快速识别响应式断层问题。

```bash
# 移动端（iPhone 13 尺寸）
playwright-cli resize 375 812
playwright-cli screenshot --filename=ui-375.png

# 宽屏
playwright-cli resize 1920 1080
playwright-cli screenshot --filename=ui-1920.png

# 恢复默认尺寸，继续后续测试
playwright-cli resize 1440 900
```

**截图检查要点：**
- 导航菜单是否正确折叠（移动端应为汉堡菜单或收起状态）
- 表格是否出现横向溢出容器（不允许）或横向滚动条（允许）
- 按钮/输入框是否互相重叠或超出页面宽度
- 移动端文字是否过小（建议最小 12px）

---

## Step 4：安全测试（两种模式相同）

### 阶段一：输入注入（已认证会话）

在文本输入框中注入以下 payload 并提交，每次提交后检查：

```bash
# Payload 1：XSS（script 标签）
<script>alert("XSS")</script>

# Payload 2：XSS（图片事件）
<img src=x onerror=alert(1)>

# Payload 3：SQL 注入
' OR '1'='1
```

```bash
# Payload 4：Mass Assignment（在新建/编辑接口中附加越权字段）
playwright-cli eval "
  fetch('<新建资源接口>', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      name: 'mass_assign_test',
      role: 'admin',
      isAdmin: true,
      status: 'approved'
    })
  }).then(r => r.json()).then(d => JSON.stringify(d))
"
# 预期：响应中 role/isAdmin 字段保持普通用户值，越权字段被忽略
# 实际：响应中 role 变为 admin 或 isAdmin 为 true → 记录 P1 漏洞
```

检查项（XSS/SQL）：
```bash
# 1. 是否触发弹窗（JS 被执行）
playwright-cli console

# 2. 存储后展示时是否做了 HTML 转义
playwright-cli eval "Array.from(document.querySelectorAll('td,li,[role=cell]')).find(el => el.textContent.includes('img src'))?.innerHTML"
# 预期：&lt;img src=x&gt;（文本），而非 <img>（HTML 标签）

# 3. SQL 注入后列表条数是否异常增多
```

通过 `playwright-cli network` 记录上述操作触发的接口路径，供阶段二使用。

### 阶段二：无认证边界 + 越权验证（独立会话）

```bash
# 开启独立无 Cookie 会话
playwright-cli -s=anon open <核心数据接口URL>

# 检查 1：接口是否要求认证
playwright-cli -s=anon snapshot
# 预期：401/403 或跳转登录页；若返回数据则为严重漏洞

# 检查 2：CORS 与安全响应头
playwright-cli -s=anon eval "fetch('<核心数据接口>').then(r => { const h = {}; r.headers.forEach((v,k) => h[k]=v); return JSON.stringify(h); })"
# 关注：access-control-allow-origin 是否为 *
#       是否缺少 X-Content-Type-Options、X-Frame-Options
#       X-Powered-By 是否暴露技术栈

# 检查 3：无认证写操作
playwright-cli -s=anon eval "fetch('<资源接口>/nonexistent-id', {method:'DELETE'}).then(r => r.status)"
# 预期：401；返回 200/204 则为严重漏洞

# 检查 4：IDOR 越权读取（水平越权）
# 使用功能测试阶段已记录的真实资源 ID
playwright-cli -s=anon eval "fetch('<资源接口>/<已知记录ID>').then(r => r.status)"
# 预期：401/403；实际返回 200 + 数据 → P0 越权漏洞

# 检查 5：IDOR 越权写操作
playwright-cli -s=anon eval "fetch('<资源接口>/<已知记录ID>', {method:'PUT', headers:{'Content-Type':'application/json'}, body:'{\"name\":\"idor_test\"}'}).then(r => r.status)"
# 预期：401/403；实际返回 200 → P0 越权写入漏洞

playwright-cli -s=anon close
```

---

## Step 4.5：RBAC 角色权限验证【.env 有第二账号时执行】

若 `.env` 中配置了低权限账号（如 `USERNAME_LIJH` / `PASSWORD_LIJH`），使用独立会话验证权限隔离是否生效。若无第二账号则跳过此步骤，在报告中注明"RBAC 测试未执行（无次要账号）"。

```bash
# 使用低权限账号登录独立会话
playwright-cli -s=lowperm open <APP_URL>
playwright-cli -s=lowperm snapshot
playwright-cli -s=lowperm fill <用户名框ref> "<USERNAME_LIJH>"
playwright-cli -s=lowperm fill <密码框ref> "<PASSWORD_LIJH>"
playwright-cli -s=lowperm click <登录按钮ref>
playwright-cli -s=lowperm goto <目标页面>
playwright-cli -s=lowperm snapshot

# 检查 1：UI 层权限控制
# 对比管理员视图，低权限账号是否缺少管理操作按钮（新建/删除/批量操作等）
# 若管理员专属按钮对低权限用户仍可见 → 记录 P2（UI 权限未隔离）

# 检查 2：API 层垂直越权（核心验证）
playwright-cli -s=lowperm eval "fetch('<管理员专用接口>', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{\"name\":\"rbac_test\"}'}).then(r => r.status)"
# 预期：403 Forbidden；实际返回 200 → P0 垂直越权漏洞

# 检查 3：直接访问高权限页面 URL
playwright-cli -s=lowperm goto <管理员专用页面URL>
playwright-cli -s=lowperm snapshot
# 预期：跳转到无权限提示页或 403 页面；实际：正常显示页面内容 → P0 漏洞

playwright-cli -s=lowperm close
```

---

## Step 5：性能测试（两种模式相同）

### 5.1 Core Web Vitals + 页面加载时序

```bash
playwright-cli run-code "async page => {
  const result = await page.evaluate(() => {
    return new Promise(resolve => {
      let lcp = 0, cls = 0, fcp = 0;
      new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          if (e.entryType === 'largest-contentful-paint') lcp = e.startTime;
        });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => {
        list.getEntries().forEach(e => { if (!e.hadRecentInput) cls += e.value; });
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          if (e.name === 'first-contentful-paint') fcp = e.startTime;
        });
      }).observe({ type: 'paint', buffered: true });
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        resolve({
          FCP: Math.round(fcp),
          LCP: Math.round(lcp),
          CLS: parseFloat(cls.toFixed(4)),
          domInteractive: Math.round(nav.domInteractive),
          load: Math.round(nav.loadEventEnd)
        });
      }, 3000);
    });
  });
  return JSON.stringify(result);
}"
```

### 5.2 核心接口响应时间（三次采样取均值）

```bash
playwright-cli run-code "async page => {
  const times = [];
  for (let i = 0; i < 3; i++) {
    const elapsed = await page.evaluate(async url => {
      const s = Date.now();
      const r = await fetch(url, { cache: 'no-store' });
      await r.json();
      return Date.now() - s;
    }, '<核心数据接口>');
    times.push(elapsed);
    await new Promise(res => setTimeout(res, 500));
  }
  const sorted = [...times].sort((a, b) => a - b);
  return JSON.stringify({
    samples: times,
    avg: Math.round(times.reduce((a, b) => a + b) / 3),
    p90: sorted[2]
  });
}"
```

### 5.3 失败 / 慢请求检查

```bash
playwright-cli network
```

性能基准：

| 指标 | 优秀 | 需关注 | 不可接受 |
|------|------|--------|---------|
| FCP（首次内容渲染） | < 1800ms | > 3000ms | > 5000ms |
| LCP（最大内容渲染） | < 2500ms | > 4000ms | > 6000ms |
| CLS（累积布局偏移） | < 0.1 | > 0.1 | > 0.25 |
| domInteractive | < 500ms | > 1000ms | > 2000ms |
| 页面完全加载 | < 3000ms | > 5000ms | > 8000ms |
| 核心接口均值（3次） | < 500ms | > 2000ms | > 5000ms |

---

## Step 6：关闭浏览器

```bash
playwright-cli close
```

---

## Step 7：写入测试报告

将所有发现写入 `<报告路径>/error.md`。**两种模式使用同一报告结构**，差异仅在第三章和第六章标注处。

```markdown
# <页面名称> 测试报告

## 一、基本信息

| 项目 | 内容 |
|------|------|
| 测试页面 | `<完整 URL>` |
| 测试时间 | <YYYY-MM-DD HH:mm> |
| 测试人员 | Claude Code（自动化测试） |
| 测试模式 | spec（规格验证）/ explore（探索测试） |
| 测试账号 | <用户名>（<角色>） |
| 浏览器环境 | Chromium（playwright-cli） |
| 参考文档 | <文档路径或「无」> |

---

## 二、测试方法

本次测试采用**黑盒测试**方法，分四个维度顺序执行：

### 2.1 功能测试
<!-- spec 模式填写 -->
- **方式**：基于需求文档/接口文档提取测试用例，逐条执行规格验证
- **预期依据**：<文档名称> 中的功能描述与接口契约
- **覆盖点**：<从文档提取的功能点列表>

<!-- explore 模式填写 -->
- **方式**：playwright-cli 单遍扫描，识别元素后内联推断预期行为并立即测试
- **预期依据**：元素语义（标签/placeholder/相邻元素）、通用交互惯例
- **覆盖点**：列表加载、搜索/过滤、分页、新建、编辑、删除、展开详情、UI 三状态

### 2.2 UI 检查
- **响应式**：375px（移动端）和 1920px（宽屏）两个断点截图，人工核查布局
- **三状态**：空状态（搜索无结果）、加载态（刷新截图）、错误态（模拟接口 500）

### 2.3 安全测试
- **输入注入**：已认证会话注入 XSS（script/img）、SQL 注入、Mass Assignment 越权字段
- **无认证边界**：`-s=anon` 独立会话验证接口认证拦截、CORS、IDOR 越权读写
- **角色权限**：`-s=lowperm` 低权限账号验证 UI 层与 API 层权限隔离（有次要账号时执行）

### 2.4 性能测试
- **方式**：Core Web Vitals（FCP/LCP/CLS）+ 页面加载时序；核心接口三次采样取均值
- **基准**：FCP < 1800ms，LCP < 2500ms，CLS < 0.1，核心接口均值 < 500ms

---

## 三、功能清单与测试结果

> ✅ 通过　❌ 失败　⚠️ 部分异常　➖ 不适用

<!-- spec 模式：从文档提取功能点，每行对应一条需求，填写需求编号 -->
<!-- explore 模式：使用下方通用清单，需求来源列填"推断" -->

| # | 功能模块 | 测试项 | 需求来源 | 结果 | 关联缺陷 |
|---|---------|--------|---------|------|---------|
| F01 | 页面加载 | 列表数据正常渲染，计数与条目一致 | <REQ-xx / 推断> | ✅/❌ | - |
| F02 | 搜索 | 关键词搜索结果正确过滤 | <REQ-xx / 推断> | ✅/❌ | - |
| F03 | 搜索 | 清空搜索词后列表恢复全量 | <REQ-xx / 推断> | ✅/❌ | - |
| F04 | 过滤 | 状态/类型等筛选器生效 | <REQ-xx / 推断> | ✅/❌ | - |
| F05 | 分页 | 每页条数切换正常 | <REQ-xx / 推断> | ✅/❌ | - |
| F06 | 新建 | 空提交触发必填项校验提示 | <REQ-xx / 推断> | ✅/❌ | BUG-xxx |
| F07 | 新建 | 合法数据提交成功，列表更新 | <REQ-xx / 推断> | ✅/❌ | BUG-xxx |
| F08 | 编辑 | 表单正确回填现有数据 | <REQ-xx / 推断> | ✅/❌ | - |
| F09 | 编辑 | 修改保存后数据更新 | <REQ-xx / 推断> | ✅/❌ | - |
| F10 | 删除 | 有二次确认对话框 | <REQ-xx / 推断> | ✅/❌ | BUG-xxx |
| F11 | 删除 | 确认后列表条目减少 | <REQ-xx / 推断> | ✅/❌ | - |
| F12 | 详情/展开 | 子数据正确加载 | <REQ-xx / 推断> | ✅/❌ | - |
| F13 | UI-空状态 | 无数据时显示占位组件而非空白 | UI 基线 | ✅/❌ | - |
| F14 | UI-加载态 | 数据加载中有 skeleton/spinner | UI 基线 | ✅/❌ | - |
| F15 | UI-错误态 | 接口 500 时显示错误提示而非白屏 | UI 基线 | ✅/❌ | BUG-xxx |
| U01 | 响应式 | 375px 移动端布局无溢出/重叠 | UI 基线 | ✅/❌ | - |
| U02 | 响应式 | 1920px 宽屏布局正常 | UI 基线 | ✅/❌ | - |
| S01 | 安全 | XSS Payload 未在页面执行 | 安全基线 | ✅/❌ | BUG-xxx |
| S02 | 安全 | SQL 注入未返回异常数据 | 安全基线 | ✅/❌ | - |
| S03 | 安全 | 核心 API 无认证时返回 401 | 安全基线 | ✅/❌ | BUG-xxx |
| S04 | 安全 | CORS 非通配符配置 | 安全基线 | ✅/❌ | BUG-xxx |
| S05 | 安全 | 关键安全响应头完整 | 安全基线 | ✅/❌ | BUG-xxx |
| S06 | 安全 | IDOR 越权访问返回 401/403 | 安全基线 | ✅/❌ | BUG-xxx |
| S07 | 安全 | Mass Assignment 越权字段被忽略 | 安全基线 | ✅/❌ | BUG-xxx |
| R01 | 权限 | 低权限用户 UI 层不可见管理操作 | 权限基线 | ✅/❌/➖ | - |
| R02 | 权限 | 低权限用户 API 层垂直越权返回 403 | 权限基线 | ✅/❌/➖ | BUG-xxx |
| P01 | 性能 | FCP < 1800ms | 性能基线 | ✅/❌ | - |
| P02 | 性能 | LCP < 2500ms | 性能基线 | ✅/❌ | - |
| P03 | 性能 | CLS < 0.1 | 性能基线 | ✅/❌ | - |
| P04 | 性能 | 核心接口均值 < 500ms | 性能基线 | ✅/❌ | - |

**统计：** 通过 X 项 / 失败 X 项 / 不适用 X 项，通过率 XX%

> ⚠️ **explore 模式覆盖说明**：本次测试基于页面元素语义推断预期行为，无需求文档作为标准依据。测试结论反映页面的自洽性和通用质量基线，不代表对业务需求的完整验证。
> ➖ **RBAC 说明**：R01/R02 仅在 .env 配置了第二账号时执行，否则标记为不适用。

---

## 四、性能测试结果

| 指标 | 实测值 | 基准值 | 结论 |
|------|--------|--------|------|
| FCP（首次内容渲染） | Xms | < 1800ms | ✅/❌ |
| LCP（最大内容渲染） | Xms | < 2500ms | ✅/❌ |
| CLS（累积布局偏移） | X | < 0.1 | ✅/❌ |
| DOM Interactive | Xms | < 500ms | ✅/❌ |
| 页面完全加载（Load） | Xms | < 3000ms | ✅/❌ |
| 核心接口均值（3次） | Xms | < 500ms | ✅/❌ |
| 接口采样值（3次） | [X, X, X]ms | - | - |
| 失败网络请求 | X 个 | 0 | ✅/❌ |

---

## 五、缺陷集合

| ID | 严重级别 | 问题类型 | 缺陷描述 | 复现步骤 | 预期结果 | 实际结果 | 发现方式 | 问题的解决方法 |
|----|---------|---------|---------|---------|---------|---------|---------|--------------|
| BUG-001 | P0（致命） | 安全漏洞 | ... | 1. ...<br>2. ... | ... | ... | 无认证会话测试 | ... |

**缺陷统计：**

| 严重级别 | 数量 |
|---------|------|
| P0 致命 | X |
| P1 严重 | X |
| P2 中等 | X |
| P3 轻微 | X |
| **合计** | **X** |

---

## 六、风险评估与建议

**整体风险等级：** 🔴 高风险 / 🟡 中风险 / 🟢 低风险

**评估依据：**
- （说明原因，如存在 P0 安全漏洞则必为高风险）

<!-- spec 模式追加需求符合度 -->
**需求符合度：** XX%（X/X 条需求通过验证）
- 未通过需求：REQ-xxx（关联 BUG-xxx）

**优先修复建议：**
1. 【立即修复】BUG-xxx — <一句话说明原因>
2. 【本迭代修复】BUG-xxx — <一句话说明原因>
3. 【下迭代处理】BUG-xxx — <一句话说明原因>
```

---

## 附录：定义速查

**严重级别**

| 级别 | 说明 |
|-----|-----|
| P0 致命 | 安全漏洞（未授权访问/XSS执行/数据泄露/越权）、核心功能完全不可用 |
| P1 严重 | 主要功能报错（5xx）、Mass Assignment 越权字段被接受、数据丢失风险 |
| P2 中等 | 功能逻辑错误、UI 三状态缺失、响应式布局断裂、数据异常、性能超标 |
| P3 轻微 | UI 细节问题、安全头缺失、技术栈暴露、体验问题 |

**问题类型：** `功能缺陷` / `性能问题` / `安全漏洞` / `UI问题` / `数据问题` / `权限问题`

---

## 附录：执行注意事项

1. **数据还原**：写操作使用测试数据并在完成后清理；XSS payload 保存成功后必须立即恢复原始值
2. **发现即记录**：每发现一个问题立即追加到报告第五章，不要等到最后统一整理
3. **截图备份**：关键异常状态用 `playwright-cli screenshot --filename=<描述性名称>.png` 存档；Step 3.5 的响应式截图统一命名 `ui-375.png` / `ui-1920.png`
4. **API 路径识别**：执行写操作前通过 `playwright-cli network` 记录接口路径，同时记录一条真实资源 ID，供 Step 4 阶段二 IDOR 检查使用
5. **单遍原则（explore 模式）**：功能测试阶段不重复 snapshot 整页，从当前快照中读取元素后直接操作
6. **RBAC 跳过处理**：若 `.env` 无第二账号，Step 4.5 跳过，报告 R01/R02 标记为 ➖ 不适用
