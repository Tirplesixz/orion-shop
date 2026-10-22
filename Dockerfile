# Multi-stage Dockerfile for ORION Full-Stack Shop
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for efficient layer caching
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy full source and build
COPY . .
RUN npx prisma generate
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173

# Copy production dependencies and generated files
COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/data ./src/data

EXPOSE 5173

CMD ["node", "server/postgres-server.js", "--production"]
