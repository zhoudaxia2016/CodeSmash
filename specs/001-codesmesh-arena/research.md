# Research: CodeSmesh 实现方案

## 1. 浏览器沙箱：`@sebastianwessel/quickjs` v3.0.1

**Decision**: 采用 **`@sebastianwessel/quickjs` 3.0.1** 在浏览器中实例化 QuickJS Wasm，执行从模型输出中解析出的用户代码；与题目约定的入口（如默认导出 / 命名函数）由前端 harness 注入。

**Rationale**: 与宪章 G2 一致（QuickJS Wasm）；npm 包封装 Wasm 加载与生命周期。

**Alternatives considered**: 上游 `quickjs-emscripten` 自集成；`new Function`（违宪，排除）。

**Implementation notes**: Vite 需正确处理 wasm 静态资源路径；主线程执行配合 **5s** 超时（终止 QuickJS 实例，API 细节以实现时包文档为准）。

---

## 2. 可选后端持久化：SQLite 与 Deno Deploy

**Decision**:

- **用户指定**：排行榜场景使用 **Deno + Hono + SQLite**。
- **Deploy 现实**：Deno Deploy **无**可长期依赖的本地 SQLite 文件。生产可选：**Deno KV**、**Turso / libSQL**（托管 SQLite 协议）、或自建 VPS/Docker 上真 SQLite。
- **本地开发**：`server/` 使用文件 SQLite 或 `:memory:` 即可。

**Rationale**: 满足「SQLite」心智模型与 SQL 查询需求，同时不把不可部署假设写进生产路径。

**Alternatives considered**: 纯内存排行榜（重启丢数据，仅 demo）；外接 PostgreSQL。

---

## 3. 调用拓扑：BYOK + 前端直连（本计划采纳）

**Decision**: 模型 API 由**浏览器**使用**用户提供的 Key** 调用；**Zustand** 管理多模型配置（base URL、model id、密钥等 UI 状态）；**TanStack Query** 负责请求缓存、重试与并行/串行策略。

**Rationale**: 与 `/speckit.plan` 输入一致；平台侧无供应商密钥成本与代调限流实现负担（代价见下）。

**与 `spec.md` 冲突**: 当前规格首版要求平台代调、Key 不落浏览器（FR-007/FR-008）。**须**后续修订 `spec.md` 或将 **CodeSmesh（BYOK）** 列为独立验收线，避免需求文档与实现互相矛盾。

**Security / 产品注意**:

- Key 默认 **仅内存**；若持久化，须用户知情同意并尽量使用浏览器安全存储能力（实现期定）。
- **SC-004**（公开界面不出现完整 Key）仍适用：UI 与日志须脱敏。

**CORS**: 部分供应商 REST API **不允许浏览器直连**。缓解：文档列出「OpenAI 兼容 + CORS」端点；或后续增加**仅转发**的微型 BFF（不存 Key，仅破 CORS）— 属新变更单。

---

## 4. 三阶段 LLM 编排（思路 → 代码 → 自测与自我审查）

**Decision**: 三步在**前端**顺序触发（每步独立请求或同一 chat 上下文由客户端拼装）；解析失败时降级展示原文并标记阶段。TanStack Query 可用 `useMutation` 链式或 `useQueries` 并行多模型。

**Rationale**: 无服务端编排时仍保持产品与宪章 G3 要求的结构化产出。

**Alternatives considered**: 单条 mega-prompt（解析脆弱）；服务端代调（与本次方案冲突但可服务旧规格）。

---

## 5. 「盲点指数」等派生指标（初版定义）

**Decision**（可版本化，`metric_rules_version`）：

- **系统测试通过率** `P_sys`、**自测通过率** `P_self`（不可解析则 `null` + UI 说明）。
- **盲点指数（初版）**: `blind_spot = clamp01(P_self - P_sys)`；`P_self` 缺失时显示「不可算」；自测数量为 0 标 **自测缺失**。
- 可叠加自测条数、与官方结果一致性等作为 FR-006「自测完善性」的补充展示。

**Rationale**: 满足宪章 G3 必选对比维度；公式简单可解释。

---

## 6. 前端状态与数据获取分工

**Decision**: **Zustand** — 当前题目、多模型配置、向导步骤、最近一次各侧结果草稿；**TanStack Query** — 静态题目/用例 JSON（或未来只读 API）、LLM 请求、可选排行榜只读查询。

**Rationale**: 与用户方案一致；服务端状态面缩小后，缓存边界更清晰。

---

## 7. 样式与主题

**Decision**: Tailwind CSS；**深色主题**为默认（`dark` class 策略或 `prefers-color-scheme`，在 `tailwind.config` 固定一种以免双实现）。

---

## 8. GitHub Pages 与 Vite

**Decision**: **GitHub Actions** 构建 `web` 并部署到 `gh-pages`；project site 配置 Vite `base` 为 `/仓库名/`；`VITE_*` 仅用于可选 API 基址等**非密钥**配置。

**Rationale**: 与 CON-002 及用户部署方式一致；密钥不进静态构建参数。

---

## 9. 依赖核验（实现前）

首次安装后确认 npm 上 **`@sebastianwessel/quickjs@3.0.1`** 可用；若不可用或存在 breaking change，允许 **PATCH 同级** 升级并更新本文件 Decision 行。
