# Build stage
FROM node:24-slim AS builder

WORKDIR /app

# Install dependencies and generate the Prisma client before compiling.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci
# Prisma Client generation reads DIRECT_URL through prisma7.config.ts but does
# not connect to the database. A placeholder keeps image builds self-contained.
RUN DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage: keep the image free of TypeScript, Prisma CLI, and test tooling.
FROM node:24-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 4000

# The same image runs the API or the scheduler worker. Override this command
# with: node dist/src/worker.js
CMD ["node", "dist/src/server.js"]
