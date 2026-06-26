'use client'

import { useState } from 'react'
import { Play, Loader2, AlertTriangle, Terminal } from 'lucide-react'
import type { RunCodeResponse } from '@/types/api'

interface Props {
  initialCode: string
  language?: 'python' | 'javascript' | 'typescript'
  readOnly?: boolean
  onCodeChange?: (code: string) => void
}

// stdin을 읽는 코드인지 감지 (Python input() / JS readline 등)
function detectNeedsStdin(code: string, language: string): boolean {
  if (language === 'python') return /\binput\s*\(/.test(code)
  return /readline|prompt\s*\(|process\.stdin/.test(code)
}

export function CodeSandbox({
  initialCode,
  language = 'python',
  readOnly = false,
  onCodeChange,
}: Props) {
  const [code, setCode] = useState(initialCode)
  const [stdin, setStdin] = useState('')
  const [result, setResult] = useState<RunCodeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsStdin = detectNeedsStdin(code, language)

  function handleCodeChange(value: string) {
    setCode(value)
    onCodeChange?.(value)
  }

  async function runCode() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          code,
          ...(needsStdin && stdin ? { stdin } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '실행 오류가 발생했습니다.')
        return
      }

      const data: RunCodeResponse = await res.json()
      setResult(data)
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* 에디터 헤더 */}
      <div className="flex items-center justify-between rounded-t-lg border border-white/[0.14] bg-[#0F172A] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <span className="font-mono text-xs font-medium text-slate-500">{language}</span>
        </div>
        <button
          onClick={runCode}
          disabled={loading || readOnly}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-[0.97] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          {loading ? '실행 중' : '실행'}
        </button>
      </div>

      {/* 코드 에디터 */}
      <textarea
        value={code}
        onChange={(e) => handleCodeChange(e.target.value)}
        readOnly={readOnly}
        className="w-full rounded-b-lg border border-t-0 border-white/[0.14] bg-[#0F172A] p-4 font-mono text-sm text-emerald-300 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
        rows={Math.max(6, code.split('\n').length + 1)}
        spellCheck={false}
      />

      {/* 입력값(stdin) — input() 등 입력을 읽는 코드일 때만 노출 */}
      {needsStdin && (
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Terminal className="h-3.5 w-3.5" />
            입력값 (stdin) — 한 줄에 하나씩, 입력 요청 순서대로
          </label>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="이 코드는 입력이 필요합니다. 예: Alice"
            className="w-full rounded-lg border border-white/[0.14] bg-[#0F172A] p-3 font-mono text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            rows={Math.max(2, stdin.split('\n').length)}
            spellCheck={false}
          />
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 실행 결과 */}
      {result && (
        <div className="overflow-hidden rounded-lg border border-white/[0.14]">
          <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#1E293B] px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Terminal className="h-3.5 w-3.5" />
              출력 결과
            </span>
            <div className="flex items-center gap-2 text-xs">
              {result.timed_out && (
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  타임아웃
                </span>
              )}
              {result.exit_code !== 0 && !result.timed_out && (
                <span className="text-rose-400">exit {result.exit_code}</span>
              )}
              <span className="tabular-nums text-slate-500">{result.execution_time_ms}ms</span>
            </div>
          </div>
          <div className="min-h-10 bg-[#0F172A] p-4 font-mono text-sm">
            {result.stdout && (
              <pre className="whitespace-pre-wrap text-emerald-300">{result.stdout}</pre>
            )}
            {result.stderr && (
              <pre className="whitespace-pre-wrap text-rose-400">{result.stderr}</pre>
            )}
            {!result.stdout && !result.stderr && (
              <span className="text-slate-500 text-xs">(출력 없음)</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
