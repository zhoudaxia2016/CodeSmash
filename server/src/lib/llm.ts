export interface LLMRequest {
  model: string
  prompt: string
  problem?: {
    title: string
    description: string
    functionSignature: string
  }
}

export interface LLMResponse {
  thought: string
  code: string
}

const PROVIDERS = {
  minimax: {
    baseUrl: Deno.env.get('MINIMAX_BASE_URL') || 'https://api.minimaxi.com/v1',
    apiKey: Deno.env.get('MINIMAX_API_KEY') || '',
  },
  deepseek: {
    baseUrl: Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
    apiKey: Deno.env.get('DEEPSEEK_API_KEY') || '',
  },
} as const

export async function callLLM(provider: 'minimax' | 'deepseek', request: LLMRequest): Promise<LLMResponse> {
  const config = PROVIDERS[provider]
  
  if (!config.apiKey) {
    throw new Error(`${provider} API key not configured`)
  }

  const systemPrompt = `You are an expert programmer. Solve the coding problem step by step.
First explain your thought process in "thought:" prefix, then provide the code in "code:" prefix.
The code must be a function named "main" with the exact signature provided.`

  const userPrompt = request.problem
    ? `Problem: ${request.problem.title}\n${request.problem.description}\nFunction signature: ${request.problem.functionSignature}\n\nSolve this problem: ${request.prompt}`
    : request.prompt

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: provider === 'minimax' ? 'MiniMax-M2.7' : 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`${provider} API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content || ''

  // Parse response
  const thoughtMatch = content.match(/thought:\s*([\s\S]*?)(?=code:|$)/i)
  const codeMatch = content.match(/code:\s*([\s\S]*?)$/i)

  return {
    thought: thoughtMatch?.[1]?.trim() || 'No thought process',
    code: codeMatch?.[1]?.trim() || '// No code generated',
  }
}
