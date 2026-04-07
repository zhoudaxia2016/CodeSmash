---
name: monorepo-fullstack-template
description: >-
  用 web/ 下的 Vite + React + TypeScript 与 server/ 下的 Deno + Hono API
  搭建或对齐双包 monorepo，全程使用占位变量而非固定产品名。适用于按此结构新建全栈应用、
  monorepo 模板、项目脚手架，或对已有副本做重命名与去品牌化清理。
---

# Monorepo 全栈模板（web + server）

## 硬性要求

- 生成文件、Skill 正文与示例中**不得出现具体产品名或组织名**，只使用 [reference.md](reference.md#占位符一览) 中的占位符。
- **一次性替换**：在复制仍含 `{{...}}` 的路径或文案之前，先为每个占位符选定取值。
- 脚手架完成后**检索新目录树**是否残留：`{{`、旧 slug、以及误写入的真实域名（文档里用 `example.com` 可以；不要写真实生产域名）。

## 何时阅读扩展文档

- 完整占位符表与推荐目录树见 [reference.md](reference.md)。

## 工作流（Agent）

1. **收集**至少以下取值：`{{APP_SLUG}}`、`{{APP_DISPLAY_NAME}}`、`{{WEB_PACKAGE_NAME}}`、`{{CORS_ALLOWED_ORIGIN}}`（开发用）、按需的 `{{API_PUBLIC_URL}}` / `{{WEB_PUBLIC_URL}}`。无法从上下文推断时再询问用户。
2. **搭建**顶层目录：`web/`、`server/`、可选 `.github/workflows/`、可选 `.cursor/rules/`。
3. **前端（`web/`）**：Vite + React + TypeScript；`package.json` 的 `name` 为 `{{WEB_PACKAGE_NAME}}`（符合 npm 规则）；HTML `title` / meta 使用 `{{APP_DISPLAY_NAME}}`。
4. **后端（`server/`）**：Deno，`deno.json`，入口 `src/main.ts`；环境变量**仅**通过 `.env.example` 说明模板——秘钥永不入库；注释与文档示例使用 `{{API_PUBLIC_URL}}` 这类占位。
5. **CI / 部署**：若添加 workflow，registry、主机与秘钥通过 GitHub **Environments / Variables** 注入，勿在仓库中写死 URL（文档中的 `example.com` 除外）。
6. **README**：写根目录 `README.md` 的模板化版本，至少包含：核心功能流程、前端构建/部署（GitHub Pages）、服务端构建/部署（Deno Deploy）、数据库（Turso/libSQL）。所有对外地址均用占位符，不写真实域名。
7. **PWA（web）**：补齐 `manifest.webmanifest`、`web/public/pwa-icon.svg`、`web/public/pwa-icon-maskable.svg`；`manifest` 中同时声明常规 icon 与 `purpose: "maskable"` 图标。图标文字与标识一律用占位符语义（如 `{{APP_INITIALS}}`），不要写固定品牌字样。
8. **Cursor 规则**：若仓库包含 `.cursor/rules`，保持**与品牌无关**（仅 globs 与约定），不要写入营销用名称。
9. **验证**：按技术栈执行安装与构建；修正路径与环境样例，直到 web 与 server 在开发模式下均可启动。

## Web 约定（摘要）

在新 `web/src` 中遵循下列约定，除非本仓库 `.cursor/rules` 另有规定：

- 页面放在 `pages/<领域>/<功能>/index.tsx`；避免在 `pages/<领域>/` 根下堆与 `index.tsx` 并列的大型一次性组件。
- 导出组件用**领域语义命名**，不用纯控件式命名（如 `FooModal`），通用底层 primitive 除外。
- 单文件单组件：使用 `type Props`；功能包仅在 `components/<功能>/index.tsx` 导出主组件与必要类型。
- 纯函数放 `web/src/utils/`，按主题命名文件；编排 API / 大模型调用的逻辑放 `web/src/hooks/`。

## 后端约定（摘要）

- HTTP 路由放 `server/src/routes/`，数据库访问放 `server/src/db/`，共享工具放 `server/src/lib/`，中间件放 `server/src/middleware/`。
- CORS 与允许的来源须来自配置（由用户环境推导），不要写死某个品牌域名。
