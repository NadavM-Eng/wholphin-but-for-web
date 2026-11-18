# syntax=docker/dockerfile:1

# ---- build: compile the web app and bundle the server ------------------------------------
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# the postinstall hook (tools/quiet-playwright.mjs) must exist before npm ci runs it
COPY tools/quiet-playwright.mjs tools/
# local stand-in for jassub's rvfc-polyfill (package.json overrides; the original is GPL-3.0)
COPY vendor/ vendor/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx vite build && npm run serve:build

# ---- runtime: one bundled server file + the built app, no node_modules -------------------
FROM node:26-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DIST_DIR=/app/dist
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server/index.js ./server.js
# the licence texts travel with the distributed image
COPY LICENSE LICENSE-EXCEPTION.md THIRD-PARTY-NOTICES.md ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
