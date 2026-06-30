# 输入校验测试模式（Validation Patterns）

## 必填校验

| 场景 | 输入 | 预期 |
|------|------|------|
| 字段缺失 | 不传该字段 | 400 + 提示必填 |
| 字段为 null | `"field": null` | 400 + 提示必填 |
| 字段为空串 | `"field": ""` | 400 + 提示必填（通常） |
| 字段为空格 | `"field": "   "` | 400（trim 后为空） |

## 类型校验

| 场景 | 输入 | 预期 |
|------|------|------|
| 期望 string 传 number | `"name": 123` | 400 |
| 期望 number 传 string | `"port": "abc"` | 400 |
| 期望 boolean 传 string | `"enabled": "yes"` | 400 |
| 期望 array 传 object | `"items": {}` | 400 |
| 期望 object 传 string | `"config": "text"` | 400 |

## 长度校验

| 场景 | 输入 | 预期 |
|------|------|------|
| 恰好最大长度 | 50 个字符 | 通过 |
| 超过最大长度 1 位 | 51 个字符 | 400 |
| 最小长度 | 1 个字符（如要求 min=1） | 通过 |
| 低于最小长度 | 0 个字符 | 400 |

## 格式/正则校验

| 场景 | 输入 | 预期 |
|------|------|------|
| 纯数字字段传字母 | clientNumber = "abc" | 400 |
| 纯数字字段传混合 | clientNumber = "12ab" | 400 |
| IP 地址格式错误 | systemHost = "999.999.999.999" | 400 |
| IP 地址格式正确 | systemHost = "192.168.1.1" | 通过 |
| 邮箱格式错误 | email = "not-email" | 400 |
| URL 格式错误 | url = "httt://bad" | 400 |

## 枚举校验

| 场景 | 输入 | 预期 |
|------|------|------|
| 有效枚举值 | languageCode = "ZH" | 通过 |
| 无效枚举值 | languageCode = "FR" | 400 |
| 大小写敏感 | languageCode = "zh" | 视实现而定 |
| 空串 | languageCode = "" | 400 |

## 范围校验

| 场景 | 输入 | 预期 |
|------|------|------|
| 范围内 | codePage = 4110 | 通过 |
| 下界 | codePage = 0 | 通过 |
| 上界 | codePage = 999999 | 通过 |
| 低于下界 | codePage = -1 | 400 |
| 超过上界 | codePage = 1000000 | 400 |
| 小数 | codePage = 3.14 | 400（如要求整数） |

## 组合校验

- 字段 A 的值决定字段 B 是否必填（如 connectType=MSHOST 时 systemName 必填）
- 两个字段之间有大小关系（如 startDate < endDate）
- 互斥字段（传了 A 就不能传 B）
