FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src

# Pasta de uploads com dono "node" para o volume montado herdar a permissão
# quando ainda não existir no host.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node

EXPOSE 3050
CMD ["node", "src/server.js"]
