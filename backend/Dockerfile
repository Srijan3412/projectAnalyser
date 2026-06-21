FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root configurations and workspace files
COPY package*.json ./
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY backend/ backend/

# Install dependencies (use legacy-peer-deps to avoid conflict with react/lucide-react in workspaces)
RUN npm install --legacy-peer-deps

# Build the shared types first, then backend
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=backend

FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules/ /usr/src/app/node_modules/
COPY --from=builder /usr/src/app/packages/shared/ /usr/src/app/packages/shared/
COPY --from=builder /usr/src/app/backend/dist/ /usr/src/app/backend/dist/
COPY --from=builder /usr/src/app/backend/package.json /usr/src/app/backend/package.json

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production
ENV REDIS_URL=redis://redis:6379

CMD ["node", "backend/dist/server.js"]
