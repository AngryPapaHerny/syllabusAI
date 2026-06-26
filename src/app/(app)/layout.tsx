import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  let user = null
  let profile = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Supabase 미설정 환경
  }

  // Supabase가 설정된 프로덕션에서만 리다이렉트
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const isLocalDev = !supabaseUrl || supabaseUrl === 'http://localhost:54321'

  if (!user && !isLocalDev) {
    redirect('/login')
  }

  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single()
    profile = data
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0F172A]">
      <Sidebar
        displayName={profile?.display_name ?? '학습자'}
        email={user?.email ?? 'demo@syllabusai.com'}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6">{children}</div>
      </main>
    </div>
  )
}
