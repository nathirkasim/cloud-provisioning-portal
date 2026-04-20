FROM node:20-slim

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Expose Vite's default port
EXPOSE 5173

# Run Vite with --host to allow access from outside the container
CMD ["npm", "run", "dev", "--", "--host"]
