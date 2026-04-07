# CodeSmash

https://zhoudaxia2016.github.io/CodeSmash

CodeSmash 是一个面向算法题对战场景的全栈应用，采用 monorepo 结构：

- `web/`：Vite + React + TypeScript 前端
- `server/`：Deno + Hono API 服务
- 数据库：Turso（libSQL）

## 核心功能

围绕一次完整「模型解题对战」流程：

1. 选择模型：支持在对战中选择不同厂商/模型组合
2. 选择题目：从题库中选择题目并开始对战
3. 模型分析：先产出解题思路与复杂度分析
4. 代码输出：基于分析产出可运行 JavaScript 代码
5. 跑测试用例：执行官方测试并返回通过率/失败详情
6. 继续追问：根据评测结果继续追问，触发下一轮分析 + 代码修正
7. 部署页面：前端可部署到 GitHub Pages，服务端可部署到 Deno Deploy

## 本地开发

### 1) 启动服务端

```bash
cd server
deno task dev
```

默认监听 `http://localhost:8000`。

### 2) 启动前端

```bash
cd web
pnpm install
pnpm dev
```

默认监听 `http://localhost:3000`，开发环境通过 Vite 代理把 `/api` 转发到 `:8000`。

## 前端构建与部署（GitHub Pages）

### 本地构建

```bash
cd web
pnpm install
pnpm build
```

构建产物在 `web/dist`。

### 自动部署（GitHub Actions）

仓库已包含前端发布工作流：`.github/workflows/deploy.yml`，在 `main` 分支 push 后自动执行：

- 安装依赖并执行 `pnpm run build`
- 上传 `web/dist` 到 Pages
- 发布到 GitHub Pages

### 部署前配置

1. 在 GitHub 仓库启用 Pages（Source 选 GitHub Actions）
2. 在仓库 Variables 中配置：
   - `VITE_API_URL`：线上 API 地址（例如 Deno Deploy 提供的域名）
3. 确认仓库名与前端 `base` 路径一致  
   当前 `web/vite.config.ts` 生产环境 `base` 为 `/CodeSmash/`

## 服务端构建与部署（Deno Deploy）

### 本地运行（生产模式）

```bash
cd server
deno task start
```

### 部署到 Deno Deploy（推荐 GitHub 集成）

1. 在 Deno Deploy 新建项目并连接本仓库
2. Root Directory 设为 `server`
3. Entrypoint 设为 `src/main.ts`
4. 在项目环境变量中配置（见下文）
5. 部署后获得线上 API 域名，回填到前端 `VITE_API_URL`

## 数据库（Turso）

服务端通过 libSQL 客户端访问 Turso：

- `LIBSQL_URL`：Turso 数据库 URL
- `LIBSQL_AUTH_TOKEN`：Turso Auth Token

未配置 `LIBSQL_URL` 时，会回退到本地文件数据库（`server/data/codesmash.db`），适合本地开发。

## 环境变量清单

以下为常用变量（按功能分组）：

### 基础与跨域

- `ALLOWED_FRONTEND_ORIGINS`：允许的前端来源（逗号分隔）
- `TRUST_PROXY`：是否信任反向代理头（`1` 开启）
- `COOKIE_SECURE`：Cookie Secure（`1` 开启）
- `COOKIE_SAMESITE_NONE`：跨站 Cookie（`1` 开启，HTTPS 必需）

### Turso / libSQL

- `LIBSQL_URL`
- `LIBSQL_AUTH_TOKEN`

### GitHub OAuth

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `ADMIN_GITHUB_IDS`（可选，逗号分隔）

### 模型厂商 Key

- `MINIMAX_API_KEY` / `MINIMAX_BASE_URL`（可选覆盖）
- `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`（可选覆盖）
- `BIGMODEL_API_KEY` / `BIGMODEL_BASE_URL`（可选覆盖）

### 可选调优

- `VENDOR_HTTP_TIMEOUT_MS`
- `LLM_DB_LOG`
- `LLM_LOG_PROMPTS`
- `LLM_PROMPT_LOG_MAX_CHARS`
- `PROBLEM_AUTHORING_MAX_EXPECTED_ALTS`

## 推荐部署顺序

1. 先部署服务端（Deno Deploy）并配置 Turso + OAuth + 模型 Key
2. 拿到服务端线上地址后，配置前端 `VITE_API_URL`
3. 推送 `main`，由 GitHub Actions 自动构建并发布前端到 GitHub Pages

