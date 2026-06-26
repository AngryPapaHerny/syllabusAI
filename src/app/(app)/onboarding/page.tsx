import { OnboardingForm } from '@/components/onboarding/OnboardingForm'

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-xl animate-fade-in-up">
      <h1 className="text-2xl font-bold text-slate-100">나만의 커리큘럼을 만들어보세요</h1>
      <p className="mt-2 text-slate-400">
        AI가 당신의 목표와 수준에 맞는 학습 경로를 설계합니다.
      </p>
      <div className="surface mt-8 p-6 sm:p-8">
        <OnboardingForm />
      </div>
    </div>
  )
}
