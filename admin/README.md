# CMS Admin

React and TypeScript administration interface for the Headless CMS.

## Responsibilities

Provides the management interface for interacting with CMS functionality through the GraphQL API.

## Technology stack

- React
- TypeScript
- Vite
- ESLint

## Prerequisites

- Node.js 24
- npm
- The CMS API running and reachable

## Environment

- `VITE_API_URL`: CMS GraphQL API endpoint

For local development, Vite proxies `/graphql` to `http://localhost:4000`.

## Setup

Run from the repository root:

```bash
npm --prefix admin ci
npm --prefix admin run dev
```

The development server defaults to port `5173`.

## Build and lint

```bash
npm --prefix admin run build
npm --prefix admin run lint
```

Lint is part of the repository CI validation.

For architecture, API setup, database configuration and deployment scope, see the repository README at ../README.md.
