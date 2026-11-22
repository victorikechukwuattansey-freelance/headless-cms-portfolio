# Headless CMS

A full-stack headless content management system with a GraphQL API, a React administration interface, and a Next.js public-facing site.

## Architecture

| Component | Responsibility | Technology |
|---|---|---|
| API | Authentication, content operations and GraphQL | Node.js, TypeScript, GraphQL Yoga |
| Admin | Content administration | React, TypeScript, Vite |
| Site | Public-facing content | Next.js, React |
| Database | Persistent data | PostgreSQL, Prisma ORM |
| Media | Media management | Cloudinary |

The Admin and Site communicate with the API. The API accesses PostgreSQL through Prisma and integrates with external services.

## Features

The repository includes implementation for:

- JWT authentication and refresh-token persistence.
- GraphQL API and GraphiQL interface.
- Content and blog-post management.
- Cloudinary media integration.
- Webhook delivery and scheduled publishing.
- Search and translation database support.
- Docker-based local PostgreSQL configuration.

These capabilities do not imply comprehensive automated test coverage for every workflow.

## Repository structure

- `admin/` - React administration application
- `site/` - Next.js public-facing application
- `src/` - API and background worker source code
- `prisma/` - Prisma schema and migrations
- `tests/` - Playwright tests
- `scripts/` - Project scripts
- `.github/workflows/` - GitHub Actions
- `Dockerfile` - API and worker container build
- `docker-compose.yml` - Local PostgreSQL
- `fly.toml` - Fly.io web and worker process configuration

## Prerequisites

- Node.js 22 or compatible version.
- npm.
- Docker Desktop or a PostgreSQL instance.
- Cloudinary credentials for media functionality.

## Environment configuration

Create an API `.env` file in the repository root.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime PostgreSQL connection used by Prisma. |
| `DIRECT_URL` | Direct, unpooled PostgreSQL URL read by Prisma CLI configuration; migrations connect using this URL. Prisma Client generation reads the variable but does not connect to the database. |
| `JWT_SECRET` | JWT signing secret |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `CORS_ORIGIN` | CORS configuration |
| `PORT` | API listening port |
| `NODE_ENV` | Runtime environment |
| `SENTRY_DSN` | Optional Sentry configuration |

Frontend variables:

- Admin: `VITE_API_URL`
- Site: `NEXT_PUBLIC_API_URL`

Never commit credentials or `.env` files. Production requires a JWT secret of at least 32 characters; the development fallback is rejected in production.

## Local development

Run commands from the repository root.

Install API dependencies:

```bash
npm ci
```

Start PostgreSQL:

```bash
docker compose up -d
```

Configure both `DATABASE_URL` and `DIRECT_URL` to use the local PostgreSQL connection from `docker-compose.yml` (host port `5433`). For this local, unpooled database, both can use the same connection URL. `DATABASE_URL` is used by the API and worker; `DIRECT_URL` is read by Prisma CLI configuration and used for migrations. The Compose credentials are for local development only.

Generate Prisma Client and apply development migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Seed data when required:

```bash
npm run seed
```

Start the API:

```bash
npm run dev
```

The API defaults to port `4000`. Its GraphQL endpoint is `/graphql`, and its liveness endpoint is `/health`.

To run the background scheduler locally, open another terminal and run:

```bash
npm run build
npm run start:worker
```

Run only one scheduler worker for a given database. It publishes due posts and processes pending webhook deliveries every 60 seconds.

Start the Admin in another terminal:

```bash
npm --prefix admin ci
npm --prefix admin run dev
```

Admin defaults to port `5173`.

Start the Site in another terminal:

```bash
npm --prefix site ci
npm --prefix site run dev
```

Site defaults to port `3000`.

## Build and validation

Run each build from the repository root:

```bash
npm run build
npm test
npm --prefix admin run build
npm --prefix site run build
npm --prefix admin run lint
```

The existing Playwright tests target the Playwright demonstration site. They are not comprehensive CMS end-to-end tests.

## Deployment

The Fly.io app uses two process groups from the same image:

- `web`: GraphQL API and HTTP health endpoint. Only this group receives HTTP traffic and can auto-stop when idle.
- `worker`: scheduled publishing and webhook delivery. It has no public service and runs independently of the web process group.

Both process groups require the same production environment and database credentials, including `DATABASE_URL`, `JWT_SECRET`, and any integration secrets used by the worker. The worker uses the shared PostgreSQL database; no separate queue or Redis service is introduced.

Keep exactly one worker Machine running:

```bash
fly scale count web=0 worker=1 -a headless-cms-viaai
```

Set the web count according to traffic requirements. The web group can remain at zero when idle because its HTTP service has auto-stop and auto-start enabled. Do not scale the worker to zero: scheduled publishing and webhook retries will pause. Do not run multiple worker Machines for this scheduler; the database lock is a secondary guard, not a replacement for operating one scheduler instance.

The process groups deploy together from one image. The worker handles `SIGTERM` by stopping its interval, waiting for an in-flight scheduler tick, and disconnecting Prisma. Fly is configured with a 300-second shutdown timeout to allow graceful completion.

Before deploying this process-group change, inspect the current Fly Machine counts and process groups. The first deployment creates a Machine for each configured process group; verify that the worker is running and that the web group remains independently scalable. No deployment or scaling operation is performed by CI.

Admin and Site hosting must be configured independently. Production deployment requires configured secrets, a provisioned database, applied migrations, and independently verified application endpoints.

## Known limitations

This is a portfolio project, not a claim of complete production readiness.

Areas requiring further validation or hardening include:

- Database readiness and operational health checks.
- Production CORS and GraphiQL configuration.
- Webhook delivery observability and operational alerting.
- Production migration and recovery procedures.
- CMS-specific automated end-to-end test coverage.
- Outstanding Admin lint and dependency audit findings.
- Production capacity, backups and restore procedures.
- Admin and Site deployment automation.

The JWT production-secret guard is implemented. A production secret must still be configured in the deployment environment.

## License

This repository does not grant a license to use, copy, modify, or redistribute its code. The root package is marked `UNLICENSED` in npm metadata. Contact the project owner for permission.
