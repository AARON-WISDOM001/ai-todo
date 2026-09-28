import { Button } from '../../components/ui/button.tsx'
import { AiBadge } from '../../components/ui/badge.tsx'
import { InlineMessage } from '../../components/ui/feedback.tsx'
import type { ImproveResponse } from '../../../shared/ai.ts'

/**
 * Before/after review for task improvement.
 *
 * Shown side by side rather than as a silent overwrite: the point of this
 * capability is helping the user judge *why* a rewrite is better, which is
 * impossible if the original disappears.
 */
export function ImproveReview({
  original,
  proposal,
  onApply,
  onCancel,
  onRetry,
}: {
  original: { title: string; description: string }
  proposal: ImproveResponse
  onApply: (proposal: ImproveResponse) => void
  onCancel: () => void
  onRetry: () => void
}) {
  const titleChanged = proposal.title.trim() !== original.title.trim()
  const descriptionChanged = proposal.description.trim() !== original.description.trim()

  return (
    <div className="space-y-3.5 pb-5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Suggested rewrite</h3>
        {!titleChanged && !descriptionChanged && (
          <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-secondary">
            Already clear
          </span>
        )}
      </div>

      {proposal.rationale && <InlineMessage tone="info" title="Why" description={proposal.rationale} />}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <ComparisonPane label="Your version" tone="muted">
          <p className="text-[13px] font-medium">{original.title}</p>
          {original.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{original.description}</p>
          )}
        </ComparisonPane>

        <ComparisonPane label="AI version" tone="accent">
          <p className="flex items-start gap-1.5 text-[13px] font-medium">
            {titleChanged && <AiBadge className="mt-px" />}
            {proposal.title}
          </p>
          {proposal.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{proposal.description}</p>
          )}
        </ComparisonPane>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3.5">
        <Button size="sm" onClick={onCancel}>
          Keep mine
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Try again
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!titleChanged && !descriptionChanged}
            onClick={() => onApply(proposal)}
          >
            Apply rewrite
          </Button>
        </div>
      </div>
    </div>
  )
}

function ComparisonPane({
  label,
  tone,
  children,
}: {
  label: string
  tone: 'muted' | 'accent'
  children: React.ReactNode
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'accent' ? 'border-accent-muted bg-accent-subtle/40' : 'border-line bg-surface-sunken/40'
      }`}
    >
      <p
        className={`mb-2 text-[11px] font-semibold tracking-[0.06em] uppercase ${
          tone === 'accent' ? 'text-accent' : 'text-ink-tertiary'
        }`}
      >
        {label}
      </p>
      {children}
    </div>
  )
}
