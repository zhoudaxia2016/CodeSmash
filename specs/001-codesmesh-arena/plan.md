# Implementation Plan: CodeSmesh

**Branch**: `001-codesmesh-arena` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)

**Input**: 功能规格见 `spec.md`；本计划技术栈与调用拓扑以 `/speckit.plan` 用户输入为准。

**Note**: 本文件由 `/speckit.plan` 生成；模板见 `.specify/templates/plan-template.md`。

## Summary

CodeSmesh 在**浏览器内**完成核心闭环：用户选择题与多个模型配置（**用户自持 API Key**），前端以 **Zustand** 持有模型与 UI 状态，**TanStack Query** 编排对供应商的 HTTP 调用；按三步提示依次（或可配置并行）完成 **解题思路 → 可运行代码 → 自测用例与自我审查**；从响应中抽取代码，在 **`@sebastianwessel/quickjs` v3.0.1** Wasm 沙箱中运行**系统预设用例**与**模型自测用例**（单次执行硬超时 5s，与 CON-001 一致）；计算并并列展示 **系统通过率、自测通过率、盲点指数** 等派生指标。样式为 **Tailwind CSS**，默认 **深色主题**。

静态前端经 **GitHub Actions** 构建并部署到 **GitHub Pages**。若启用公共排行榜，可选 **`server/`**：**Deno + Hono**，持久化采用 **SQLite**（本地/自托管）；**Deno Deploy** 生产环境无本地文件系统时，采用 **Deno KV** 或 **托管 libSQL/Turso** 等等价持久化（见 `research.md`）。

**与当前 `spec.md` 的差异**：规格首版强调**平台代调**、密钥仅服务端、用户不提交 Key（FR-007/FR-008）。本方案为 **BYOK + 前端直连供应商**，与上述条款**不一致**。须在里程碑合并前**修订规格**或单列「CodeSmesh（BYOK）」验收范围（见 **Complexity Tracking**）。

## Technical Context

**Language/Version**: TypeScript 5.x（前端）；Deno 2.x + TypeScript（可选 API）  
**Primary Dependencies**: React 18、Vite、Zustand、Tailwind CSS、`@sebastianwessel/quickjs` 3.0.1；可选 Hono（Deno）  
**Storage**: 题目与官方用例可随前端静态资源版本化；后端 KV 存排行榜聚合；用户 Key **默认仅存会话内存**，若提供「记住配置」须明示风险并本地加密或 OS 密钥链（实现期定）  
**Target Platform**: 支持 Wasm 的现代浏览器；可选 Deno Deploy（排行榜 API）  
**Project Type**: Web SPA + 可选边缘/自建 API  
**Performance Goals**: QuickJS 单次执行 ≤5s 硬超时；多模型调用支持串行或受控并行以降低 429 风险  
**Constraints**: **禁止** `eval` / `new Function` 执行模型代码；部分供应商 API **无浏览器 CORS**，需文档说明兼容端点或后续微型 BFF（另立变更）  
**Scale/Scope**: MVP 以静态托管为主；排行榜为可选增强

## Constitution Check

*GATE: Phase 0 前须完成；Phase 1 设计后复核。*

对照 `.specify/memory/constitution.md`（模型编程能力测试系统）：

| Gate | 要求（摘要） | 本计划状态 |
|------|----------------|------------|
| G1 客观评测 | 自动测试通过/失败为权威 | **Pass** — 系统用例 + 可执行自测 |
| G2 沙箱执行 | 浏览器 QuickJS Wasm；禁 eval/new Function | **Pass** — `@sebastianwessel/quickjs` |
| G3 可解释性 | 思路 + 自测；自测 vs 系统为必选维度 | **Pass** — 三阶段提示 + 双通过率与盲点指数 |
| G4 多模型对比 | 同题多模型并列 | **Pass** — 多列 UI 与对齐的数据模型 |
| G5 技术栈 | React+TS+Vite+Tailwind；可选 Deno+Hono；Pages + Deploy | **Pass** |

*Phase 1 后复核结论：与 Phase 0 一致；若新增非 Wasm 执行路径须重新评估 G2。*

*若任一项为 Exception，在 **Complexity Tracking** 中写明理由与批准路径。*

## Project Structure

### Documentation (this feature)

```text
specs/001-codesmesh-arena/
├── plan.md              # 本文件
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   └── openapi.yaml
└── tasks.md             # /speckit.tasks（非本命令产出）
```

### Source Code (repository root)

```text
web/
├── src/
│   ├── components/
│   ├── pages/
│   ├── lib/
│   │   ├── quickjs/       # Wasm 运行时封装、5s 超时、终止
│   │   ├── llm/           # 三步提示模板、按模型配置请求
│   │   ├── harness/       # 注入用户代码、跑官方/自测用例
│   │   └── metrics/       # 通过率、盲点指数等
│   ├── stores/            # Zustand：题目、多模型配置、运行状态
│   └── queries/           # TanStack Query：题目/用例加载、LLM mutations
├── public/
└── tests/

server/                        # 可选：公共排行榜
├── src/
│   ├── main.ts
│   ├── routes/
│   │   └── leaderboard.ts
│   └── db/                 # SQLite（本地）或 libSQL 客户端（生产）
├── deno.json
└── .env.example
```

**Structure Decision**: 核心交付为 `web/`；仅当需要跨用户聚合展示时引入 `server/`。

## Complexity Tracking

> 与宪章无冲突项；下列为 **规格 / 平台** 层需跟踪的差异。

| Violation / Delta | Why Needed | Simpler Alternative Rejected Because |
|-------------------|------------|-------------------------------------|
| 与 `spec.md` FR-007/FR-008/FR-003：BYOK + 浏览器发供应商请求 | 用户在本计划中明确指定的 **BYOK + 前端直连** 技术方案 | 平台代调可保留为另一产品形态或后续里程碑，但不可假装与本方案一致；须修订规格或拆分验收 |
| 用户 Key 在客户端 | 直连供应商的必要条件 | 服务端代调可满足旧规格，但与本次输入冲突 |
| 「SQLite on Deno Deploy」 | 用户点名技术组合 | Deploy 无持久本地文件；生产须 KV/libSQL 等（见 research），SQLite 作为本地与自托管等价物 |

## Phase 0 & Phase 1 产出登记

| 产出 | 路径 | 状态 |
|------|------|------|
| 研究决策 | [research.md](./research.md) | 已按本计划更新 |
| 数据模型 | [data-model.md](./data-model.md) | 已按 BYOK + 可选 API 更新 |
| 契约 | [contracts/openapi.yaml](./contracts/openapi.yaml) | 已收敛为可选排行榜 API |
| 快速开始 | [quickstart.md](./quickstart.md) | 已更新 |

Agent 上下文：已执行 `.specify/scripts/powershell/update-agent-context.ps1 -AgentType cursor-agent`。
