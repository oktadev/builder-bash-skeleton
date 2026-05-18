import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { jwtExpiry } from '@/lib/utils';
import { loadConfig } from '@/lib/config';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogoutButton } from '@/components/auth-button';
import { ResourceViewer } from '@/components/resource-viewer';
import { LogViewer } from '@/components/log-viewer';
import { TokenStateView } from '@/components/token-state';
import { ShieldCheck, User2 } from 'lucide-react';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.user) redirect('/login');

  const config = loadConfig();
  const tokenState = {
    hasIdToken: true,
    idTokenExpiresAt: jwtExpiry(session.user.idToken),
    hasResourceAccessToken: false,
    scopes: config.resourceScopes,
  };

  const { sub, email, name } = session.user.claims as Record<string, string | undefined>;

  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6" /> XAA Requesting App
          </h1>
          <p className="text-sm text-muted-foreground">
            Cross-App Access dashboard — drive ID Token → ID-JAG → access token → resource call.
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User2 className="h-4 w-4" /> Authenticated user
            </CardTitle>
            <CardDescription>OIDC claims from xaa.dev</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="sub" value={sub} mono />
            <Field label="email" value={email} />
            <Field label="name" value={name} />
            <Field
              label="logged in at"
              value={new Date(session.user.loggedInAt).toLocaleString()}
            />
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <TokenStateView tokenState={tokenState} />
        </div>

        <div className="lg:col-span-2">
          <ResourceViewer />
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Resource target</CardTitle>
              <CardDescription>Configured via env</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field label="resource" value={config.resourceUrl} mono />
              <Field label="path" value={config.resourcePath} mono />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">scopes</span>
                {config.resourceScopes.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <LogViewer />
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right break-all ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value ?? <span className="text-muted-foreground italic">n/a</span>}
      </span>
    </div>
  );
}
