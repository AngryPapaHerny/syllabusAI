interface Props {
  value: number
  max: number
  label?: string
}

export function ProgressBar({ value, max, label }: Props) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0

  return (
    <div>
      {label && (
        <div className="mb-1.5 flex justify-between text-sm text-slate-400">
          <span>{label}</span>
          <span className="font-medium text-indigo-400">{percent}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
