# 计划：LLM 调用日志入库（第一期）

## 目标

- **第一期**：把**每一次**走上游 `chat/completions` 的调用（含 **对战里的 analysis/code**、**llm-try**、以及**日后「用大模型生成测试用例」等**）统一写入同一张表；**业务侧只保留两类字段**：`source`（调用类型）、`source_id`（可选的父实体 id）；其余均为**大模型调用相关**字段。
- **不做**：用户表、对战持久化、题库主数据迁移等（后续再扩展同库新表）。

**说明**：一场 battle 里 A/B 各模型、各阶段各是一次独立请求，**多行**日志；每行对应**一次** HTTP 调用。`model` 为**本次请求**里发给厂商的 `model` 字符串。

## 存储策略

| 环境 | 方式 |
|------|------|
| 本地开发 | `LIBSQL_URL=file:./data/codesmesh.db`（路径可配置），单文件 SQLite。 |
| Deno Deploy / 生产 | `LIBSQL_URL` + `LIBSQL_AUTH_TOKEN` 指向 **Turso**（或兼容 libSQL 的远程端点）。 |

- 使用 **`npm:@libsql/client`**（或 Turso 文档推荐的 serverless/compat 包），**同一套 SQL**，仅连接串不同。
- `deno task dev` 需 **`--allow-read` `--allow-write`（file: 时）**、`--allow-net`（远程时）、`--allow-env`。

## Schema

### 业务字段（仅 2 个）

| 列名 | 类型 | 说明 |
|------|------|------|
| `source` | `TEXT` | `NOT NULL`，**调用类型**（原 `call_kind` 语义），见下方枚举。 |
| `source_id` | `TEXT` | **可选**，父实体 id 的**不透明字符串**。例：对战场景填 **battle UUID**（持久化对战表落地前可一直为 `NULL`）；`test_case_generate` 填 **题目 id**；无父实体则 `NULL`。不在表内再拆 `battle_id` / `problem_id` / `side` 等列。 |

### 大模型相关字段

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | `TEXT` | `PRIMARY KEY`，UUID v4。 |
| `created_at` | `TEXT` | `NOT NULL`，UTC ISO8601，**发起本次上游请求的时刻**（例如即将 `fetch` 或已组好 body 时打点，实现时与 `duration_ms` 起点一致即可）。 |
| `completed_at` | `TEXT` | `NOT NULL`，UTC ISO8601，**返回结束时刻**：流式读完最后一块或失败进入 `catch` 的时刻（即用户所说的「返回时间」）。 |
| `provider` | `TEXT` | `NOT NULL`，`minimax` \| `deepseek`。 |
| `model` | `TEXT` | `NOT NULL`，**本次**请求体里发给上游的 `model`（如 `deepseek-chat`；与真实 HTTP 一致，**不**再单独存产品侧 `deepseek-v3`）。 |
| `messages` | `TEXT` | `NOT NULL`，与上游 `messages` 同义：`ChatMessage[]` 经 `JSON.stringify` 后的**截断快照**（列类型仍是 `TEXT`）；细节见下节。可选在解析后的结构上加 `"_truncated": true` 标明截断。 |
| `output_text` | `TEXT` | **大模型输出内容**：成功时为流式结果拼接后再按策略截断写入；失败为 `NULL`。 |
| `error` | `TEXT` | 失败信息；成功为 `NULL`。 |
| `duration_ms` | `INTEGER` | `NOT NULL`，**耗时**：与 `created_at` → `completed_at` 区间一致（发起上游请求至流结束或失败点的毫秒数；实现可用时间差计算，避免与两列矛盾）。 |

不再使用：`platform_model_id`、`upstream_model`（合并为 `model`）；历史上曾写的 `messages_json` + `messages_truncated`、以及 `prompt_json` 等命名——本期统一为单列 **`messages`（TEXT 内为 JSON 串）** 存截断快照；`prompt_chars` / `response_chars`（需要时由查询端对 `messages` / `output_text` 求长即可）。

### 为何列名叫 `messages`、类型仍是 TEXT

- 与 OpenAI 式 **`messages` 数组**同名，语义即「本次请求里的对话消息列表」；库内用 **JSON 字符串** 保存，与 `JSON.stringify(messages)` 一致。
- 调试时要还原 `system` / `user` 等 **role 边界**，不能只合并成一段纯文本；**不是** SQLite 的 `JSON` 类型扩展依赖。
- 若将来只关心可读长文，可另加 `prompt_text` 或改写入逻辑；当前默认 **JSON 快照** 入 `messages`。

**`source` 取值枚举（可扩展）**

| 值 | 说明 |
|----|------|
| `battle_analysis` | 对战 · 分析阶段 |
| `battle_code` | 对战 · 写代码阶段 |
| `llm_try_analysis` | `/api/llm-try/analysis` |
| `llm_try_code` | `/api/llm-try/code` |
| `test_case_generate` | 大模型生成/补全官方测例 |
| `other` | 其它（实现时在代码注释或后续文档中说明） |

