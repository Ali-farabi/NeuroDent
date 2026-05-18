FROM node:22-bookworm-slim AS deps

WORKDIR /app/next-app
COPY next-app/package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY --from=deps /app/next-app/node_modules ./next-app/node_modules
COPY . .
WORKDIR /app/next-app
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app ./

WORKDIR /app/next-app
EXPOSE 3000

CMD ["npm", "run", "start"]
