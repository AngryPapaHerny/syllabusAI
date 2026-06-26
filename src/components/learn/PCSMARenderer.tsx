'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  HelpCircle,
  Lightbulb,
  Code2,
  Sparkles,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Bot,
  Check,
  type LucideIcon,
} from 'lucide-react'
import type { UnitVariantContent } from '@/types/database'
import { CodeSandbox } from './CodeSandbox'
import { TutorChat } from './TutorChat'
import { MCQQuestion } from '@/components/assess/MCQQuestion'
import { CodeQuestion } from '@/components/assess/CodeQuestion'
import { cn } from '@/lib/utils'

interface Props {
  content: UnitVariantContent
  unitId: string
  variantId: string
  conceptKey: string
  curriculumId: string
  nextUnitId?: string
  nextUnitTitle?: string
}

const SECTIONS = ['P', 'C', 'S', 'M', 'A'] as const
type Section = (typeof SECTIONS)[number]

const SECTION_META: Record<Section, { label: string; icon: LucideIcon; heading: string }> = {
  P: { label: '문제 제기', icon: HelpCircle, heading: '왜 배워야 할까요?' },
  C: { label: '개념', icon: Lightbulb, heading: '개념 설명' },
  S: { label: '코드', icon: Code2, heading: '코드 예제' },
  M: { label: '동기', icon: Sparkles, heading: '왜 중요한가요?' },
  A: { label: '평가', icon: ClipboardCheck, heading: '평가' },
}

export function PCSMARenderer({
  content,
  unitId,
  variantId,
  conceptKey,
  curriculumId,
  nextUnitId,
  nextUnitTitle,
}: Props) {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<Section>('P')
  const [visited, setVisited] = useState<Set<Section>>(new Set<Section>(['P']))
  const [showTutor, setShowTutor] = useState(false)

  const activeIdx = SECTIONS.indexOf(activeSection)
  const progress = (visited.size / SECTIONS.length) * 100

  function goTo(s: Section) {
    setActiveSection(s)
    setVisited((prev) => new Set(prev).add(s))
  }

  const ActiveIcon = SECTION_META[activeSection].icon

  return (
    <div className="space-y-5">
      {/* 진행 바 */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>학습 진행</span>
          <span className="tabular-nums">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* PCSMA 탭 — 진행 인지형 */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => {
          const meta = SECTION_META[s]
          const Icon = meta.icon
          const isActive = activeSection === s
          const isVisited = visited.has(s)
          return (
            <button
              key={s}
              onClick={() => goTo(s)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all',
                isActive
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : isVisited
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                  : 'border-white/[0.12] text-slate-400 hover:border-indigo-500/50 hover:text-slate-200'
              )}
            >
              {isVisited && !isActive ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="surface min-h-[16rem] p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <ActiveIcon className="h-4 w-4" />
          </span>
          <h2 className="text-lg font-semibold text-slate-100">
            {SECTION_META[activeSection].heading}
          </h2>
        </div>

        {activeSection === 'P' && (
          <p className="whitespace-pre-wrap leading-relaxed text-slate-300">{content.P}</p>
        )}

        {activeSection === 'C' && (
          <p className="whitespace-pre-wrap leading-relaxed text-slate-300">{content.C}</p>
        )}

        {activeSection === 'S' && (
          <div>
            <p className="mb-4 text-sm text-slate-400">아래 코드를 직접 실행해 보세요.</p>
            <CodeSandbox initialCode={content.S} language="python" />
          </div>
        )}

        {activeSection === 'M' && (
          <p className="whitespace-pre-wrap leading-relaxed text-slate-300">{content.M}</p>
        )}

        {activeSection === 'A' && (
          <div className="space-y-4">
            {content.A.type === 'mcq' ? (
              <MCQQuestion
                stem={content.A.stem}
                options={content.A.options ?? []}
                correctIndex={content.A.answer.index ?? 0}
                rationale={content.A.rationale}
                conceptKey={conceptKey}
                curriculumId={curriculumId}
                variantId={variantId}
                nextUnitId={nextUnitId}
                onNextUnit={() => nextUnitId && router.push(`/learn/${nextUnitId}`)}
                onBackToCurriculum={() => router.push(`/curricula/${curriculumId}`)}
              />
            ) : (
              <CodeQuestion
                stem={content.A.stem}
                expectedAnswer={content.A.answer.code ?? ''}
                rationale={content.A.rationale}
                conceptKey={conceptKey}
                curriculumId={curriculumId}
                variantId={variantId}
                nextUnitId={nextUnitId}
                onNextUnit={() => nextUnitId && router.push(`/learn/${nextUnitId}`)}
                onBackToCurriculum={() => router.push(`/curricula/${curriculumId}`)}
              />
            )}
            <div className="border-t border-white/[0.08] pt-3 text-center">
              <button
                onClick={() => router.push(`/curricula/${curriculumId}`)}
                className="text-sm text-slate-500 transition-colors hover:text-slate-300"
              >
                커리큘럼으로 돌아가기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 네비게이션 */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => activeIdx > 0 && goTo(SECTIONS[activeIdx - 1])}
          disabled={activeIdx === 0}
          className="btn-secondary disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
          이전
        </button>

        <button
          onClick={() => setShowTutor((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.98]',
            showTutor
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
          )}
        >
          <Bot className="h-4 w-4" />
          {showTutor ? '튜터 닫기' : 'AI 튜터'}
        </button>

        {activeSection === 'A' ? (
          nextUnitId ? (
            <button onClick={() => router.push(`/learn/${nextUnitId}`)} className="btn-success">
              다음 유닛
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={() => router.push(`/curricula/${curriculumId}`)} className="btn-primary">
              완료
              <Check className="h-4 w-4" />
            </button>
          )
        ) : (
          <button onClick={() => goTo(SECTIONS[activeIdx + 1])} className="btn-primary">
            다음
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 인라인 AI 튜터 */}
      {showTutor && (
        <div className="surface overflow-hidden animate-fade-in-up">
          <TutorChat
            curriculumId={curriculumId}
            conceptKey={conceptKey}
            unitVariantId={variantId}
            currentSection={activeSection}
          />
        </div>
      )}
    </div>
  )
}
