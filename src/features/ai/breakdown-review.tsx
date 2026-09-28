import { useState } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { TextInput } from '../../components/ui/field.tsx'
import { InlineMessage } from '../../components/ui/feedback.tsx'
import type { BreakdownStep } from '../../../shared/ai.ts'

export interface DraftStep extends BreakdownStep {
  key: string
  selected: boolean
}

export function toDraftSteps(steps: BreakdownStep[]): DraftStep[] {
  return steps.map((step, index) => ({ ...step, key: `s${index}`, selected: true }))
}

/** Where the chosen steps should land. */
export type BreakdownTarget = 'subtasks' | 'tasks'

/**
 * Review step for task breakdown.
 *
 * The user picks which steps they actually want, and chooses whether they
 * become subtasks of the parent or standalone tasks. Both are legitimate
 * workflows — a breakdown is a suggestion, not an instruction.
 */
export function BreakdownReview({
  taskTitle,
  steps,
  notes,
  onChange,
  onConfirm,
  onCancel,
  onRetry,
}: {
  taskTitle: string
  steps: DraftStep[]
  notes: string | null
  onChange: (steps: DraftStep[]) => void
  onConfirm: (steps: DraftStep[], target: BreakdownTarget) => void
  onCancel: () => void
  onRetry: () => void
}) {
  const [target, setTarget] = useState<BreakdownTarget>('subtasks')
  const selectedCount = steps.filter((step) => step.selected).length
  const allSelected = selectedCount === steps.length

  const patch = (key: string, changes: Partial<DraftStep>) => {
    onChange(steps.map((step) => (step.key === key ? { ...step, ...changes } : step)))
  }

  return (
    <div className="space-y-3.5 pb-5">
      <div>
        <h3 className="text-sm font-semibold">
          {steps.length === 1 ? '1 step' : `${steps.length} steps`} to work through
        </h3>
        <p className="text-[13px] text-ink-secondary">
          For “{taskTitle}”. Nothing is saved until you confirm.
        </p>
      </div>

      {notes && <InlineMessage tone="info" title="From the AI" description={notes} />}

      <ol className="space-y-1.5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
              step.selected ? 'border-line bg-surface' : 'border-line bg-surface-sunken/50'
            }`}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={step.selected}
              onClick={() => patch(step.key, { selected: !step.selected })}
              className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border text-[11px] font-semibold transition-colors ${
                step.selected
                  ? 'border-accent bg-accent text-white'
                  : 'border-line-strong bg-surface text-ink-tertiary hover:border-accent'
              }`}
            >
              {step.selected ? (
                <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
                  <path d="M2.5 6.2 4.8 8.5 9.5 3.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                index + 1
              )}
            </button>

            <div className="min-w-0 flex-1">
              {step.selected ? (
                <TextInput
                  value={step.title}
                  maxLength={160}
                  aria-label={`Step ${index + 1}`}
                  onChange={(event) => patch(step.key, { title: event.target.value })}
                  className="h-8"
                />
              ) : (
                <p className="truncate py-1 text-[13px] text-ink-tertiary line-through">{step.title}</p>
              )}
              {step.rationale && <p className="mt-1 text-xs text-ink-tertiary">{step.rationale}</p>}
            </div>
          </li>
        ))}
      </ol>

      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 text-xs font-medium text-ink-secondary">Add them as</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <TargetOption
            checked={target === 'subtasks'}
            onSelect={() => setTarget('subtasks')}
            title="Subtasks"
            description={`Attached to “${taskTitle}”`}
          />
          <TargetOption
            checked={target === 'tasks'}
            onSelect={() => setTarget('tasks')}
            title="Separate tasks"
            description="Each gets its own due date"
          />
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3.5">
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={onCancel}>
            Discard
          </Button>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            Try again
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange(steps.map((step) => ({ ...step, selected: !allSelected })))
            }
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={selectedCount === 0 || steps.some((step) => step.selected && !step.title.trim())}
            onClick={() => onConfirm(steps.filter((step) => step.selected), target)}
          >
            Add {selectedCount === 1 ? `${target === 'subtasks' ? 'subtask' : 'task'}` : `${selectedCount} ${target}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TargetOption({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  description: string
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-2 transition-colors ${
        checked ? 'border-accent bg-accent-subtle/60' : 'border-line hover:bg-surface-sunken'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <input
          type="radio"
          checked={checked}
          onChange={onSelect}
          className="size-3 accent-[var(--color-accent)]"
        />
        <span className="text-[13px] font-medium">{title}</span>
      </span>
      <span className="truncate text-xs text-ink-tertiary">{description}</span>
    </label>
  )
}
