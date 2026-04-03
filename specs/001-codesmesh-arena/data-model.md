# Data Model: CodeSmesh（BYOK）+ 可选排行榜 API

> 主流程数据在**客户端**聚合；下列实体用于 TypeScript 类型、本地状态与（可选）上报载荷设计。

## 1. UserConfiguredModel（用户配置的模型）

浏览器侧配置，用于直连供应商。**不包含**服务端密钥映射。

| 字段 | 类型 | 说明 |
|------|------|------|
| `client_id` | string | 客户端生成的稳定 id（UUID），用于 UI key |
| `display_label` | string | 用户备注或预设名 |
| `provider_kind` | enum | 如 `openai_compatible` \| `anthropic` \| `custom`（实现期收窄） |
| `base_url` | string | API 基址（须兼容浏览器 CORS 或经文档说明） |
| `model_id` | string | 供应商模型标识 |
| `api_key` | string | **敏感**；默认仅存内存，不落日志与 URL |
| `extra_headers` | object? | 可选扩展头（不含日志持久化） |

**验证**: `base_url`、`model_id` 非空；`api_key` 非空方可发起请求。

---

## 2. Problem（题目）

与规格一致；首版可来自前端静态 JSON。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | |
| `title` | string | |
| `description_md` | string | 题干与约束 |
| `difficulty` | enum? | easy / medium / hard |
| `tags` | string[]? | |
| `entry` | object | 沙箱入口约定：`exportName`、`signature` 或 harness 模板 id |
| `created_at` | string (ISO-8601)? | |
| `updated_at` | string (ISO-8601)? | |

---

## 3. TestCase（系统测试用例）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | |
| `problem_id` | string | |
| `name` | string? | |
| `input` | string (JSON) | |
| `expected` | string (JSON) | |
| `enabled` | boolean | |
| `source` | enum | `manual` \| `generated` |

---

## 4. ClientArenaRun（一次「多模型 × 一题」客户端运行）

对应一次用户点击「开始」后的编排容器；**不**依赖服务端会话 id（除非后续加同步）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `run_id` | string | 客户端生成 |
| `problem_id` | string | |
| `model_client_ids` | string[] | 参与本轮的 `UserConfiguredModel.client_id` |
| `status` | enum | `idle` \| `running` \| `partial_success` \| `success` \| `failed` |
| `started_at` | string (ISO-8601) | |
| `updated_at` | string (ISO-8601) | |
| `sides` | Record<string, ArenaSideResult> | key 为 `client_id` |

### ArenaSideResult（单侧模型结果）

| 字段 | 类型 | 说明 |
|------|------|------|
| `phase` | enum | `idle` \| `thinking` \| `coding` \| `self_testing` \| `evaluating` \| `done` \| `error` |
| `reasoning_text` | string? | 思路 |
| `code` | string? | 提取后的可执行主体 |
| `self_tests_json` | string? | 自测用例机读形式 |
| `self_review_text` | string? | 自我审查 |
| `self_pass_rate` | number? | 0–1 |
| `system_pass_rate` | number? | 0–1 |
| `system_runs` | TestRun[] | 官方用例逐条结果 |
| `self_runs` | TestRun[] | 自测逐条结果 |
| `blind_spot_index` | number? | 见 research.md |
| `metric_rules_version` | string | 如 `2026.04.0` |
| `duration_ms_total` | number? | |
| `error_code` | string? | |
| `error_message_public` | string? | 对用户安全文案 |

### TestRun

| 字段 | 类型 | 说明 |
|------|------|------|
| `case_id` | string? | |
| `passed` | boolean | |
| `actual` | string? | |
| `error` | string? | 脱敏 |

---

## 5. LeaderboardSubmission（可选上报载荷）

**不含** API Key、不含可识别个人信息；仅聚合指标。服务端校验速率与 schema。

| 字段 | 类型 | 说明 |
|------|------|------|
| `problem_id` | string | |
| `model_fingerprint` | string | 对 `provider_kind` + `model_id` + `base_url` host 等的**单向哈希**，非明文 Key |
| `system_pass_rate` | number | |
| `self_pass_rate` | number? | |
| `blind_spot_index` | number? | |
| `duration_ms` | number? | |
| `metric_rules_version` | string | |
| `submitted_at` | string (ISO-8601) | 客户端时钟，服务端可覆盖 |

---

## 6. LeaderboardEntry（排行榜展示）

| 字段 | 类型 | 说明 |
|------|------|------|
| `model_fingerprint` | string | 与上报一致 |
| `problem_id` | string? | null 表全局 |
| `sample_count` | number | |
| `avg_system_pass_rate` | number | |
| `avg_blind_spot` | number? | |
| `updated_at` | string (ISO-8601) | |

---

## 7. 与历史「平台模型 / 服务端会话」的关系

`spec.md` 中的 **PlatformModel**、**ArenaSession**（服务端代调）在 **BYOK CodeSmesh** 中由 **UserConfiguredModel** 与 **ClientArenaRun** 替代。若未来同时支持两种模式，可在 API 层再引入服务端会话实体并分支 UI。
