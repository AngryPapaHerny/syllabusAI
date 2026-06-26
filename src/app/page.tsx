import Link from 'next/link'
import { Target, BookOpen, Bot, ArrowRight, Sparkles } from 'lucide-react'

const features = [
  {
    icon: Target,
    title: '맞춤형 커리큘럼',
    desc: '목표·수준·시간을 입력하면 AI가 최적의 학습 경로를 자동으로 설계합니다.',
  },
  {
    icon: BookOpen,
    title: 'P-C-S-M-A 학습',
    desc: '문제 제기→개념→코드→동기→평가 순서로 구조화된 심층 학습을 제공합니다.',
  },
  {
    icon: Bot,
    title: 'AI 튜터',
    desc: '모르는 부분은 소크라테스식 힌트로 스스로 답을 찾도록 안내합니다.',
  },
]

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      {/* 배경 글로우 */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[40rem] w-[60rem] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />

      <div className="mx-auto w-full max-w-3xl text-center animate-fade-in-up">
        {/* Logo */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[15px] font-bold tracking-tight"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span>
            <span className="text-indigo-400">syllabus</span>
            <span className="text-slate-100">AI</span>
          </span>
        </Link>

        {/* Badge */}
        <div className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/[0.08] px-3 py-1 text-xs font-medium text-indigo-300">
          <Sparkles className="h-3 w-3" />
          AI 기반 개인 맞춤 학습
        </div>

        {/* Headline */}
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-100 sm:text-6xl">
          AI가 설계하는<br />
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            나만의 커리큘럼
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
          주제와 수준을 입력하면 AI가 개인 맞춤 커리큘럼과 검증된 학습 콘텐츠를 자동으로 만들어 드립니다.
        </p>

        {/* CTAs */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/signup" className="btn-primary px-7 py-3 text-[15px]">
            무료로 시작하기
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="btn-secondary px-7 py-3 text-[15px]">
            로그인
          </Link>
        </div>

        {/* Feature cards */}
        <div className="mt-20 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="surface-interactive group p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 transition-colors group-hover:bg-indigo-500/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-slate-100">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
