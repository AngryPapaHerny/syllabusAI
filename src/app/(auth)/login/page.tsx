'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[30rem] w-[40rem] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[15px] font-bold tracking-tight">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span>
              <span className="text-indigo-400">syllabus</span>
              <span className="text-slate-100">AI</span>
            </span>
          </Link>
          <h1 className="mt-5 text-2xl font-bold text-slate-100">다시 만나서 반가워요</h1>
          <p className="mt-1.5 text-sm text-slate-400">학습을 이어가세요.</p>
        </div>

        <div className="surface p-8">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                이메일
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-xs text-slate-500">또는</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <button onClick={handleGoogleLogin} className="btn-secondary mt-5 w-full py-2.5">
            Google로 계속하기
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="font-semibold text-indigo-400 hover:text-indigo-300">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  )
}
