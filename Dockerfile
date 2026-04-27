FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --registry=https://registry.npmmirror.com
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends \
    git nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/pyproject.toml backend/
RUN pip install --no-cache-dir -e backend/

COPY backend/ backend/
COPY tests/ tests/
COPY pyproject.toml ./
COPY docs/ docs/

COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
