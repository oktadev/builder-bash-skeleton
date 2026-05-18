import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** JWT exp claim → ISO timestamp (or undefined if not a valid JWT). */
export function jwtExpiry(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { exp?: number };
    if (typeof payload.exp !== 'number') return undefined;
    return new Date(payload.exp * 1000).toISOString();
  } catch {
    return undefined;
  }
}
