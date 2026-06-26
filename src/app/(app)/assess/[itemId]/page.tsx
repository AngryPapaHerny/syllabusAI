import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, BookOpen, RotateCcw, PenLine, type LucideIcon } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { MCQQuestion } from '@/components/assess/MCQQuestion'
import { CodeQuestion } from '@/components/assess/CodeQuestion'

export const dynamic = 'force-dynamic'

const FAILURE_TYPE_INFO: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  gap:          { label: '개념 부재 — 관련 개념을 먼저 학습하세요',          icon: BookOpen, color: 'text-amber-400' },
  misconception:{ label: '오개념 — 다른 방식으로 개념을 다시 살펴보세요',    icon: RotateCcw, color: 'text-orange-400' },
  slip:         { label: '실수 — 한 번 더 도전해 보세요',                    icon: PenLine, color: 'text-blue-400' },
}

export default async function AssessPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>
  searchParams: Promise<{
    curriculum_id?: string
    concept_key?: string
    variant_id?: string
    failure_type?: string
  }>
}) {
  const { itemId } = await params
  const sp = await searchParams
  const curriculumId = sp.curriculum_id ?? ''
  const conceptKey = sp.concept_key ?? ''
  const variantId = sp.variant_id ?? ''
  const failureType = sp.failure_type

  const supabase = createServerClient()
  const { data: item } = await supabase
    .from('assessment_items')
    .select('*')
    .eq('id', itemId)
    .single()

  if (!item) notFound()

  const failureInfo = failureType ? FAILURE_TYPE_INFO[failureType] : null
  const FailureIcon = failureInfo?.icon

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4 animate-fade-in-up">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        {curriculumId && (
          <Link
            href={`/curricula/${curriculumId}`}
            className="inline-flex items-center gap-1 text-sm text-slate-400 transition-colors hover:text-slate-200"
          >
            <ChevronLeft className="h-4 w-4" />
            커리큘럼
          </Link>
        )}
        <h1 className="text-xl font-bold text-slate-100">평가</h1>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-slate-400">
          {item.type === 'mcq' ? '객관식' : '코딩'}
        </span>
      </div>

      {/* 재학습 컨텍스트 배너 */}
      {failureInfo && FailureIcon && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
          <FailureIcon className={`h-4 w-4 shrink-0 ${failureInfo.color}`} />
          <span className={`text-sm ${failureInfo.color}`}>{failureInfo.label}</span>
        </div>
      )}

      {/* 개념 키 표시 */}
      <div className="surface p-5">
        <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
          {(conceptKey || item.concept_key).replace(/_/g, ' ')}
        </p>

        {item.type === 'mcq' ? (
          <MCQQuestion
            itemId={item.id}
            stem={item.stem}
            options={item.options ?? []}
            correctIndex={(item.answer as { index?: number }).index ?? 0}
            rationale={item.rationale}
            conceptKey={conceptKey || item.concept_key}
            curriculumId={curriculumId}
            variantId={variantId}
          />
        ) : (
          <CodeQuestion
            itemId={item.id}
            stem={item.stem}
            expectedAnswer={(item.answer as { code?: string }).code ?? ''}
            rationale={item.rationale}
            conceptKey={conceptKey || item.concept_key}
            curriculumId={curriculumId}
            variantId={variantId}
          />
        )}
      </div>
    </div>
  )
}
