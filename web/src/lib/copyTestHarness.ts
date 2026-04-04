/**
 * 复制到本地验证用：直接 `console.log(main(...))`，避免重复粘贴时 `const` 重复声明。
 * （平台内评测仍按 String(main(...)).trim() 与期望比对。）
 */
export function buildVerifySnippet(
  modelCode: string,
  inputArgs: string,
  expectedOutput?: string,
): string {
  const head = modelCode.trim()
  const hint =
    expectedOutput !== undefined && expectedOutput !== ''
      ? `\n// 期望输出：${expectedOutput}`
      : ''
  return `${head}${hint}

console.log(main(${inputArgs}));
`
}

/** 题目详情区尚无模型代码：复制骨架，用户先粘贴 main 再跑 */
export function buildVerifySnippetStub(
  inputArgs: string,
  expectedOutput: string,
  functionSignature: string,
): string {
  return `// 题目签名：${functionSignature}
// 期望输出：${expectedOutput}
//
// 在下方粘贴你的实现（需包含可执行的 main）

// ---------- 粘贴区 ----------


// ---------- 单条验证（勿改） ----------
console.log(main(${inputArgs}));
`
}
