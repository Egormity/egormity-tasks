FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json build.mjs ./
COPY src/agent ./src/agent
COPY src/api/contracts ./src/api/contracts
RUN npm run build:agent && npm prune --omit=dev --no-audit --no-fund

FROM node:24.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep python3 ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex@0.162.1 \
    && npm cache clean --force
ENV NODE_ENV=production \
    OPERATIONS_AGENT_INSTRUCTIONS_FILE=/app/agent-instructions.md
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/agent ./dist/agent
COPY src/agent/instructions/agent.md ./agent-instructions.md
USER node
EXPOSE 3011
CMD ["node", "dist/agent/main.js"]
