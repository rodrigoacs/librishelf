FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3050
CMD ["node", "src/server.js"]