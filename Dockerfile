FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm install express node-fetch
EXPOSE 7860
CMD ["node", "server.js"]
