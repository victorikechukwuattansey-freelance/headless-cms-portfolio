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
- Webhook delivery and scheduled processing.
- Search and translation database support.
- Docker-based local PostgreSQL configuration.

These capabilities do not imply comprehensive automated test coverage for every workflow.
## Repository structure

- `admin/` - React administration application
- `site/` - Next.js public-facing application
- `src/` - API source code
- `prisma/` - Prisma schema and migrations
- `tests/` - Playwright tests
- `scripts/` - Project scripts
- `.github/workflows/` - GitHub Actions
- `Dockerfile` - API container build
- `docker-compose.yml` - Local PostgreSQL
- `fly.toml` - Fly.io API configuration
## Prerequisites

- Node.js 22 or compatible version.
- npm.
- Docker Desktop or a PostgreSQL instance.
- Cloudinary credentials for media functionality.

## Environment configuration

Create an API `.env` file in the repository root.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime PostgreSQL connection used by the API's Prisma Neon adapter. |
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

Configure both `DATABASE_URL` and `DIRECT_URL` to use the local PostgreSQL connection from `docker-compose.yml` (host port `5433`). For this local, unpooled database, both can use the same connection URL. `DATABASE_URL` is used by the running API; `DIRECT_URL` is read by Prisma CLI configuration and used for migrations. The Compose credentials are for local development only.

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

The API defaults to port `4000`. Its GraphQL endpoint is `/graphql`, and its health endpoint is `/health`.

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
npm --prefix admin run build
npm --prefix site run build
npm --prefix admin run lint
```

The existing Playwright tests target the Playwright demonstration site. They are not comprehensive CMS end-to-end tests.

## Deployment

The repository includes a Dockerfile and Fly.io configuration for the API.

Admin and Site hosting must be configured independently. Complete deployment automation for all three applications is not included.

Production deployment requires configured secrets, a provisioned database, applied migrations, and independently verified application endpoints.

## Known limitations

This is a portfolio project, not a claim of complete production readiness.

Areas requiring further validation or hardening include:

- Database readiness and operational health checks.
- Production CORS and GraphiQL configuration.
- Sentry GraphQL variable-capture configuration.
- Webhook endpoint validation and delivery safety.
- Production migration and recovery procedures.
- CMS-specific automated end-to-end test coverage.
- Outstanding Admin lint and dependency audit findings.
- Production capacity, backups and restore procedures.
- Admin and Site deployment automation.

The JWT production-secret guard is implemented. A production secret must still be configured in the deployment environment.

## License

This repository does not grant a license to use, copy, modify, or redistribute its code. The root package is marked `UNLICENSED` in npm metadata. Contact the project owner for permission.
