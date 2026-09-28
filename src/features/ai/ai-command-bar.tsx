import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Button, Spinner } from '../../components/ui/button.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Kbd } from '../../components/ui/badge.tsx'
import { InlineMessage, SkeletonRows } from '../../components/ui/feedback.tsx'
import { cn } from '../../lib/cn.ts'
import { AI_ACTION_LABELS, type AiAction, type ImproveResponse } from '../../../shared/ai.ts'
import { todayKey } from '../../../shared/dates.ts'
import { useWorkspace } from '../workspace/workspace-context.tsx'
import {
  AiRequestError,
  breakDownTask,
  createTasks,
  improveTask,
  prioritizeTasks,
} from './ai-client.ts'
import { CreateProposalReview, toDraftProposals, type DraftProposal } from './create-proposal-review.tsx'
import { BreakdownReview, toDraftSteps, type BreakdownTarget, type DraftStep } from './breakdown-review.tsx'
import { ImproveReview } from './improve-review.tsx'
import { NextUpResult } from './next-up-result.tsx'
import type { PrioritizeResponse } from '../../../shared/ai.ts'

/** The command bar's state machine. One discriminated union, no impossible states. */
type CommandState =
  | { status: 'idle' }
  | { status: 'loading'; action: AiAction }
  | { status: 'failed'; action: AiAction; message: string; retryable: boolean }
  | { status: 'create-review'; proposals: DraftProposal[]; notes: string | null; input: string }
  | { status: 'breakdown-review'; taskId: string; steps: DraftStep[]; notes: string | null }
  | { status: 'improve-review'; taskId: string; proposal: ImproveResponse }
  | { status: 'prioritize-result'; result: PrioritizeResponse }
  | { status: 'not-configured' }

const EXAMPLES: Record<AiAction, string[]> = {
  create: [
    'Submit my internship report next Friday and make it high priority',
    'Plan my AI engineering internship tasks for this week',
    'Email the supervisor tomorrow, then book a project review for next week',
  ],
  breakdown: ['Build my AI portfolio', 'Write the deployment section of my report'],
  prioritize: [],
  improve: ['Portfolio', 'Do the thing with the API'],
}

/** Copy shown before the user has typed anything. */
const PLACEHOLDERS: Record<AiAction, string> = {
  create: 'Describe what you need to get done, in your own words…',
  breakdown: 'Paste the task you want broken into steps…',
  prioritize: 'Review your open tasks and tell me what to do next',
  improve: 'Paste a rough task and make it clearer…',
}

