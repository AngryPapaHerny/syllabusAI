'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const OnboardingSchema = z.object({
  goal_text: z.string().min(10).max(500),
  domain: z.enum(['coding', 'general']).default('coding'),
  level_target: z.enum(['beginner', 'intermediate', 'advanced']),
  time_budget_hours_per_week: z.coerce.number().int().min(1).max(40),
})

export async function createCurriculumAction(formData: FormData) {
  const raw = {
    goal_text: formData.get('goal_text'),
    domain: formData.get('domain') ?? 'coding',
    level_target: formData.get('level_target'),
    time_budget_hours_per_week: formData.get('time_budget_hours_per_week'),
  }

  const parsed = OnboardingSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: curriculum, error: insertError } = await supabase
    .from('curricula')
    .insert({
      owner_id: user.id,
      ...parsed.data,
      status: 'generating',
    })
    .select()
    .single()

  if (insertError || !curriculum) {
    return { error: 'Failed to create curriculum' }
  }

  // gen_jobs 큐 적재
  await supabase.from('gen_jobs').insert({
    type: 'curriculum_calibration',
    payload: {
      curriculum_id: curriculum.id,
      ...parsed.data,
      owner_id: user.id,
    },
    status: 'queued',
    priority: 1,
  })

  redirect(`/curricula/${curriculum.id}/generating`)
}
