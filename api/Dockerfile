FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json build.mjs ./
COPY src/api ./src/api
RUN npm run build:api && npm prune --omit=dev --no-audit --no-fund

FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/api ./dist/api
USER node
EXPOSE 3010
CMD ["node", "dist/api/main.js"]
