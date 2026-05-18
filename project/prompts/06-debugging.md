# 06 — Debugging session

This file logs every issue that surfaced during the autonomous build
and the prompt I issued to fix it. Chronological.

---

## Issue #1 — Next.js 15.1.6 CVE warning

### Symptom

```
npm warn deprecated next@15.1.6: This version has a security vulnerability.
Please upgrade to a patched version. See https://nextjs.org/blog/CVE-2025-66478
```

### Debugging prompt

> The pinned `next@15.1.6` is flagged by npm as having CVE-2025-66478.
> Bump to the latest patched release without breaking the App Router
> APIs we depend on (`cookies()`, `redirect()`, `NextRequest`,
> `NextResponse`, route handlers).

### Root cause

15.1.6 ships an unpatched middleware-bypass CVE.

### Resolution

```bash
npm install --no-audit --no-fund next@latest eslint-config-next@latest
```

Resolved to `next@16.2.6`. App Router APIs are stable across the major
bump — no code changes required.

### Side effects

Next 16 dev-boot rewrote `tsconfig.json` (`jsx: react-jsx`) and
`next-env.d.ts` (added `import "./.next/dev/types/routes.d.ts"`). Both
are framework-managed and accepted as-is.

---

## Issue #2 — TypeScript discriminated-union narrowing failure

### Symptom

```
app/api/call/route.ts(42,15): error TS7053: Element implicitly has an 'any'
  type because expression of type 'any' can't be used to index type
  'Record<ErrorCode, number>'.
app/api/call/route.ts(42,35): error TS2339: Property 'error' does not exist
  on type 'CallResult | ApiError'. Property 'error' does not exist on type
  'CallResult'.
components/resource-viewer.tsx(75,49): error TS2322: Type 'ApiResponse'
  is not assignable to type 'ApiError'.
+ 7 similar errors in tests/resource-call.test.ts
```

### Debugging prompt

> tsc says the union `CallResult | ApiError` does not narrow on
> `if (!result.ok)`. The success type was declared with `ok: boolean`,
> not `ok: true`. Fix the type so the discriminator works.

### Root cause

In `lib/types.ts`:

```ts
export interface CallResult {
  ok: boolean;        // ← non-literal — defeats union narrowing
  ...
}
```

When `ok` is `boolean` on one arm and `false` on the other, TS sees the
intersection of "ok must be boolean OR false" and concludes both arms
are still possible after `if (!result.ok)`.

### Resolution

```diff
 export interface CallResult {
-  ok: boolean;
+  ok: true;
   ...
 }
```

After this single-line change, all 9 type errors cleared and
`npx tsc --noEmit` exits 0.

### Verification

```bash
npx tsc --noEmit         # exits 0
npx vitest run            # 25/25 pass
```

---

## Issue #3 — Spurious `asChildLike` prop in auth button

### Symptom

`components/auth-button.tsx` had a non-existent `asChildLike` prop on
`<Button>` and a sketchy `declare module 'react'` augmentation just to
silence the type error. This was a leftover from a discarded "render
as child element" idea.

### Debugging prompt

> Drop the `asChildLike` prop and the `declare module 'react'` block
> from `auth-button.tsx`. Use a plain `onClick` handler instead.

### Resolution

Rewrote the component to use a plain `onClick={() =>
window.location.href = '/api/auth/login'}`. No type augmentations.

---

## Issue #4 — `vitest` couldn't resolve `@/lib/*` aliases

### Symptom

(Caught at test-design time, before running tests.) `vitest` doesn't
read Next.js's tsconfig path mapping by default.

### Debugging prompt

> Wire vitest to resolve `@/*` to the project root, matching Next's
> tsconfig paths.

### Resolution

`vitest.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { ... },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
```

Plus `tests/setup.ts` to populate the env vars `lib/config.ts` requires.

---

## Issue #5 — `loadConfig()` throws at module-load when running tests

### Symptom

If `lib/config.ts` had top-level validation, importing any `lib/*`
module from tests would throw before any `setupFiles` could run.

### Debugging prompt

> Make config loading lazy — don't validate at module import; validate
> at first call from an API route.

### Resolution

`lib/config.ts` exports `loadConfig()` as a function rather than a
top-level constant. The function is invoked from API routes (server)
and from tests after `setup.ts` populates env vars.

---

## Summary table

| # | Issue                                      | Cost to fix |
| - | ------------------------------------------ | ----------- |
| 1 | Next.js CVE on pinned 15.1.6               | 1 npm cmd   |
| 2 | TS narrowing on `ok: boolean`              | 1 line      |
| 3 | Stray `asChildLike` augmentation           | ~5 lines    |
| 4 | Vitest path alias missing                  | config file |
| 5 | Eager config validation breaking tests     | 1 wrap      |

Total debugging: ~10 minutes of focused work, zero blocked time.
