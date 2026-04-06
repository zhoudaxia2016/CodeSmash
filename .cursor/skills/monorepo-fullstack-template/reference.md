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

## README 片段（示例）

首次运行说明中使用占位符：

```markdown
# {{APP_DISPLAY_NAME}}

- 前端：`web/` — `npm install` / `npm run dev`
- 接口：`server/` — 见 `deno.json` 的 tasks；将 `server/.env.example` 复制为 `server/.env`

环境变量模板中的 `{{API_PUBLIC_URL}}`、`{{WEB_PUBLIC_URL}}`、`{{DATABASE_URL}}` 仅在本地替换为真实值；切勿提交 `.env`。
```

## 反模式

- 「模板」README 仍写着上一个应用的名字。
- 在源码中写死生产 URL，而不是环境变量 + 文档占位符。
- 在用户可见文案中保留未替换的 `{{APP_SLUG}}` 就发布。
