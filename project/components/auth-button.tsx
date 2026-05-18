'use client';

import { Button } from '@/components/ui/button';
import { LogIn, LogOut } from 'lucide-react';

export function LoginButton() {
  return (
    <Button onClick={() => (window.location.href = '/api/auth/login')}>
      <LogIn className="mr-2 h-4 w-4" /> Log in with xaa.dev
    </Button>
  );
}

export function LogoutButton() {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      <LogOut className="mr-2 h-4 w-4" /> Log out
    </Button>
  );
}
