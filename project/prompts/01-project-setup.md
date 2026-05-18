# 01 — Project setup

## Prompt

> Scaffold a Next.js 16 (App Router) + TypeScript + TailwindCSS + shadcn/ui
> project at `/project/` with the canonical layout `app/`, `components/`,
> `lib/`, `prompts/`, `testing/`, `tests/`. Use strict TypeScript. Configure
> path alias `@/*`. Use iron-session for cookie-based sessions. Add an
> `.env.example` documenting every required env var. Vendor the shadcn/ui
> primitives (`button`, `card`, `badge`, `alert`) directly into
> `components/ui/` so the project builds offline once installed. Avoid the
> shadcn CLI to keep the setup hermetic.

## Objective

Establish the project skeleton and dependency manifest before writing any
domain logic. Lock TypeScript to strict mode, set up Tailwind + design
tokens, and pin shadcn-style primitives in-tree.

## Output

| File                       | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `package.json`             | Deps: next, react 19, openid-client, iron-session, lucide-react, class-variance-authority, clsx, tailwind-merge, tailwindcss, vitest. |
| `tsconfig.json`            | `strict: true`, `paths: { "@/*": ["./*"] }`, ES2022 target.   |
| `next.config.ts`           | `reactStrictMode: true`. No exposed env.                      |
| `tailwind.config.ts`       | Design tokens via CSS variables (HSL). Content globs.         |
| `postcss.config.mjs`       | tailwindcss + autoprefixer.                                   |
| `app/globals.css`          | shadcn-canonical CSS variables for light/dark themes.         |
| `.env.example`             | All eight required env vars documented inline.                |
| `.gitignore`               | Standard Next.js + node ignores plus `.env*.local`.           |
| `components/ui/{button,card,badge,alert}.tsx` | Vendored shadcn primitives.                |
| `lib/utils.ts`             | `cn()` (tailwind-merge + clsx) and `jwtExpiry()`.             |

## Issues

- `next@15.1.6` was installed first, but the npm install warned about
  CVE-2025-66478. Bumped to `next@latest` (resolved to 16.2.6) and
  `eslint-config-next@latest`. No code changes required for the major
  bump — App Router APIs (`cookies()`, `redirect()`, route handlers,
  `NextRequest`/`NextResponse`) are stable from 15 → 16.
- Next 16 dev-boot rewrote `tsconfig.json` (`jsx: react-jsx`) and
  `next-env.d.ts` (added `import "./.next/dev/types/routes.d.ts"`). These
  are framework-managed; we accept them.

## Fixes

```bash
npm install --no-audit --no-fund next@latest eslint-config-next@latest
```

## Verification

```bash
npm install                  # 409 packages installed clean
npx tsc --noEmit             # exits 0
```
