# ── Stage 1: deps ───────────────────────────────────────────────────────────
# Install only production dependencies so we have a clean node_modules
# to copy into the final image (no devDependencies, no test tools).
FROM node:22-alpine AS deps
WORKDIR /app
# Copy manifests first so Docker can cache this layer.
# If package.json doesn't change, npm ci is skipped on the next build.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: builder ─────────────────────────────────────────────────────────
# Install ALL deps (including TypeScript / tsx) and compile src/ → dist/
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
# tsc reads tsconfig.json and outputs compiled JS into dist/
RUN npm run build

# ── Stage 3: runner ──────────────────────────────────────────────────────────
# Minimal runtime image: no TypeScript, no devDependencies, no source files.
# Production equivalent would use a distroless or non-root image.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Pull compiled output from builder
COPY --from=builder /app/dist ./dist
# Pull slim node_modules from deps (production only)
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]