调用方显式传入 `source` / `source_id`，**不**依赖解析 `log_label` 入库。

**索引**

```sql
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_created_at
  ON llm_call_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_source
  ON llm_call_logs (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_source_id
  ON llm_call_logs (source_id)
  WHERE source_id IS NOT NULL;
```

**建表 SQL（迁移 v1）**

```sql
CREATE TABLE IF NOT EXISTS llm_call_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  messages TEXT NOT NULL,
  output_text TEXT,
  error TEXT,
  duration_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_call_logs_created_at
  ON llm_call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_source
  ON llm_call_logs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_call_logs_source_id
  ON llm_call_logs (source_id) WHERE source_id IS NOT NULL;
```

**长度策略（入库前截断）**

- 对 **`messages`** 列：在序列化请求体里的 `messages` 后按总字节/字符上限截断（或逐条 `content` 截断），**只写入截断后的 JSON 字符串**。  
- 对 **`output_text`**：对流式拼接结果同样按上限截断再写入。  
- 环境变量示例：`LLM_LOG_DB_MAX_MESSAGES_CHARS`（或沿用 `LLM_LOG_DB_MAX_PROMPT_CHARS` 表示「入参 messages 序列化上限」）、`LLM_LOG_DB_MAX_OUTPUT_CHARS`（实现时命名以代码为准）。  
- 可选：截断后在 JSON 结构内增加 `"_truncated": true` 便于后台识别（若不想改结构，也可省略）。

## 写入点

- **统一收口**：[`server/src/lib/llm.ts`](../../server/src/lib/llm.ts) 的 **`streamChat`**（或薄封装）在每次请求结束写一行；调用方必须传入 **`source`**、可选 **`source_id`**。  
- 写库时组装：**`model`** = 本次 `fetch` body 里的 `model`；**`messages`** = 实际参与请求的 `messages` 经截断规则后的 JSON 字符串；**`output_text`** = 流式拼接结果经截断后写入；**`created_at`** / **`completed_at`** = 请求开始与流结束（或失败）的 UTC 时间。  
- 在流式循环内累加输出；在 **成功结束** 或 **catch** 后调用 `insertLlmCallLog`。  
- **异步、不阻塞**：`void insert...catch(console.error)` 或 `queueMicrotask`。  
- **禁止**写入 API Key。
- 控制台 `log_label` 可保留便于 tail 日志，**不必**写入本表。

**各入口与 `source` / `source_id` 建议**

| 入口 | `source` | `source_id` |
|------|----------|-------------|
| `battles` · analysis / code | `battle_analysis` / `battle_code` | 有则填 battle UUID，暂无则 `NULL` |
| `llm-try` · analysis / code | `llm_try_analysis` / `llm_try_code` | 通常 `NULL`（或填 `problemId` 若调用方愿意） |
| 题目测例生成 | `test_case_generate` | **题目 id** |

## 查看数据（第一期）

- **本地**：`LIBSQL_URL=file:...` 时直接打开对应 **`.db` 文件**（如 DB Browser for SQLite、VS Code 扩展、`sqlite3` CLI）查表 `llm_call_logs` 即可。  
- **远程（Turso 等）**：用平台控制台 / `turso db shell` 等对同库执行 `SELECT`。  
- **本期不实现** HTTP 管理查询接口，也不增加 `ADMIN_API_TOKEN`。

## 环境变量（`.env.example`）

- `LIBSQL_URL` — 本地 `file:./data/codesmesh.db` 或 Turso URL。  
- `LIBSQL_AUTH_TOKEN` — 远程必填。  
- `LLM_DB_LOG` — `1` / `true` 启用写入（默认关或开，实现时二选一并文档说明）。  
- `LLM_LOG_DB_MAX_PROMPT_CHARS` / `LLM_LOG_DB_MAX_OUTPUT_CHARS`（或等价命名）— 控制入库截断，可选。

## 实现顺序（todo）

1. `deno.json` 增加 `@libsql/client`，`db/client.ts` + `db/schema.ts`（执行上述 `CREATE`）。  
2. `db/llmCallLog.ts`：`insertLlmCallLog`（列表查询待后台再做时可补 `listLlmCallLogs`）。  
3. 扩展 `streamChat`（或封装）签名：增加必填 `source`、可选 `sourceId`；内部写库。  
3b. **test-cases/generate** 调 LLM 时：`source=test_case_generate`，`source_id=<problemId>`。  
4. `main.ts` 启动 `initDb()`（**不**注册管理类 HTTP 路由）。  
5. 更新 `server/.env.example` 与本文档互链。

## 后续扩展（非本期）

- **后台界面**：分页、筛选、展示 `messages` / `output_text`；实现时可配套 `GET /api/admin/llm-logs`（或 BFF）、`Authorization: Bearer <ADMIN_API_TOKEN>`（未配置则不注册路由或 404）。  
- `battles`、`users` 等同库新表；需要时可将 `source_id` 与 `battles.id` 做 FK 或约定一致（当前不设外键亦可）。  
- 迁移工具（版本化 `migrations/`）。
