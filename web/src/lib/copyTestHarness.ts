/**
 * 复制到本地验证用：`entryPoint.apply(null, args)`，避免重复粘贴时 `const` 重复声明。
 */
export function buildVerifySnippet(
  modelCode: string,
  dataLiteral: string,
  entryPoint: string,
  expectedOutput?: string,
): string {
  const head = modelCode.trim()
  const hint =
    expectedOutput !== undefined && expectedOutput !== ''
      ? `\n// 期望输出：${expectedOutput}`
      : ''
  return `${head}${hint}

const __args = ${dataLiteral};
console.log(${entryPoint}.apply(null, __args));
`
}

/** 题目详情区尚无模型代码：复制骨架，用户先粘贴实现再跑 */
export function buildVerifySnippetStub(
  dataLiteral: string,
  expectedOutput: string,
  functionSignature: string,
  entryPoint: string,
): string {
  return `// 题目签名：${functionSignature}
// 期望输出：${expectedOutput}
//
// 在下方粘贴你的实现（需包含可执行的 ${entryPoint}）

// ---------- 粘贴区 ----------


// ---------- 单条验证（勿改） ----------
const __args = ${dataLiteral};
console.log(${entryPoint}.apply(null, __args));
`
}
