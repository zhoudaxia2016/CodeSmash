# Quickstart: CodeSmesh 本地开发

## 前置条件

- Node.js 20+（推荐）、pnpm 或 npm  
- [Deno](https://deno.land/) 2.x（**仅**在开发可选排行榜 `server/` 时需要）  
- 各模型供应商的 **API Key**（**仅在你本机浏览器会话中使用**，勿提交仓库）

## 仓库布局（本计划）

- `web/` — Vite + React 18 + TypeScript + Tailwind + Zustand + TanStack Query + QuickJS Wasm  
- `server/` — 可选：Deno + Hono + SQLite（本地文件）；生产部署见 `research.md`

> 若目录尚未脚手架化，先按 `plan.md` 创建后再执行下列命令。

## 前端（主应用）

```bash
cd web
cp .env.example .env
# 若启用排行榜：VITE_LEADERBOARD_API_URL=http://localhost:8787
# 勿在 .env 中存放供应商 API Key；Key 在应用 UI 中输入
pnpm install
pnpm dev
```

**GitHub Pages**：使用 GitHub Actions 构建并发布 `web/dist`；为 project site 设置 Vite `base` 为 `/仓库名/`；`VITE_LEADERBOARD_API_URL` 在 CI Secrets 中注入（**非**模型 Key）。

## 可选 API（排行榜）

```bash
cd server
cp .env.example .env
# 本地 SQLite 路径等（实现期细化）；无供应商 Key
deno task dev
```

默认监听端口以实现时 `main.ts` 为准（示例 **8787**）。

## CORS

若启用 `server/`，需允许前端来源：`http://localhost:5173`（Vite）及 GitHub Pages 域名。

## QuickJS Wasm

`@sebastianwessel/quickjs` 的 wasm 资源须随前端构建发布；若加载失败，检查 Vite 对 `.wasm` 的 `assetsInclude` 或 `public/` 拷贝策略。

## 规格与契约

- 产品愿景与边界见 `spec.md`（**注意**：当前规格含「平台代调」首版描述，与本计划 **BYOK** 方案存在差异，以 `plan.md` Complexity Tracking 为准，后续合并修订规格）。  
- 可选 HTTP 契约见 `contracts/openapi.yaml`。

## 相关文档

- `plan.md` — 实现计划与宪章门禁  
- `research.md` — 技术决策（Deploy 与 SQLite、CORS 等）  
- `data-model.md` — 客户端实体与可选上报载荷
