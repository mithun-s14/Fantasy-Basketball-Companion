# ── Stage 1: deps ────────────────────────────────────────────────────────────
# Next.js needs all dependencies available during `next build` (for tree-shaking
# and bundling), so we install everything — not just production deps.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: builder ─────────────────────────────────────────────────────────
# Run `next build`. With output: 'standalone' in next.config.ts, this produces
# .next/standalone — a minimal server.js with only the modules the app uses.
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* variables are baked into the client-side bundle at build time,
# not at runtime. They must be present here, not just when the container starts.
# We receive them as build arguments from docker-compose (or CI).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

# ── Stage 3: runner ──────────────────────────────────────────────────────────
# The final image only contains the standalone output — not source, not all of
# node_modules, not the TypeScript compiler.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as a non-root user — good practice and required by some K8s policies
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# static assets served directly by the standalone server
COPY --from=builder /app/public ./public
# standalone server + its bundled node_modules subset
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# pre-compiled static chunks (JS, CSS) for the browser
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
# 0.0.0.0 makes the server reachable from outside the container (not just localhost)
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
