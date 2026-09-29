import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '../../components/ui/button.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Field, Select, TextArea, TextInput } from '../../components/ui/field.tsx'
import { InlineMessage } from '../../components/ui/feedback.tsx'
import { TaskCheckbox } from '../../components/ui/task-checkbox.tsx'
import { AiBadge, PRIORITY_META } from '../../components/ui/badge.tsx'
import { PRIORITIES, type Priority } from '../../../shared/task.ts'
import { isValidDateKey } from '../../../shared/dates.ts'
import { useWorkspace } from '../workspace/workspace-context.tsx'

interface DraftState {
  title: string
  description: string
  priority: Priority
  dueDate: string
  subtasks: string[]
}

const EMPTY_DRAFT: DraftState = {
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
  subtasks: [],
}

/**
 * The task editor.
 *
 * Doubles as the task detail view: it is opened by clicking a row's title, so
 * showing the full editable record — rather than a read-only panel beside the
 * list — keeps the list width stable and works identically on mobile.
 */
export function TaskEditorDialog() {
  const { overlay, closeOverlay, tasks, openOverlay, select } = useWorkspace()
  const isOpen = overlay.kind === 'editor'
  const taskId = overlay.kind === 'editor' ? overlay.taskId : null
  const task = taskId ? tasks.getTask(taskId) : undefined

  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [newSubtask, setNewSubtask] = useState('')

  // Re-seed the form whenever a different task is opened, so a cancelled edit
  // never leaks into the next one.
  useEffect(() => {
    if (!task) {
      setDraft(EMPTY_DRAFT)
      return
    }
    setDraft({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate ?? '',
      subtasks: task.subtasks.map((subtask) => subtask.title),
    })
    setError(null)
    setNewSubtask('')
  }, [task?.id])

  if (!isOpen) return null

  const titleError = draft.title.trim().length === 0 ? 'A task needs a title.' : null
  const dateError = draft.dueDate !== '' && !isValidDateKey(draft.dueDate) ? 'Enter a valid date.' : null

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (titleError || dateError) {
      setError(titleError ?? dateError)
      return
    }
    if (!taskId) return

    tasks.updateTask(taskId, {
      title: draft.title.trim(),
      description: draft.description.trim(),
      priority: draft.priority,
      dueDate: draft.dueDate === '' ? null : draft.dueDate,
      subtasks: draft.subtasks,
    })
    closeOverlay()
  }

  const addSubtask = () => {
    const title = newSubtask.trim()
    if (title.length === 0) return
    setDraft((current) => ({ ...current, subtasks: [...current.subtasks, title] }))
    setNewSubtask('')
  }

  return (
    <Dialog
      open={isOpen}
      onClose={closeOverlay}
      title={task ? 'Task details' : 'Task'}
      hideTitle
      closeOnBackdrop={false}
      footer={
        <>
          {task && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                tasks.removeTask(task.id)
                select(null)
                closeOverlay()
              }}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button size="sm" onClick={closeOverlay}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={onSubmit} form="task-editor-form">
            Save changes
          </Button>
        </>
      }
    >
      {task && (
        <form id="task-editor-form" onSubmit={onSubmit} className="space-y-4 pb-5">
          <div className="flex items-center gap-2.5">
            <TaskCheckbox
              checked={task.completed}
              onChange={() => tasks.toggleTask(task.id)}
              label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
            />
            <p className="text-[13px] text-ink-secondary">
              {task.completed ? 'Completed' : 'Not completed'}
            </p>
            {task.source === 'ai' && <AiBadge className="ml-auto" label="AI generated" />}
          </div>

          <Field label="Title" htmlFor="task-title" error={titleError ?? undefined}>
            <TextInput
              id="task-title"
              value={draft.title}
              maxLength={200}
              invalid={Boolean(titleError)}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="task-description"
            hint="What does done look like?"
          >
            <TextArea
              id="task-description"
              value={draft.description}
              maxLength={2000}
              rows={3}
              placeholder="Add context, acceptance criteria, or links."
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" htmlFor="task-priority">
              <Select
                id="task-priority"
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, priority: event.target.value as Priority }))
                }
              >
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_META[value].label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Due date" htmlFor="task-due" error={dateError ?? undefined}>
              <input
                id="task-due"
                type="date"
                value={draft.dueDate}
                min="2000-01-01"
                onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
              />
            </Field>
          </div>

          <Field
            label="Subtasks"
            htmlFor="task-subtask"
            hint="Replacing the list on save. Progress bars update automatically."
          >
            <ul className="space-y-1.5">
              {task.subtasks.map((subtask) => (
                <li key={subtask.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 hover:bg-surface-sunken">
                    <TaskCheckbox
                      checked={subtask.completed}
                      onChange={() => tasks.toggleSubtask(task.id, subtask.id)}
                      label={`Mark subtask "${subtask.title}" as ${subtask.completed ? 'not done' : 'done'}`}
                    />
                    <span
                      className={
                        subtask.completed
                          ? 'text-[13px] text-ink-tertiary line-through'
                          : 'text-[13px] text-ink'
                      }
                    >
                      {subtask.title}
                    </span>
                  </label>
                </li>
              ))}
              {draft.subtasks
                .filter((title) => !task.subtasks.some((subtask) => subtask.title === title))
                .map((title, index) => (
                  <li key={`new-${index}`} className="flex items-center gap-2.5 px-1 py-1">
                    <span className="size-[18px] rounded-[5px] border border-line-strong" aria-hidden="true" />
                    <span className="text-[13px] text-ink-secondary">{title}</span>
                  </li>
                ))}
            </ul>

            <div className="mt-1.5 flex gap-1.5">
              <TextInput
                id="task-subtask"
                value={newSubtask}
                placeholder="Add a subtask"
                maxLength={200}
                onChange={(event) => setNewSubtask(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addSubtask()
                  }
                }}
                className="h-10 text-[16px] sm:h-9 sm:text-sm"
              />
              <Button size="sm" onClick={addSubtask} disabled={newSubtask.trim().length === 0} className="h-10 shrink-0 px-3 sm:h-7">
                Add
              </Button>
            </div>
          </Field>

          <div className="flex flex-wrap gap-2 border-t border-line pt-3.5">
            <Button
              size="sm"
              onClick={() => openOverlay({ kind: 'command', action: 'improve', taskId: task.id })}
            >
              <SparkIcon />
              Make this clearer
            </Button>
            <Button
              size="sm"
              onClick={() => openOverlay({ kind: 'command', action: 'breakdown', taskId: task.id })}
            >
              <StepsIcon />
              Break into steps
            </Button>
          </div>

          {error && <InlineMessage tone="error" title={error} />}
        </form>
      )}
    </Dialog>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-accent" fill="currentColor" aria-hidden="true">
      <path d="M6.5 2l1.05 2.85L10.4 5.9 7.55 6.95 6.5 9.8 5.45 6.95 2.6 5.9 5.45 4.85z" />
    </svg>
  )
}

function StepsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
