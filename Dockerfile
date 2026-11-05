# ── Build stage ──
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ── Runtime stage ──
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

# Copy production deps and built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 4000

CMD ["node", "dist/src/server.js"]