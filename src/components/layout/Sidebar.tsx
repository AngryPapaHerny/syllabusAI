'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Library, Bot, LogOut, Sparkles, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/curricula', label: '내 커리큘럼', icon: Library },
  { href: '/tutor', label: 'AI 튜터', icon: Bot },
]

interface SidebarProps {
  displayName: string | null
  email: string
}

export function Sidebar({ displayName, email }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-60 flex-col border-r border-white/[0.08] bg-[#1E293B]/80 backdrop-blur-sm">
      <div className="flex h-14 items-center border-b border-white/[0.08] px-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-[15px] font-bold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span>
            <span className="text-indigo-400">syllabus</span>
            <span className="text-slate-100">AI</span>
          </span>
        </Link>
      </div>

      {/* 새 커리큘럼 CTA */}
      <div className="px-3 pt-3">
        <Link
          href="/onboarding"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          새 커리큘럼
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              )}
            >
              <Icon
                className={cn(
                  'h-[18px] w-[18px] transition-colors',
                  active ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.08] p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white shadow-md shadow-indigo-600/20">
            {(displayName ?? email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-200">
              {displayName ?? '사용자'}
            </div>
            <div className="truncate text-xs text-slate-500">{email}</div>
          </div>
        </div>
        <form action="/api/auth/signout" method="POST" className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-1.5 text-xs text-slate-500 transition-colors hover:border-white/[0.14] hover:text-slate-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  )
}
