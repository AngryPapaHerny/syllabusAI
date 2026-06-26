import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const RunCodeSchema = z.object({
  language: z.enum(['python', 'javascript', 'typescript']).default('python'),
  code: z.string().min(1).max(10000),
  stdin: z.string().max(1000).optional(),
  _internal_pipeline: z.boolean().optional(),
});

// Wandbox 코드 실행 API 응답 (https://github.com/melpon/wandbox/blob/master/kennel/API.rst)
interface WandboxResponse {
  status?: string; // 프로그램 종료 코드 (문자열)
  signal?: string; // 비정상 종료 시그널 (예: "Killed" — 리소스/시간 초과)
  program_output?: string; // stdout
  program_error?: string; // stderr
  compiler_error?: string; // 컴파일 에러 (js/ts 등)
}

// 언어 → Wandbox 컴파일러 매핑
// (공개 Piston API가 2026-02-15부터 whitelist 전용으로 전환되어 Wandbox로 교체)
const COMPILER_MAP: Record<string, string> = {
  python: 'cpython-3.10.15',
  javascript: 'nodejs-20.17.0',
  typescript: 'typescript-5.6.2',
};

export async function POST(req: Request) {
  // body를 먼저 파싱 (내부 파이프라인 플래그 확인을 위해 검증 선행)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RunCodeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // 인증 처리:
  // - _internal_pipeline=true: 워커 시크릿(Authorization 헤더) 또는 Supabase 세션
  // - 일반 요청: Supabase 세션 필수
  const isInternalPipeline = parsed.data._internal_pipeline === true;
  let authenticated = false;

  if (isInternalPipeline) {
    const authHeader = req.headers.get('Authorization');
    const workerSecret =
      process.env.WORKER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (authHeader && authHeader === `Bearer ${workerSecret}`) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    // 일반 사용자 Supabase 세션 인증
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { language, code, stdin } = parsed.data;
  const compiler = COMPILER_MAP[language];

  if (!compiler) {
    return Response.json({ error: 'Unsupported language' }, { status: 400 });
  }

  // Wandbox 베이스 URL (env 미설정 시 공개 인스턴스)
  const sandboxUrl = process.env.SANDBOX_API_URL ?? 'https://wandbox.org';
  const startTime = Date.now();

  try {
    const sandboxResponse = await fetch(`${sandboxUrl}/api/compile.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SANDBOX_API_KEY
          ? { Authorization: `Bearer ${process.env.SANDBOX_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        compiler,
        code,
        stdin: stdin ?? '',
      }),
      signal: AbortSignal.timeout(18000), // HTTP 레벨 18초 타임아웃
    });

    const executionMs = Date.now() - startTime;

    if (!sandboxResponse.ok) {
      console.error('[POST /api/run] sandbox error:', sandboxResponse.status);
      return Response.json({ error: 'Sandbox unavailable' }, { status: 503 });
    }

    const result: WandboxResponse = await sandboxResponse.json();

    // 시그널이 있으면 리소스/시간 초과로 강제 종료된 것으로 간주
    const signal = result.signal ?? '';
    const timedOut = /kill|terminat|timeout|xcpu/i.test(signal);

    // 종료 코드 산출: status 파싱 실패 시 컴파일 에러/시그널 여부로 판정
    let exitCode = Number.parseInt(result.status ?? '', 10);
    if (Number.isNaN(exitCode)) {
      exitCode = result.compiler_error || signal ? 1 : 0;
    }
    if (timedOut) exitCode = 124;

    // stderr: 컴파일 에러(js/ts) + 런타임 에러(stderr) 결합
    const stderr = [result.compiler_error, result.program_error]
      .filter(Boolean)
      .join('');

    return Response.json({
      stdout: result.program_output ?? '',
      stderr,
      exit_code: exitCode,
      execution_time_ms: executionMs,
      timed_out: timedOut,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return Response.json(
        {
          error: 'Sandbox request timeout',
          code: 'SANDBOX_HTTP_TIMEOUT',
        },
        { status: 408 }
      );
    }

    console.error('[POST /api/run] unexpected error:', err);
    return Response.json({ error: 'Sandbox unavailable' }, { status: 503 });
  }
}
