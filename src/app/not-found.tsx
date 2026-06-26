import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-center">
      <h2 className="text-4xl font-bold text-slate-100">404</h2>
      <p className="mt-2 text-slate-400">페이지를 찾을 수 없습니다.</p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
      >
        대시보드로 이동
      </Link>
    </div>
  )
}
