# CMS Site

Next.js application for the public-facing content experience of the Headless CMS.

## Responsibilities

Provides the frontend for delivering content managed through the CMS API.

## Technology stack

- Next.js
- React
- TypeScript

## Prerequisites

- Node.js 24
- npm
- The CMS API running and reachable

## Environment

- `NEXT_PUBLIC_API_URL`: CMS API endpoint used by the Site application

Do not put private credentials or server-only secrets in `NEXT_PUBLIC_` variables. Next.js exposes these values to browser-side code.

## Setup

Run from the repository root:

```bash
npm --prefix site ci
npm --prefix site run dev
```

The development server defaults to port `3000`.

## Build

```bash
npm --prefix site run build
```

## Production server

```bash
npm --prefix site run start
```

The production server requires a successful build first.

For architecture, API setup, database configuration and deployment scope, see the repository README at ../README.md.
