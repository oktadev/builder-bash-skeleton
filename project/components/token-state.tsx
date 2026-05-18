'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TokenState } from '@/lib/types';
import { Key, KeyRound } from 'lucide-react';

export function TokenStateView({ tokenState }: { tokenState: TokenState }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-4 w-4" /> Token state
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row
          label="ID Token"
          icon={<KeyRound className="h-3.5 w-3.5" />}
          present={tokenState.hasIdToken}
          expiresAt={tokenState.idTokenExpiresAt}
        />
        <Row
          label="Resource access token"
          icon={<KeyRound className="h-3.5 w-3.5" />}
          present={tokenState.hasResourceAccessToken}
          expiresAt={tokenState.resourceAccessTokenExpiresAt}
          hint="re-exchanged on each call"
        />
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-muted-foreground">Requested scopes</span>
          <div className="flex flex-wrap gap-1 justify-end">
            {tokenState.scopes.map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  icon,
  present,
  expiresAt,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  present: boolean;
  expiresAt?: string;
  hint?: string;
}) {
  const expired =
    expiresAt && new Date(expiresAt).getTime() < Date.now();
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-2">
        {present ? (
          expired ? (
            <Badge variant="destructive">expired</Badge>
          ) : (
            <Badge variant="success">present</Badge>
          )
        ) : (
          <Badge variant="outline">{hint ?? 'absent'}</Badge>
        )}
        {expiresAt && (
          <span className="text-xs text-muted-foreground">
            exp: {new Date(expiresAt).toLocaleTimeString()}
          </span>
        )}
      </span>
    </div>
  );
}
