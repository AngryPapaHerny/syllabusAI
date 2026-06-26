'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="surface w-full max-w-sm p-8 text-center animate-fade-in-up">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
            <Mail className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-slate-100">이메일을 확인하세요</h2>
          <p className="mt-2 text-sm text-slate-400">
            {email} 로 인증 링크를 보냈습니다. 링크를 클릭하면 가입이 완료됩니다.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-indigo-400 hover:text-indigo-300">
            로그인으로 이동
          </Link>
        </div>
      </div>
    )
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
          <h1 className="mt-5 text-2xl font-bold text-slate-100">시작해볼까요?</h1>
          <p className="mt-1.5 text-sm text-slate-400">무료로 나만의 커리큘럼을 만드세요.</p>
        </div>

        <div className="surface p-8">
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-300">이름</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="홍길동"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">이메일</label>
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
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">비밀번호</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="8자 이상"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? '처리 중...' : '계정 만들기'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}
