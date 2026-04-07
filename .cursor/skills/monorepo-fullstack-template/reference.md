# 参考：占位符与目录布局

## 占位符一览

占位符**拼写须与表中完全一致**，便于全局查找替换。

| 占位符 | 含义 | 常见形态 / 说明 |
|--------|------|-----------------|
| `{{APP_SLUG}}` | 仓库与路径用的短标识 | `kebab-case`，如 `acme-coder` |
| `{{APP_DISPLAY_NAME}}` | 给人看的应用名称 | 可含空格、大小写混用 |
| `{{WEB_PACKAGE_NAME}}` | `web/package.json` 的 `name` | 符合 npm：小写，常为 `{{APP_SLUG}}-web` |
| `{{SERVER_PROJECT_LABEL}}` | 可选，用于 server 侧 README 或说明文案 | 短语即可，不含秘钥 |
| `{{API_PUBLIC_URL}}` | API 对外基础 URL | 文档中可写 `https://api.example.com`；真实值只在 `.env` |
| `{{WEB_PUBLIC_URL}}` | 前端 SPA 对外基础 URL | 文档中可写 `https://app.example.com` |
| `{{CORS_ALLOWED_ORIGIN}}` | API 允许的浏览器来源（开发或生产） | 须与 Vite 开发地址或线上 web 一致 |
| `{{DATABASE_URL}}` | 数据库连接串 | **仅**出现在 `.env.example` 作示例，如 `libsql://...` |
| `{{GITHUB_OWNER}}` / `{{GITHUB_REPO}}` | README 徽章或 clone 地址 | 可选 |
| `{{LICENSE_SPDX}}` | SPDX 许可证标识 | 如 `MIT`、`Apache-2.0` |
| `{{APP_INITIALS}}` | PWA 图标中的短字母标识 | 2-4 个大写字母，如 `AC` |

仅在用户明确需要时增加占位符；默认保持少量、够用即可。

## 推荐顶层目录树

```text
.
├── .cursor/
│   ├── rules/                 # 可选：约定说明、globs
│   └── skills/                # 可选：本模板 Skill 可放此处
├── .github/
│   └── workflows/             # 可选：CI/CD
├── server/
│   ├── deno.json
│   ├── deno.lock              # 生成文件
│   ├── .env.example
│   └── src/
│       ├── main.ts
│       ├── routes/
│       ├── db/
│       ├── lib/
│       └── middleware/
└── web/
    ├── package.json
    ├── index.html
    ├── public/
    │   ├── pwa-icon.svg
    │   └── pwa-icon-maskable.svg
    ├── manifest.webmanifest
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── components/
        ├── hooks/
        ├── pages/
        ├── types/
        └── utils/
```

若只做前端或只做 API，可按需删减；本 Skill 默认针对 **web + server 双包**。

## README 模板骨架（示例）

建议在根目录 `README.md` 至少包含以下章节：

```markdown
# {{APP_DISPLAY_NAME}}

## 核心功能

1. xxxx
2. xxxx

## 前端构建与部署（GitHub Pages）

- 本地：`cd web && npm install && npm run build`
- 自动部署：GitHub Actions
- 关键变量：`VITE_API_URL`

## 服务端构建与部署（Deno Deploy）

- 本地：`cd server && deno task start`
- 部署：Root Directory 为 `server`，Entrypoint 为 `src/main.ts`

## 数据库（Turso / libSQL）

- `LIBSQL_URL`
- `LIBSQL_AUTH_TOKEN`

环境变量模板中的 `{{API_PUBLIC_URL}}`、`{{WEB_PUBLIC_URL}}`、`{{DATABASE_URL}}` 仅在本地替换为真实值；切勿提交 `.env`。
```

## PWA 资源与清单（示例）

当模板需要支持 PWA 时，至少提供：

1. `web/public/pwa-icon.svg`（常规图标）
2. `web/public/pwa-icon-maskable.svg`（自适应图标）
3. `web/manifest.webmanifest`（声明 icon 与 maskable icon）

`manifest.webmanifest` 最小片段：

```json
{
  "name": "{{APP_DISPLAY_NAME}}",
  "short_name": "{{APP_INITIALS}}",
  "icons": [
    {
      "src": "/pwa-icon.svg",
      "sizes": "512x512",
      "type": "image/svg+xml"
    },
    {
      "src": "/pwa-icon-maskable.svg",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "maskable"
    }
  ]
}
```

补充约束：

- 图标与文案使用占位符语义，不写固定品牌字符串。
- 若使用 GitHub Pages 子路径部署，验证 `manifest` 与图标链接在子路径下可访问。
- `README` 需说明 PWA 图标资源位置与构建产物可见性（例如在 `dist` 中可访问）。

## 反模式

- 「模板」README 仍写着上一个应用的名字。
- 在源码中写死生产 URL，而不是环境变量 + 文档占位符。
- 在用户可见文案中保留未替换的 `{{APP_SLUG}}` 就发布。
