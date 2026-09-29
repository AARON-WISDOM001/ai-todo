import { WorkspaceProvider } from './features/workspace/workspace-context.tsx'
import { AppShell } from './features/workspace/app-shell.tsx'
import { AiCommandBar } from './features/ai/ai-command-bar.tsx'
import { TaskEditorDialog } from './features/tasks/task-editor-dialog.tsx'
import { ThemeProvider } from './lib/theme.tsx'

/**
 * The composition root. Providers live here rather than in `main.tsx` so that
 * `<App />` is the whole application — a test that renders it gets the same
 * tree a browser does, with nothing to remember to wrap it in.
 */
export default function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <AppShell />
        <AiCommandBar />
        <TaskEditorDialog />
      </WorkspaceProvider>
    </ThemeProvider>
  )
}
