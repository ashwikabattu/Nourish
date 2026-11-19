# One image serves both the React app and the API, so it deploys as a single service.

# ---- build the React frontend ----
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public public
COPY src src
RUN npm run build

# ---- compile the TypeScript API ----
FROM node:24-alpine AS api
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public \
    DATABASE_SSL_CA=/app/rds-ca.pem
WORKDIR /app

# AWS RDS certificate bundle, so the API verifies the database's TLS certificate.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem

COPY --from=api /app/package.json ./
COPY --from=api /app/node_modules node_modules
COPY --from=api /app/dist dist
COPY --from=web /app/dist public

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "dist/index.js"]
