<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles: III. 可解释性 — 「自测 vs 系统测试」对比由 SHOULD 提升为 MUST（与用户「作为评估维度」一致）
- Added sections: None
- Removed sections: None
- Templates: plan-template.md ✅ (G3) | spec-template.md ✅ (可解释性) | tasks-template.md ✅ (T011) | .specify/templates/commands ⚠ N/A (path absent)
- Follow-up TODOs: None
- Session: /speckit.constitution — 五项核心原则与正文对照校验通过
-->

# 模型编程能力测试系统 Constitution

## Core Principles

### I. 客观评测优先（Objective Evaluation First）

- 系统的核心价值是**自动运行官方/系统测试用例**，以通过/失败客观度量模型生成代码的正确性。
- **禁止**以主观投票、纯人工打分或 popularity 作为主要或唯一评测依据来**替代或覆盖**客观测试结果。
- 任何面向用户的“能力结论” MUST 能追溯到可复现的测试运行记录与断言结果。

**Rationale**：只有自动化、可重复的测试才能保证跨模型、跨时间的公平对比。

### II. 安全沙箱执行（Sandboxed Execution, NON-NEGOTIABLE）

- 模型生成的 JavaScript/TypeScript **必须**仅在浏览器端经批准的隔离环境中执行（例如 **QuickJS Wasm** 或经治理流程批准的同等 Wasm/沙箱方案）。
- **严禁**使用 `eval`、`new Function`，或在未隔离的宿主 `vm` 中执行不可信模型代码。
- 若需扩展执行引擎，MUST 经宪章修订或书面技术例外说明，并保留安全评审记录。

**Rationale**：不可信代码必须在能力边界明确的沙箱内运行，以保护用户与宿主环境。

### III. 可解释性（Explainability）

- 模型输出 **必须**包含规定结构字段：**解题思路**与**自测用例**（及可机读格式，便于存储与展示）。
- 评测 **必须**同时记录**自测通过率**与**系统（含隐藏）测试通过率**，并支持对比分析（例如差距、一致性指标）。
- “自测 vs 系统测试”差异 **必须**作为显式评估维度呈现；**禁止**仅以单一聚合分数替代二者对比（除非经批准的展示例外并记录理由）。

**Rationale**：思路与自测可检验模型是否过拟合自造用例，并支撑教学与审计式复盘。

### IV. 多模型对比（Multi-Model Comparison）

- 核心交互 **必须**支持用户**同时选择多个模型**，在**同一题目**下**并列**展示：思路、代码与测试结果（时间与题目维度对齐）。
- 单一模型视图可作为补充，但不得削弱多模型并列对比的一等公民地位。

**Rationale**：并列对比是本产品区分于单次调用的主要价值。

### V. 技术栈规范（Technology Stack）

- 前端 **必须**使用 **React**、**TypeScript**、**Vite**、**Tailwind CSS**，除非经宪章修订并记录例外理由与迁移计划。
- 若需要后端能力，**应当**采用 **Deno** + **Hono** 实现 API 与服务逻辑。
- 静态资源与前端 **应当**部署至 **GitHub Pages**；服务端/边缘函数 **应当**部署至 **Deno Deploy**，除非经批准的替代方案写入计划并说明原因。

**Rationale**：统一栈降低协作成本，并与目标托管平台一致。

## 平台与部署约束

- 默认部署拓扑：**GitHub Pages（前端）** + **Deno Deploy（后端/边缘，如需要）**。
- 计划与规格中若引入新的运行时、执行环境或托管方，MUST 在 **Constitution Check** 中说明与上述原则的符合性或已批准的例外。

## 规格与实现门禁

- 所有实现计划（`plan.md`）在 Phase 0 前与 Phase 1 后 **必须**完成 **Constitution Check** 并与本文件对照。
- 涉及模型输出、代码执行、评测或对比展示的功能规格 **必须**显式说明：客观测试来源、沙箱路径、思路/自测字段、自测与系统测试对比维度、多列对比行为。
- 代码评审 **应当**核验：无违规 `eval` / 非沙箱执行路径；评测与 UI 不将主观投票冒充客观结果。

## Governance

- 本宪章优先于一般惯例；与之冲突的实现须在 **Complexity Tracking** 或修订提案中论证。
- **修订**：任何原则增删或语义重定义须更新本文件、递增版本号，并同步检查 `.specify/templates/` 下相关模板与命令说明。
- **版本策略**（语义化）：**MAJOR** — 原则删除或不可兼容重定义；**MINOR** — 新增原则或实质性扩展；**PATCH** — 措辞澄清、错别字、非语义编辑。
- **合规**：PR 与里程碑评审应抽查 Constitution Check 与沙箱/评测相关实现的一致性。

**Version**: 1.1.0 | **Ratified**: 2026-04-02 | **Last Amended**: 2026-04-02
