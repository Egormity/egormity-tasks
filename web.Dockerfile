FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src/web ./src/web
COPY src/api/contracts ./src/api/contracts
RUN npm run build:web

FROM nginx:1.28-alpine
COPY src/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/web/client /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
