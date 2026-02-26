# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_YANDEX_MAPS_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_YANDEX_MAPS_KEY=$VITE_YANDEX_MAPS_KEY

RUN echo "{\"apiUrl\":\"${VITE_API_URL}\",\"ymapsApiKey\":\"${VITE_YANDEX_MAPS_KEY}\"}" > public/config.json
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
