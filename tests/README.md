# testBench 测试

## 环境准备

```bash
# 在项目根目录执行
cd testBench
pip install -e "backend/.[dev]"
```

确保 PostgreSQL 测试数据库可用：
```bash
createdb testbench_test
```

## 运行测试

```bash
# 在项目根目录执行（不是 backend/ 下）

# 全部测试
make test

# 带覆盖率
make test-cov

# 按级别运行
make test-unit           # 单元测试
make test-integration    # 集成测试
make test-api            # API 接口测试
make test-e2e            # E2E 端到端测试
```

## 目录结构

```
testBench/
├── tests/                          # 项目根目录下（不在 backend/ 内）
│   ├── conftest.py                 # 全局 fixtures（db_session, client）
│   ├── factories.py                # 数据工厂（make_user, make_project）
│   ├── unit/{module}/              # 单元测试：纯函数逻辑，无 I/O
│   ├── integration/{module}/       # 集成测试：数据库交互验证
│   ├── api/{module}/               # API 测试：HTTP 接口请求/响应
│   └── e2e/{module}/               # E2E 测试：完整业务流程
├── tea-cases.json                  # TEA 生成的用例清单
├── pyproject.toml                  # pytest + coverage 配置
└── Makefile                        # 测试命令
```

## 四个测试级别

| 级别 | 测什么 | 外部依赖 | 速度 |
|------|--------|---------|------|
| unit | 单个函数/类的内部逻辑 | 无，全部 mock | 毫秒级 |
| integration | 组件间交互（DB 读写等） | 真实数据库 | 百毫秒级 |
| api | 单个 API 端点请求/响应 | FastAPI + 测试库 | 百毫秒级 |
| e2e | 完整用户业务流程 | 完整运行环境 | 秒级 |

## Fixtures

| Fixture | Scope | 说明 |
|---------|-------|------|
| `db_engine` | session | 创建/销毁测试数据库表 |
| `db_session` | function | 每个测试独立事务，自动回滚 |
| `client` | function | httpx.AsyncClient，绑定 FastAPI app |

## 数据工厂

```python
from tests.factories import make_user, make_project

user = make_user()
admin = make_user(username="admin", role="admin")
project = make_project(name="my-project")
```

## 命名规范

- 文件名：`test_{slug}.py`（一场景一文件）
- 类名：`Test{PascalCaseScenario}`
- 方法名：`test_{specific_behavior}`
- tea_id：`{module}_{slug}`
