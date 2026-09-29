import { useState } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { TextInput } from '../../components/ui/field.tsx'
import { AiBadge, DueDateBadge, PriorityBadge } from '../../components/ui/badge.tsx'
import { InlineMessage } from '../../components/ui/feedback.tsx'
import { formatDueDate } from '../../../shared/dates.ts'
import type { TaskProposal } from '../../../shared/ai.ts'

/** A proposal plus the reviewer's per-item decisions. */
export interface DraftProposal extends TaskProposal {
  key: string
  selected: boolean
}

export function toDraftProposals(tasks: TaskProposal[]): DraftProposal[] {
  return tasks.map((task, index) => ({ ...task, key: `p${index}`, selected: true }))
}

/**
 * Review step for natural-language task creation.
 *
 * This is the confirmation boundary the whole AI design rests on. The model
 * proposed these tasks; nothing has been saved. The user can drop items, retitle
 * them, and only then commit — so a misread instruction costs a click, not a
 * messy task list.
 */
export function CreateProposalReview({
  proposals,
  notes,
  onChange,
  onConfirm,
  onCancel,
  onRetry,
}: {
  proposals: DraftProposal[]
  notes: string | null
  onChange: (proposals: DraftProposal[]) => void
  onConfirm: (proposals: DraftProposal[]) => void
  onCancel: () => void
  onRetry: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const selectedCount = proposals.filter((proposal) => proposal.selected).length
  const allSelected = selectedCount === proposals.length

  const patch = (key: string, changes: Partial<DraftProposal>) => {
    onChange(proposals.map((proposal) => (proposal.key === key ? { ...proposal, ...changes } : proposal)))
  }

  const toggleAll = () => {
    const next = !allSelected
    onChange(proposals.map((proposal) => ({ ...proposal, selected: next })))
  }

  return (
    <div className="space-y-3.5 pb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {proposals.length === 1 ? '1 task ready to add' : `${proposals.length} tasks ready to add`}
          </h3>
          <p className="text-[13px] text-ink-secondary">Nothing is saved until you confirm.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={toggleAll}>
          {allSelected ? 'Clear all' : 'Select all'}
        </Button>
      </div>

      {notes && (
        <InlineMessage tone="info" title="From the AI" description={notes} />
      )}

      <ul className="space-y-1.5">
        {proposals.map((proposal) => {
          const due = proposal.dueDate ? formatDueDate(proposal.dueDate) : null
          const isOpen = expanded === proposal.key

          return (
            <li
              key={proposal.key}
              className={`rounded-lg border transition-colors ${
                proposal.selected ? 'border-line bg-surface' : 'border-line bg-surface-sunken/50'
              }`}
            >
              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={proposal.selected}
                  onClick={() => patch(proposal.key, { selected: !proposal.selected })}
                  className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
                    proposal.selected
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line-strong bg-surface hover:border-accent'
                  }`}
                >
                  {proposal.selected && (
                    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
                      <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  {proposal.selected ? (
                    <TextInput
                      value={proposal.title}
                      maxLength={120}
                      aria-label={`Title for proposed task ${proposals.indexOf(proposal) + 1}`}
                      onChange={(event) => patch(proposal.key, { title: event.target.value })}
                      className="h-8 font-medium"
                    />
                  ) : (
                    <p className="truncate py-1 text-[13px] text-ink-tertiary line-through">{proposal.title}</p>
                  )}

                  {proposal.description && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-secondary">
                      {proposal.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <PriorityBadge priority={proposal.priority} />
                    {proposal.dueDate && <DueDateBadge dueDate={proposal.dueDate} />}
                    {due?.relative && <span className="text-xs text-ink-tertiary">{due.relative}</span>}
                    <AiBadge />
                  </div>

                  {proposal.rationale && (
                    <div className="mt-2">
                      {isOpen ? (
                        <p className="text-xs leading-relaxed text-ink-secondary">{proposal.rationale}</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded(proposal.key)}
                          className="text-xs text-ink-tertiary underline decoration-line underline-offset-2 transition-colors hover:text-ink-secondary"
                        >
                          Why?
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {proposals.some((proposal) => !proposal.title.trim()) && (
        <InlineMessage
          tone="error"
          title="One or more titles are empty"
          description="Give them a name, or uncheck them to skip."
        />
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3.5">
        <Button size="sm" onClick={onCancel}>
          Discard
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Try again
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={selectedCount === 0 || proposals.some((p) => p.selected && !p.title.trim())}
            onClick={() => onConfirm(proposals.filter((proposal) => proposal.selected))}
          >
            Add {selectedCount === 1 ? '1 task' : `${selectedCount} tasks`}
          </Button>
        </div>
      </div>
    </div>
  )
}
