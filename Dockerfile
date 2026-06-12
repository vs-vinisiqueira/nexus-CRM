# syntax=docker/dockerfile:1

# ---- Stage 1: build do frontend (Vite -> dist/) ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend + frontend estático ----
FROM node:20-alpine AS backend
ENV NODE_ENV=production
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
# O build do frontend é servido pelo Express a partir de ./public
COPY --from=frontend /app/frontend/dist ./public

ENV STATIC_DIR=/app/backend/public
ENV PORT=3001
EXPOSE 3001

# Aplica a migração (idempotente) e sobe a API que também serve a UI.
CMD ["sh", "-c", "node src/db/migrate.js && node src/server.js"]
