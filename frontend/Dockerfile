FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY frontend/ frontend/

RUN npm install --legacy-peer-deps

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=frontend

FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules/ /usr/src/app/node_modules/
COPY --from=builder /usr/src/app/packages/shared/ /usr/src/app/packages/shared/
COPY --from=builder /usr/src/app/frontend/.next/ /usr/src/app/frontend/.next/
COPY --from=builder /usr/src/app/frontend/public/ /usr/src/app/frontend/public/
COPY --from=builder /usr/src/app/frontend/package.json /usr/src/app/frontend/package.json

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=http://localhost:4000

CMD ["node", "frontend/node_modules/.bin/next", "start", "frontend"]
