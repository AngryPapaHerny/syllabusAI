import { Bot } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { TutorChat } from '@/components/learn/TutorChat'

export const dynamic = 'force-dynamic'

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{
    curriculum_id?: string
    concept_key?: string
    variant_id?: string
  }>
}) {
  const sp = await searchParams
  const supabase = createServerClient()

  let curriculumId = sp.curriculum_id ?? ''
  if (!curriculumId) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data: c } = await supabase
      .from('curricula')
      .select('id')
      .eq('owner_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    curriculumId = c?.id ?? ''
  }

  const conceptKey = sp.concept_key ?? 'general'
  const variantId = sp.variant_id

  return (
    <div className="mx-auto max-w-2xl py-4 animate-fade-in-up">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
          <Bot className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI 튜터</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            소크라테스식 힌트로 스스로 답을 찾도록 도와드립니다.
          </p>
        </div>
      </div>
      <div
        className="surface overflow-hidden"
        style={{ height: '70vh' }}
      >
        <TutorChat
          curriculumId={curriculumId}
          conceptKey={conceptKey}
          unitVariantId={variantId}
        />
      </div>
    </div>
  )
}
