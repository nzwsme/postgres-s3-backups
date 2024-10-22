FROM node:22 AS build

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src ./src

RUN yarn install --frozen-lockfile && \
    yarn build && \
    yarn install --production --frozen-lockfile

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

ARG PG_VERSION='14'

RUN apk add --update --no-cache postgresql${PG_VERSION}-client

CMD pg_dump --version && node dist/index.js
