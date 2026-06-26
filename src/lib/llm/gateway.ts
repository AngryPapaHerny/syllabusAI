import { anthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';
import { generateObject, generateText, streamText, type CoreMessage } from 'ai';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';

export type Provider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'groq';
export type ModelTier = 'high' | 'low';

function getDefaultProvider(): Provider {
  const env = process.env.DEFAULT_LLM_PROVIDER ?? 'google';
  if (
    env === 'anthropic' ||
    env === 'openai' ||
    env === 'google' ||
    env === 'ollama' ||
    env === 'groq'
  )
    return env;
  return 'google';
}

// Ollama는 OpenAI 호환 API를 localhost:11434에서 제공
function getOllamaClient() {
  return createOpenAI({
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });
}

// 모델 정책: high=생성(상위 모델), low=검증(경량 모델)
const MODEL_POLICY: Record<Provider, Record<ModelTier, string>> = {
  anthropic: {
    high: 'claude-sonnet-4-6',
    low: 'claude-haiku-4-5-20251001',
  },
  openai: {
    high: 'gpt-4o',
    low: 'gpt-4o-mini',
  },
  google: {
    high: 'gemini-2.0-flash',
    low: 'gemini-2.0-flash-lite',
  },
  ollama: {
    high: 'hf.co/Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M',
    low: 'hf.co/Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M',
  },
  groq: {
    high: 'llama-3.3-70b-versatile',
    low: 'llama-3.1-8b-instant',
  },
};

export function getModel(
  provider: Provider = getDefaultProvider(),
  tier: ModelTier = 'high'
) {
  const modelId = MODEL_POLICY[provider][tier];
  switch (provider) {
    case 'anthropic':
      return anthropic(modelId);
    case 'openai':
      return openai(modelId);
    case 'google':
      return google(modelId);
    case 'ollama':
      return getOllamaClient()(modelId);
    case 'groq':
      return groq(modelId);
  }
}

// 비용 추정 (USD per 1M tokens, 대략적 단가)
const COST_PER_1M_TOKENS: Record<Provider, Record<ModelTier, number>> = {
  anthropic: { high: 3.0, low: 0.25 },
  openai: { high: 5.0, low: 0.15 },
  google: { high: 0.1, low: 0.075 },
  ollama: { high: 0.0, low: 0.0 },
  groq: { high: 0.7, low: 0.08 },
};

export function estimateCost(
  totalTokens: number,
  provider: Provider,
  tier: ModelTier
): number {
  const costPer1M = COST_PER_1M_TOKENS[provider][tier];
  return (totalTokens / 1_000_000) * costPer1M;
}

// gen_jobs에 비용 로깅
export async function logLLMUsage(
  jobId: string,
  provider: Provider,
  tier: ModelTier,
  totalTokens: number,
  model: string
) {
  try {
    const supabase = createServiceClient();
    const cost = estimateCost(totalTokens, provider, tier);
    await supabase
      .from('gen_jobs')
      .update({
        provider,
        model,
        tokens: totalTokens,
        cost,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  } catch (err) {
    console.error('[LLM Gateway] 비용 로깅 실패:', err);
  }
}

interface GenerateWithSchemaOptions {
  provider?: Provider;
  tier?: ModelTier;
  jobId?: string;
  system?: string;
}

// JSON 스키마 강제 출력
export async function generateWithSchema<T>(
  schema: z.ZodSchema<T>,
  prompt: string,
  options: GenerateWithSchemaOptions = {}
) {
  const provider = options.provider ?? getDefaultProvider();
  const tier = options.tier ?? 'high';
  const system = options.system;
  const model = getModel(provider, tier);
  const modelId = MODEL_POLICY[provider][tier];

  // Ollama: generateObject 대신 generateText + 수동 파싱 (SDK 호환성 이슈 우회)
  if (provider === 'ollama') {
    const textResult = await generateText({
      model,
      system,
      prompt: `${prompt}\n\nReturn ONLY valid JSON. No markdown, no code fences, no explanation.`,
    });

    const raw = textResult.text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '');

    const parsed = JSON.parse(raw);
    const object = schema.parse(parsed);

    const totalTokens = textResult.usage.promptTokens + textResult.usage.completionTokens;
    if (options.jobId) {
      await logLLMUsage(options.jobId, provider, tier, totalTokens, modelId);
    }
    return { object, usage: { ...textResult.usage, totalTokens } };
  }

  const result = await generateObject({ model, schema, system, prompt });

  if (options.jobId) {
    await logLLMUsage(
      options.jobId,
      provider,
      tier,
      result.usage.totalTokens,
      modelId
    );
  }

  return result;
}

interface GenerateWithFallbackOptions {
  tier?: ModelTier;
  jobId?: string;
}

// 폴백: 주 프로바이더 실패 시 순차 fallback
export async function generateWithFallback(
  prompt: string,
  options: GenerateWithFallbackOptions = {}
) {
  const tier = options.tier ?? 'high';
  const providers: Provider[] = ['ollama', 'groq', 'google', 'anthropic', 'openai'];

  for (const provider of providers) {
    try {
      const model = getModel(provider, tier);
      const modelId = MODEL_POLICY[provider][tier];
      const result = await generateText({ model, prompt });

      if (options.jobId) {
        await logLLMUsage(
          options.jobId,
          provider,
          tier,
          result.usage.totalTokens,
          modelId
        );
      }

      return { result, provider };
    } catch {
      continue;
    }
  }
  throw new Error('All LLM providers failed');
}

interface StreamWithContextOptions {
  provider?: Provider;
  tier?: ModelTier;
  system?: string;
  messages: CoreMessage[];
}

// SSE 스트리밍 (튜터 API용)
export function streamWithContext(options: StreamWithContextOptions) {
  const provider = options.provider ?? getDefaultProvider();
  const tier = options.tier ?? 'high';
  const model = getModel(provider, tier);

  return streamText({
    model,
    system: options.system,
    messages: options.messages,
  });
}
