# 00 — Original task prompt

The complete, verbatim prompt the user supplied to start this build. Preserved
unedited so a future engineer can replay the same workflow against any
AI-native coding assistant.

> Source: chat session at `/Users/sohail.pathan/xaa-dev/`, 2026-05-18.

---

You are an autonomous senior software engineer tasked with building a reproducible Cross-App Access (XAA) Requesting Application for testing in XAA.dev.

The goal is to build ONLY the Requesting App.

This application will simulate a client application that:

* authenticates users
* requests delegated access to another application/resource server
* stores and propagates access tokens
* calls protected APIs
* displays returned protected resources
* logs the complete authorization flow

The project must also demonstrate AI-native software development workflows.

The application MUST preserve all prompts, debugging sessions, testing evidence, and implementation decisions so another engineer can reproduce the workflow from scratch.

---

# PRIMARY OBJECTIVES

1. Build a working XAA Requesting App.
2. Demonstrate delegated access/token propagation flows.
3. Preserve ALL prompts used during development.
4. Autonomously test the application.
5. Generate reproducible outputs and validation artifacts.

---

# APPLICATION REQUIREMENTS

Build a frontend-focused Requesting Application that can:

* authenticate a user
* initiate a cross-app access request
* acquire/store access tokens
* call protected APIs
* display protected resources
* handle unauthorized responses
* handle expired tokens
* log request/response lifecycle

The app should simulate realistic XAA behavior even if the backend/resource server is mocked.

---

# REQUIRED FEATURES

## Authentication

Implement:

* login flow
* session management
* JWT/token storage
* logout functionality

## Cross-App Access Flow

Implement:

* access request initiation
* token attachment to outbound requests
* delegated authorization simulation
* protected API consumption

## Protected Resource Viewer

Create UI for:

* displaying fetched resources
* showing loading states
* showing authorization errors
* showing token state

## Observability

Include:

* request logs
* token lifecycle logs
* API response logs
* access failure logs

---

# TECH STACK

Use:

* Next.js
* TypeScript
* TailwindCSS
* shadcn/ui
* Node.js APIs or mocked APIs
* JWT-based auth simulation

Optional:

* Supabase
* Zustand
* React Query

---

# CRITICAL REQUIREMENT — PROMPT PRESERVATION

Create:

/prompts

For EVERY major development step:

* preserve the exact prompt
* describe the objective
* summarize the generated output
* document issues encountered
* document debugging prompts
* document fixes applied

Example:

/prompts/01-project-setup.md
/prompts/02-authentication.md
/prompts/03-token-management.md
/prompts/04-protected-api-calls.md
/prompts/05-ui-dashboard.md
/prompts/06-debugging.md
/prompts/07-testing.md

---

# AUTONOMOUS TESTING REQUIREMENTS

After implementing each feature:

* verify login flow
* verify token generation/storage
* verify token propagation
* verify protected API calls
* verify unauthorized handling
* verify expired token behavior
* verify frontend rendering
* verify TypeScript correctness
* verify linting

If issues occur:

* debug autonomously
* fix the issue
* preserve debugging prompts
* document root cause and resolution

---

# REQUIRED TEST SCENARIOS

The app MUST validate:

## Successful Flow

* authenticated user accesses protected resource successfully

## Unauthorized Flow

* unauthenticated access is rejected properly

## Invalid Token Flow

* malformed token is rejected

## Expired Token Flow

* expired token forces reauthentication

## API Failure Flow

* backend/API failure handled gracefully

---

# VALIDATION OUTPUTS

Generate:

/testing
test-plan.md
test-cases.md
expected-results.md
known-limitations.md

---

# FINAL VALIDATION

Generate:

FINAL_VALIDATION.md

Include:

* architecture overview
* authentication flow
* token propagation flow
* API interaction flow
* logs/screenshots
* test evidence
* startup commands
* reproduction instructions

---

# REPRODUCIBILITY REQUIREMENT

Another engineer must be able to:

1. Clone the repository
2. Read prompts sequentially
3. Replay the workflow
4. Reproduce the same Requesting App

Optimize outputs for educational value and reproducibility.

---

# DEVELOPMENT RULES

* Build incrementally
* Validate after every feature
* Do not skip testing
* Do not skip documentation
* Use strict TypeScript
* Include loading/error states
* Avoid hardcoded secrets
* Include environment variable examples

---

# FINAL PROJECT STRUCTURE

/project
/app
/components
/lib
/prompts
/testing
README.md
FINAL_VALIDATION.md

---

# README REQUIREMENTS

README.md must include:

* project overview
* XAA Requesting App architecture
* auth/token flow explanation
* API communication explanation
* setup instructions
* local development commands
* testing workflow
* AI tools used
* prompt preservation strategy
* reproduction guide

---

# SUCCESS CRITERIA

The task is complete ONLY IF:

* requesting flow works end-to-end
* protected API calls succeed
* unauthorized states are handled
* tests pass
* prompts are preserved
* another engineer can reproduce the workflow

Act like a senior engineer building a production-quality XAA Requesting Application using AI-native development workflows.
