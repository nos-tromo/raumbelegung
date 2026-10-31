# Produktions-Image für das Frontend: baut den Vite-Build und packt ihn mit Caddy zusammen.
# Build-Kontext ist das Repo-Root:  docker build -f deploy/web.Dockerfile .

FROM node:26-alpine AS build
WORKDIR /app
# shared/ enthält die Recurrence-Fixtures, die der Typecheck der Tests mitliest.
COPY shared ./shared
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build

FROM caddy:2.11-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
