'use client'

import { useChat } from 'ai/react'
import { Bot, Send } from 'lucide-react'
import type { TutorRequest } from '@/types/api'

interface Props {
  curriculumId: string
  conceptKey: string
  unitVariantId?: string
  currentSection?: 'P' | 'C' | 'S' | 'M' | 'A'
  userCode?: string
  errorMessage?: string
}

export function TutorChat({
  curriculumId,
  conceptKey,
  unitVariantId,
  currentSection,
  userCode,
  errorMessage,
}: Props) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/tutor',
    body: {
      curriculum_id: curriculumId,
      concept_key: conceptKey,
      unit_variant_id: unitVariantId,
      context: {
        current_section: currentSection,
        user_code: userCode,
        error_message: errorMessage,
      },
    } satisfies Partial<TutorRequest>,
  })

  return (
    <div className="flex h-full min-h-80 flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-400">
            <Bot className="h-3.5 w-3.5" />
          </span>
          AI 튜터
        </h3>
        <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[11px] text-indigo-300">
          소크라테스 모드
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-8 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
              <Bot className="h-6 w-6" />
            </span>
            <p className="text-sm text-slate-500">궁금한 것을 물어보세요!</p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-[#334155] text-slate-200 rounded-bl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[#334155] px-4 py-2.5">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-white/[0.08] p-3">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="궁금한 점을 물어보세요..."
          className="flex-1 rounded-lg border border-white/[0.12] bg-[#0F172A]/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3.5 text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-[0.96] disabled:opacity-40"
          aria-label="전송"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
