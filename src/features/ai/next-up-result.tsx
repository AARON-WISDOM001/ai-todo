import { Button } from '../../components/ui/button.tsx'
import { DueDateBadge, PriorityBadge } from '../../components/ui/badge.tsx'
import { EmptyState, InlineMessage } from '../../components/ui/feedback.tsx'
import { cn } from '../../lib/cn.ts'
import { useWorkspace } from '../workspace/workspace-context.tsx'
import type { PrioritizeResponse } from '../../../shared/ai.ts'

/**
 * The "what should I work on next" result.
 *
 * Deliberately read-only. This capability advises; it never reorders, re-prioritises,
 * or completes anything on the user's behalf. The only action is opening the
 * recommended task, which is exactly what the user would have done manually.
 */
export function NextUpResult({
  result,
  onRetry,
  onAskAnother,
}: {
  result: PrioritizeResponse
  onRetry: () => void
  onAskAnother: () => void
}) {
  const { tasks, select, openOverlay } = useWorkspace()

  const byId = new Map(tasks.tasks.map((task) => [task.id, task]))
  const focus = result.focusTaskId ? byId.get(result.focusTaskId) : undefined
  const ordered = result.suggestedOrder.map((id) => byId.get(id)).filter((task) => task !== undefined)
  // Anything the model did not rank still deserves to be reachable below it.
  const ranked = new Set(result.suggestedOrder)
  const rest = tasks.tasks
    .filter((task) => !task.completed && !ranked.has(task.id))
    .slice(0, 5)

  if (!focus && ordered.length === 0) {
    return (
      <div className="pb-5">
        <EmptyState
          compact
          icon={<SparkIcon />}
          title="Nothing to prioritise"
          description={
            result.headline || 'You have no open tasks, so there is nothing to recommend. Add a task and ask again.'
          }
          action={<Button size="sm" onClick={onAskAnother}>Ask about something else</Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3.5 pb-5">
      <div>
        <h3 className="text-sm font-semibold">{result.headline}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{result.reasoning}</p>
      </div>

      {focus && (
        <div className="rounded-lg border border-accent-muted bg-accent-subtle/50 p-3.5">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-accent uppercase">
            Start here
          </p>
          <p className="text-[15px] leading-snug font-medium">{focus.title}</p>
          {focus.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{focus.description}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <PriorityBadge priority={focus.priority} />
            <DueDateBadge dueDate={focus.dueDate} />
          </div>
          <Button
            size="sm"
            variant="primary"
            className="mt-3"
            onClick={() => {
              select(focus.id)
              openOverlay({ kind: 'editor', taskId: focus.id })
            }}
          >
            Open task
          </Button>
        </div>
      )}

      {ordered.length > 0 && (
        <section>
          <h4 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-tertiary uppercase">
            Suggested order
          </h4>
          <ol className="space-y-0.5">
            {ordered.map((task, index) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => {
                    select(task.id)
                    openOverlay({ kind: 'editor', taskId: task.id })
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left',
                    'transition-colors hover:bg-surface-sunken',
                  )}
                >
                  <span className="tabular w-4 shrink-0 text-right text-xs text-ink-tertiary">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{task.title}</span>
                  <PriorityBadge priority={task.priority} />
                  <DueDateBadge dueDate={task.dueDate} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-ink-tertiary uppercase">
            Also open
          </h4>
          <ul className="space-y-0.5">
            {rest.map((task) => (
              <li key={task.id} className="flex items-center gap-2.5 px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-secondary">{task.title}</span>
                <PriorityBadge priority={task.priority} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <InlineMessage
        tone="info"
        title="This is advice, not an action"
        description="Nothing was changed. Apply anything you agree with yourself."
      />

      <div className="flex justify-end gap-2 border-t border-line pt-3.5">
        <Button size="sm" onClick={onAskAnother}>
          Close
        </Button>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Ask again
        </Button>
      </div>
    </div>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M8.5 2.5l1.4 3.85 3.85 1.4-3.85 1.4-1.4 3.85-1.4-3.85L3.25 7.75l3.85-1.4z" />
    </svg>
  )
}
