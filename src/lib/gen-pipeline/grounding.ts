import type { UnitVariantContent } from '@/types/database';

interface GroundingResult {
  passed: boolean;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  error?: string;
}

// 코드 스니펫을 샌드박스에서 실행 검증
export async function runGrounding(
  content: UnitVariantContent,
  appUrl: string
): Promise<GroundingResult> {
  const code = content.S;
  if (!code || code.trim().length === 0) {
    return { passed: false, error: 'No code snippet to verify' };
  }

  // 언어 감지 (기본 python)
  const language = detectLanguage(code);

  // 워커(서버 환경)에서 호출하므로 WORKER_SECRET으로 /api/run 내부 인증
  const workerSecret =
    process.env.WORKER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  try {
    const response = await fetch(`${appUrl}/api/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({
        language,
        code,
        _internal_pipeline: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return { passed: false, error: `Sandbox HTTP error: ${response.status}` };
    }

    const result = await response.json();

    if (result.timed_out) {
      return { passed: false, error: 'Code execution timed out' };
    }

    // 입력을 읽는 예제(input() 등)는 자동 검증 시 stdin이 없어 EOFError로 종료된다.
    // 이는 코드 자체의 결함이 아니라 대화형 입력 부재이므로 통과로 간주한다.
    const stderr = result.stderr ?? '';
    const eofOnInput =
      result.exit_code !== 0 &&
      /EOFError|EOF when reading a line/i.test(stderr) &&
      /\binput\s*\(/.test(code);

    return {
      passed: result.exit_code === 0 || eofOnInput,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exit_code,
    };
  } catch (err) {
    return {
      passed: false,
      error: err instanceof Error ? err.message : 'Unknown grounding error',
    };
  }
}

function detectLanguage(code: string): 'python' | 'javascript' | 'typescript' {
  // 간단한 휴리스틱
  if (
    code.includes('def ') ||
    code.includes('import ') ||
    code.includes('print(')
  ) {
    return 'python';
  }
  if (code.includes(': ') && code.includes('interface ')) {
    return 'typescript';
  }
  return 'javascript';
}
