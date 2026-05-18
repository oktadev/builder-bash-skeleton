import { LogViewer } from '@/components/log-viewer';

export default function LogsPage() {
  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Observability</h1>
        <p className="text-sm text-muted-foreground">
          Live in-memory log of OIDC + token-exchange + resource-call activity.
          Token values are redacted to head…tail form.
        </p>
      </header>
      <LogViewer pollMs={1500} />
    </main>
  );
}
