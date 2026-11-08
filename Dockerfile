FROM nginx:alpine

# Remove default nginx configuration
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets do Grafcet UI
COPY packages/ui/public/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

