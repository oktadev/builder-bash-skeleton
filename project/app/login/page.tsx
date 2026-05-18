import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LoginButton } from '@/components/auth-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ShieldCheck } from 'lucide-react';

interface SearchParams {
  error?: string;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> XAA Requesting App
          </CardTitle>
          <CardDescription>
            Sign in via xaa.dev to start a Cross-App Access (ID-JAG) session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Login failed</AlertTitle>
              <AlertDescription className="break-all text-xs">
                {decodeURIComponent(error)}
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            You will be redirected to <code>https://idp.xaa.dev</code> to
            authenticate. After consent, the IdP redirects back here with
            an authorization code, which is exchanged for an OIDC ID Token.
          </p>
          <LoginButton />
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Uses OIDC Authorization Code + PKCE (S256). State + nonce verified.
        </CardFooter>
      </Card>
    </main>
  );
}
