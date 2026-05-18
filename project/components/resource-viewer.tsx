'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { ApiError, CallResult } from '@/lib/types';
import { AlertCircle, CheckCircle2, FileLock2, Loader2, Send } from 'lucide-react';

type ApiResponse = CallResult | ApiError;

const ERROR_TITLE: Record<ApiError['error'], string> = {
  unauthorized: 'Unauthorized',
  invalid_token: 'Invalid token',
  expired_token: 'Token expired — please re-authenticate',
  insufficient_scope: 'Insufficient scope',
  resource_failure: 'Resource server error',
  config_error: 'Configuration error',
  token_exchange_failure: 'Token exchange failed',
  unknown: 'Unknown error',
};

export function ResourceViewer({ onResult }: { onResult?: (r: ApiResponse) => void }) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch('/api/call', { method: 'POST' });
      const data = (await res.json()) as ApiResponse;
      setResponse(data);
      onResult?.(data);
    } catch (e) {
      const err: ApiError = {
        ok: false,
        error: 'unknown',
        message: (e as Error).message,
      };
      setResponse(err);
      onResult?.(err);
    } finally {
      setLoading(false);
    }
  }, [onResult]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileLock2 className="h-4 w-4" /> Protected resource
        </CardTitle>
        <CardDescription>
          Run the full XAA flow: ID Token → ID-JAG → access token → resource call.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={run} disabled={loading} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calling resource…
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" /> Call protected resource
            </>
          )}
        </Button>

        {response && response.ok && (
          <SuccessView result={response} />
        )}
        {response && !response.ok && <ErrorView error={response} />}
      </CardContent>
    </Card>
  );
}

function SuccessView({ result }: { result: CallResult }) {
  return (
    <Alert>
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Success
        <Badge variant="success">HTTP {result.status}</Badge>
        <Badge variant="secondary">{result.durationMs} ms</Badge>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">{result.request.method} {result.request.url}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {result.scopes.map((s) => (
            <Badge key={s} variant="outline">
              scope: {s}
            </Badge>
          ))}
          {result.tokens.idJag && (
            <Badge variant="outline" title="ID-JAG (delegation assertion)">
              id-jag: {result.tokens.idJag}
            </Badge>
          )}
          {result.tokens.accessToken && (
            <Badge variant="outline" title="Resource access token">
              access: {result.tokens.accessToken}
            </Badge>
          )}
        </div>
        <pre className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
          {JSON.stringify(result.body, null, 2)}
        </pre>
      </AlertDescription>
    </Alert>
  );
}

function ErrorView({ error }: { error: ApiError }) {
  const variant: 'destructive' | 'warning' =
    error.error === 'expired_token' || error.error === 'unauthorized'
      ? 'warning'
      : 'destructive';
  return (
    <Alert variant={variant}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{ERROR_TITLE[error.error]}</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p>{error.message}</p>
        {error.details && (
          <pre className="max-h-48 overflow-auto rounded-md border bg-background/60 p-2 text-xs">
            {JSON.stringify(error.details, null, 2)}
          </pre>
        )}
        {(error.error === 'expired_token' ||
          error.error === 'invalid_token' ||
          error.error === 'unauthorized') && (
          <p className="text-xs">
            <a className="underline" href="/api/auth/login">
              Re-authenticate
            </a>{' '}
            to obtain a fresh ID Token.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
