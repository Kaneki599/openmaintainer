FROM node:22-alpine AS build
WORKDIR /opt/openmaintainer
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/Kaneki599/openmaintainer"
LABEL org.opencontainers.image.description="Explainable repository security and maintenance checks"
WORKDIR /workspace
COPY --from=build /opt/openmaintainer/dist /opt/openmaintainer/dist
COPY --from=build /opt/openmaintainer/node_modules /opt/openmaintainer/node_modules
COPY package.json /opt/openmaintainer/package.json
ENTRYPOINT ["node", "/opt/openmaintainer/dist/cli.js"]
CMD ["scan", "."]