export function AiCommandBar() {
  const { overlay, closeOverlay, openOverlay, tasks } = useWorkspace()

  const isCommand = overlay.kind === 'command'
  const action: AiAction = isCommand ? overlay.action : 'create'
  const sourceTaskId = isCommand ? overlay.taskId : undefined
  const sourceTask = sourceTaskId ? tasks.getTask(sourceTaskId) : undefined

  const [state, setState] = useState<CommandState>({ status: 'idle' })
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Reset whenever the surface opens, so it never reopens mid-conversation.
  useEffect(() => {
    if (!isCommand) return
    setState({ status: 'idle' })
    setInput('')
  }, [isCommand, action, sourceTaskId])

  const dateContext = useMemo(
    () => ({ today: todayKey(), timezone: resolveTimezone() }),
    [],
  )

  /* ---------------------------------------------------------------------- */
  /*  Request handlers                                                       */
  /* ---------------------------------------------------------------------- */

  const runCreate = useCallback(
    async (value: string) => {
      setState({ status: 'loading', action: 'create' })
      try {
        const data = await createTasks({ input: value, ...dateContext })
        setState({
          status: 'create-review',
          proposals: toDraftProposals(data.tasks),
          notes: data.notes,
          input: value,
        })
      } catch (error) {
        setState(toFailure('create', error))
      }
    },
    [dateContext],
  )

  const runBreakdown = useCallback(
    async (taskId: string) => {
      const task = tasks.getTask(taskId)
      if (!task) {
        setState({ status: 'failed', action: 'breakdown', message: 'That task no longer exists.', retryable: false })
        return
      }
      setState({ status: 'loading', action: 'breakdown' })
      try {
        const data = await breakDownTask({
          taskId: task.id,
          title: task.title,
          description: task.description || undefined,
          dueDate: task.dueDate,
          ...dateContext,
        })
        setState({
          status: 'breakdown-review',
          taskId: task.id,
          steps: toDraftSteps(data.steps),
          notes: data.notes,
        })
      } catch (error) {
        setState(toFailure('breakdown', error))
      }
    },
    [dateContext, tasks],
  )

  const runPrioritize = useCallback(async () => {
    setState({ status: 'loading', action: 'prioritize' })
    try {
      const data = await prioritizeTasks({
        tasks: tasks.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          priority: task.priority,
          dueDate: task.dueDate,
          completed: task.completed,
          remainingSubtasks: task.subtasks.filter((subtask) => !subtask.completed).length,
        })),
        ...dateContext,
      })
      setState({ status: 'prioritize-result', result: data })
    } catch (error) {
      setState(toFailure('prioritize', error))
    }
  }, [dateContext, tasks.tasks])

  const runImprove = useCallback(
    async (taskId: string) => {
      const task = tasks.getTask(taskId)
      if (!task) {
        setState({ status: 'failed', action: 'improve', message: 'That task no longer exists.', retryable: false })
        return
      }
      setState({ status: 'loading', action: 'improve' })
      try {
        const data = await improveTask({
          title: task.title,
          description: task.description || undefined,
          ...dateContext,
        })
        setState({ status: 'improve-review', taskId: task.id, proposal: data })
      } catch (error) {
        setState(toFailure('improve', error))
      }
    },
    [dateContext, tasks],
  )

  /* ---------------------------------------------------------------------- */
  /*  Submission                                                             */
  /* ---------------------------------------------------------------------- */

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const value = input.trim()
    if (value.length === 0) return

    if (action === 'create') void runCreate(value)
    else if (action === 'breakdown' && sourceTaskId) void runBreakdown(sourceTaskId)
    else if (action === 'improve' && sourceTaskId) void runImprove(sourceTaskId)
  }

  const retry = () => {
    if (action === 'prioritize') {
      void runPrioritize()
      return
    }
    if (action === 'breakdown' && sourceTaskId) {
      void runBreakdown(sourceTaskId)
      return
    }
    if (action === 'improve' && sourceTaskId) {
      void runImprove(sourceTaskId)
      return
    }
    const value = input.trim()
    if (value.length > 0) void runCreate(value)
  }

  /* ---------------------------------------------------------------------- */
  /*  Commit — the only place AI output becomes real data                   */
  /* ---------------------------------------------------------------------- */

  const commitCreate = (proposals: DraftProposal[]) => {
    tasks.addTasks(
      proposals.map((proposal) => ({
        title: proposal.title.trim(),
        description: proposal.description.trim(),
        priority: proposal.priority,
        dueDate: proposal.dueDate,
        source: 'ai',
      })),
    )
    closeOverlay()
  }

  const commitBreakdown = (steps: DraftStep[], target: BreakdownTarget) => {
    const titles = steps.map((step) => step.title.trim()).filter(Boolean)
    if (target === 'subtasks') {
      const task = tasks.getTask(state.status === 'breakdown-review' ? state.taskId : '')
      if (task) {
        tasks.updateTask(task.id, { subtasks: [...task.subtasks.map((s) => s.title), ...titles] })
      }
    } else {
      const parent = tasks.getTask(state.status === 'breakdown-review' ? state.taskId : '')
      tasks.addTasks(
        titles.map((title) => ({
          title,
          // Steps inherit the parent's urgency, which is the whole reason to
          // break a task down rather than starting a fresh one.
          priority: parent?.priority ?? 'medium',
          dueDate: parent?.dueDate ?? null,
          source: 'ai',
        })),
      )
    }
    closeOverlay()
  }

  const commitImprove = (proposal: ImproveResponse) => {
    if (state.status !== 'improve-review') return
    tasks.updateTask(state.taskId, {
      title: proposal.title.trim(),
      description: proposal.description.trim(),
    })
    closeOverlay()
  }

  const switchAction = (next: AiAction) => {
    setState({ status: 'idle' })
    setInput('')
    openOverlay(
      next === 'breakdown' || next === 'improve'
        ? sourceTaskId
          ? { kind: 'command', action: next, taskId: sourceTaskId }
          : { kind: 'command', action: next }
        : { kind: 'command', action: next },
    )
  }

  if (!isCommand) return null

  const isBusy = state.status === 'loading'
  const canSubmit =
    (action === 'prioritize' && !isBusy) ||
    ((action === 'create' && input.trim().length > 0 && !isBusy) ||
      ((action === 'breakdown' || action === 'improve') && Boolean(sourceTask) && !isBusy))

  const showForm =
    state.status === 'idle' ||
    state.status === 'loading' ||
    state.status === 'failed' ||
    state.status === 'not-configured'

  return (
    <Dialog
      open={isCommand}
      onClose={closeOverlay}
      position="top"
      title={`${AI_ACTION_LABELS[action]} with AI`}
      hideTitle
      className="max-w-2xl"
    >
      <div className="mb-3.5 flex items-center gap-1 rounded-lg bg-surface-sunken p-1">
        {(['create', 'breakdown', 'prioritize', 'improve'] as AiAction[]).map((candidate) => {
          const selected = candidate === action
          // Modes that operate on a specific task are disabled without one.
          const needsTask = candidate === 'breakdown' || candidate === 'improve'
          const disabled = needsTask && !sourceTaskId

          return (
            <button
              key={candidate}
              type="button"
              disabled={disabled}
              title={disabled ? 'Open a task first' : undefined}
              onClick={() => switchAction(candidate)}
              aria-pressed={selected}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors duration-150',
                selected
                  ? 'bg-surface text-ink shadow-raised'
                  : 'text-ink-secondary hover:text-ink',
                disabled && 'cursor-not-allowed opacity-40 hover:text-ink-secondary',
              )}
            >
              {AI_ACTION_LABELS[candidate]}
            </button>
          )
        })}
      </div>

      {showForm && (
        <form onSubmit={submit} className="pb-1">
          <label htmlFor="ai-command-input" className="sr-only">
            {PLACEHOLDERS[action]}
          </label>
          <div
            className={cn(
              'rounded-lg border bg-surface transition-colors duration-150',
              'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15',
              isBusy ? 'border-line' : 'border-line',
            )}
          >
            <textarea
              ref={inputRef}
              id="ai-command-input"
              value={input}
              readOnly={isBusy || action !== 'create'}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  submit()
                }
              }}
              rows={action === 'create' ? 3 : 2}
              maxLength={2000}
              placeholder={PLACEHOLDERS[action]}
              aria-describedby="ai-command-hint"
              className="w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-relaxed placeholder:text-ink-tertiary focus:outline-none read-only:text-ink-secondary"
            />
          </div>

          <p id="ai-command-hint" className="mt-1.5 text-xs text-ink-tertiary">
            {action === 'create' && 'Describe one or more tasks. You will review them before anything is added.'}
            {action === 'breakdown' && `Breaking down “${sourceTask?.title ?? 'task'}”. You will pick which steps to keep.`}
            {action === 'improve' && `Rewriting “${sourceTask?.title ?? 'task'}”. Nothing changes until you apply it.`}
            {action === 'prioritize' && `Reviewing ${tasks.stats.remaining} open ${tasks.stats.remaining === 1 ? 'task' : 'tasks'}. Nothing is changed.`}
          </p>

          {action === 'create' && !isBusy && input.trim().length === 0 && EXAMPLES.create.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1.5 text-[11px] font-semibold tracking-[0.06em] text-ink-tertiary uppercase">
                Try
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.create.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setInput(example)
                      inputRef.current?.focus()
                    }}
                    className="max-w-full truncate rounded-md border border-line bg-surface px-2 py-1 text-left text-xs text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isBusy && <LoadingPanel action={action} />}

          {state.status === 'failed' && (
            <InlineMessage
              className="mt-3"
              tone="error"
              title={state.retryable ? 'The AI request did not go through' : 'That request could not run'}
              description={state.message}
              action={
                state.retryable ? (
                  <Button size="sm" onClick={retry}>
                    Try again
                  </Button>
                ) : undefined
              }
            />
          )}

          {state.status === 'not-configured' && (
            <InlineMessage
              className="mt-3"
              tone="error"
              title="AI is not configured"
              description="The server is missing its API key. Everything else in the app still works."
            />
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-tertiary">
              <Kbd>⌘</Kbd> <Kbd>↵</Kbd> to run
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={closeOverlay}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={!canSubmit}
                loading={isBusy}
                onClick={action === 'prioritize' ? () => void runPrioritize() : undefined}
              >
                {action === 'prioritize' ? 'Ask AI' : 'Preview'}
              </Button>
            </div>
          </div>
        </form>
      )}

      {state.status === 'create-review' && (
        <CreateProposalReview
          proposals={state.proposals}
          notes={state.notes}
          onChange={(proposals) => setState({ ...state, proposals })}
          onConfirm={commitCreate}
          onCancel={closeOverlay}
          onRetry={() => void runCreate(state.input)}
        />
      )}

      {state.status === 'breakdown-review' && (
        <BreakdownReview
          taskTitle={tasks.getTask(state.taskId)?.title ?? 'this task'}
          steps={state.steps}
          notes={state.notes}
          onChange={(steps) => setState({ ...state, steps })}
          onConfirm={commitBreakdown}
          onCancel={closeOverlay}
          onRetry={() => void runBreakdown(state.taskId)}
        />
      )}

      {state.status === 'improve-review' && sourceTask && (
        <ImproveReview
          original={{ title: sourceTask.title, description: sourceTask.description }}
          proposal={state.proposal}
          onApply={commitImprove}
          onCancel={closeOverlay}
          onRetry={() => void runImprove(state.taskId)}
        />
      )}

      {state.status === 'prioritize-result' && (
        <NextUpResult
          result={state.result}
          onRetry={() => void runPrioritize()}
          onAskAnother={closeOverlay}
        />
      )}
    </Dialog>
  )
}

