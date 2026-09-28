/**
 * System prompts for each AI capability.
 *
 * The response *shape* is enforced by the JSON schema, so these prompts spend
 * their words on the things a schema cannot express: how to resolve relative
 * dates, how aggressive to be about inferring deadlines, and what makes a task
 * title actually actionable.
 *
 * Two rules are repeated in every prompt because they are the two failure modes
 * that actually matter for a task manager:
 *   - Resolve relative dates against the injected `today`, never against an
 *     assumed current date.
 *   - Do not invent a deadline the user did not imply. A missing due date is
 *     better than a fabricated one.
 */

import { parseDateKey } from '../../shared/dates.ts'

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const SHARED_RULES = `
Output rules:
- Reply with JSON matching the required schema. No prose, no markdown, no code fences.
- Write titles as short imperative phrases ("Submit internship report"), never restating the user's full sentence.
- Add a description only when it carries information the title does not. Prefer an empty string over padding.
- Never invent a deadline the user did not imply. If no date is stated or clearly implied, use null.
- When you must infer a date, record the reason in the rationale field.`

/** Renders the injected date context the model needs to resolve "next Friday". */
function dateContext(today: string, timezone: string): string {
  const parsed = parseDateKey(today)
  if (!parsed) return `Today's date in ${timezone}: ${today}.`
  const weekday = WEEKDAY[parsed.getDay()] ?? 'Unknown'
  return `Today's date in ${timezone}: ${today} (${weekday}).`
}

export const createTasksPrompt = (input: string, today: string, timezone: string) => ({
  system: `You turn a user's rough instruction into one or more concrete tasks.

${dateContext(today, timezone)}

How to behave:
- Split into multiple tasks only when the instruction clearly contains several distinct obligations ("remind me to email the client and book the venue" -> two tasks). Otherwise return exactly one.
- Treat urgency words as priority signals: "urgent", "asap", "critical" -> high. "sometime", "when you get a chance", "no rush" -> low. Absent any signal, use medium.
- Treat the words "today", "tonight", "asap" as a due date of today. "this week" resolves to the coming Friday. "next week" resolves to the following week's weekday when one is named, otherwise that coming Friday.
- Strip filler from titles. "Remember to" and "I need to" are noise, not content.
- If the instruction is too vague to become a task (a greeting, a question, an empty string), return a single task titled "No task detected" with a description explaining what a usable instruction looks like, so the UI always has something to show.

${SHARED_RULES}`,
  prompt: `Instruction:\n${input}`,
})

export const breakdownPrompt = (
  title: string,
  description: string | undefined,
  dueDate: string | null | undefined,
  today: string,
  timezone: string,
) => ({
  system: `You break a single large task into a short, ordered list of concrete next actions.

${dateContext(today, timezone)}

How to behave:
- Produce between 3 and 7 steps. Fewer than 3 means it was not actually a large task; more than 7 is noise.
- Each step must be independently completable and phrased as an action someone could start right now.
- Order steps so the list can be worked top to bottom. Put setup, research, and drafting before review and submission.
- Do not invent deadlines. Steps inherit the parent task's due date; do not assign per-step dates.
- If the title is already atomic enough that breaking it down makes no sense, return a single step that restates it more concretely rather than inventing filler.

${SHARED_RULES}`,
  prompt: [
    `Task: ${title}`,
    description ? `Context: ${description}` : null,
    dueDate ? `Due: ${dueDate}` : null,
  ]
    .filter(Boolean)
    .join('\n'),
})

export const prioritizePrompt = (
  today: string,
  timezone: string,
) => ({
  system: `You advise a user on what to work on next, based on their open tasks.

${dateContext(today, timezone)}

How to behave:
- Choose the one task that most deserves attention now: overdue or due-today work first, then high priority, then items that block other tasks, then everything else. Break ties toward the smaller task, since finishing something builds momentum.
- Justify the choice in one or two sentences referencing concrete signals (overdue, due today, high priority, blocking another task). Never restate the whole task list.
- Set suggestedOrder to task ids from most to least urgent. Include only ids that exist in the input.
- If every task is completed, or the list is empty, set focusTaskId to null, suggestedOrder to an empty array, and say so plainly in the headline.

${SHARED_RULES}`,
  prompt: `Today is ${today} (${timezone}). Recommend what to work on next.`,
})

export const improvePrompt = (today: string, timezone: string) => ({
  system: `You rewrite a task so it is unmistakably actionable.

${dateContext(today, timezone)}

How to behave:
- Make the title specific enough that someone could start without asking a follow-up question. Name the artefact, the subject, or the outcome.
- If the title is already clear, keep it and improve only the description. Do not inflate a good title for the sake of changing it.
- Add a description that captures acceptance criteria, the steps already known, or what "done" looks like. Keep it under two sentences.
- Preserve the author's intent and wording. Do not add scope they did not ask for, and do not invent deadlines.

${SHARED_RULES}`,
  prompt: 'Rewrite the following task to be clearer and more actionable.',
})
