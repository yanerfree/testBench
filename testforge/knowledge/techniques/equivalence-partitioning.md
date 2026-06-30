# 等价类划分（Equivalence Partitioning）

## 原理

将输入数据划分为若干等价类，每类中任取一个值测试效果等价。一个有效等价类 + 每个无效等价类各一个用例。

## 适用场景

- 输入字段有明确的有效/无效范围
- 枚举类型字段（如 connectType: ASHOST / MSHOST）
- 字符串类型字段有格式要求（如 IP 地址、邮箱）
- 数值字段有取值范围

## 应用步骤

1. 识别所有输入参数
2. 对每个参数划分等价类：
   - **有效等价类**：合法输入（如 connectType = "ASHOST"）
   - **无效等价类**：非法输入（如 connectType = "INVALID"、空串、null、超长字符串）
3. 组合：一条用例覆盖尽量多的有效等价类，无效等价类每条只包含一个无效值（其余参数取有效值）

## 示例

字段 `connectType`，枚举 ["ASHOST", "MSHOST"]：
- 有效类1：connectType = "ASHOST"
- 有效类2：connectType = "MSHOST"
- 无效类1：connectType = "" （空串）
- 无效类2：connectType = "INVALID_TYPE"
- 无效类3：connectType = null
- 无效类4：connectType = 123（类型错误）

## 常见陷阱

- 只测有效值不测无效值
- 忽略 null 和空串作为独立的无效等价类
- 枚举字段忘记测试不在枚举范围内的值
- 组合无效等价类时一次包含多个无效值，导致无法定位哪个触发了错误