/**
 * Loading panel.
 *
 * Names the step that is happening rather than showing an anonymous spinner, so
 * a slow request is legible instead of just slow. Skeleton rows imply the shape
 * of the answer that is coming.
 */
function LoadingPanel({ action }: { action: AiAction }) {
  const copy = {
    create: 'Reading your instruction and extracting tasks…',
    breakdown: 'Working out the steps…',
    prioritize: 'Reviewing your open tasks…',
    improve: 'Rewriting this task…',
  }[action]

  return (
    <div className="mt-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
        <Spinner size={13} className="text-accent" />
        {copy}
      </div>
      {action === 'prioritize' ? (
        <div className="mt-3 space-y-1.5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-8" style={{ opacity: 1 - index * 0.22 }} />
          ))}
        </div>
      ) : (
        <SkeletonRows count={3} className="mt-2" />
      )}
    </div>
  )
}

function toFailure(action: AiAction, error: unknown): CommandState {
  if (error instanceof AiRequestError) {
    if (error.code === 'not_configured') return { status: 'not-configured' }
    return { status: 'failed', action, message: error.message, retryable: error.retryable }
  }
  return {
    status: 'failed',
    action,
    message: 'Something unexpected happened. Please try again.',
    retryable: true,
  }
}

/** The IANA timezone, so the model resolves "tomorrow" against local time. */
function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
