'use client'

import { Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'

export function SubmitButton({
  label,
  pendingLabel
}: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-white bg-white px-4 py-3 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_14px_35px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(139,92,246,0.28)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  )
}
