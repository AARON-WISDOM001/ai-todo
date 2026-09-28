import { WorkspaceProvider } from './features/workspace/workspace-context.tsx'
import { AppShell } from './features/workspace/app-shell.tsx'
import { AiCommandBar } from './features/ai/ai-command-bar.tsx'
import { TaskEditorDialog } from './features/tasks/task-editor-dialog.tsx'

export default function App() {
  return (
    <WorkspaceProvider>
      <AppShell />
      <AiCommandBar />
      <TaskEditorDialog />
    </WorkspaceProvider>
  )
}
