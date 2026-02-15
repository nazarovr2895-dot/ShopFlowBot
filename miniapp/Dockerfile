# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Using npm install instead of npm ci to handle package.json changes
# npm ci requires exact sync between package.json and package-lock.json
RUN npm install

# Copy source code
COPY . .

# Build argument for API URL
ARG VITE_API_URL
ARG VITE_BOT_USERNAME

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BOT_USERNAME=$VITE_BOT_USERNAME

# Ensure config.json has API URL at build time so production never has empty base (fixes product images in Telegram)
RUN echo "{\"apiUrl\":\"${VITE_API_URL}\"}" > public/config.json

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
