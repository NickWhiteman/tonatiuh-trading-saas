FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3131 \
    TONATIUH_DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./build
COPY migrations ./migrations
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3131
CMD ["node", "build/index.js"]
