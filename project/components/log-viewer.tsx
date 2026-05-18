'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LogEntry } from '@/lib/types';
import { RefreshCw, Trash2, Activity } from 'lucide-react';

const LEVEL_VARIANT: Record<LogEntry['level'], 'secondary' | 'warning' | 'destructive'> = {
  info: 'secondary',
  warn: 'warning',
  error: 'destructive',
};

export function LogViewer({ pollMs = 2000 }: { pollMs?: number }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs', { cache: 'no-store' });
      const data = (await res.json()) as { logs: LogEntry[] };
      setLogs(data.logs);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(async () => {
    await fetch('/api/logs', { method: 'DELETE' });
    setLogs([]);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" /> Observability
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh logs"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} aria-label="Clear logs">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[480px] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground">
              No logs yet. Trigger the XAA flow to see request lifecycle.
            </p>
          ) : (
            <ul className="space-y-1">
              {logs
                .slice()
                .reverse()
                .map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded border bg-background p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge variant={LEVEL_VARIANT[entry.level]}>
                        {entry.level}
                      </Badge>
                      <Badge variant="outline">{entry.category}</Badge>
                      <span className="break-all">{entry.message}</span>
                    </div>
                    {entry.data && (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
                        {JSON.stringify(entry.data, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
