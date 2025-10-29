# Use official Node.js LTS image
FROM node:20-slim

# Set environment variables for non-interactive installs
ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies for Puppeteer / Chromium
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libasound2 \
    libnspr4 \
    libnss3 \
    libxshmfence1 \
    xdg-utils \
    unzip \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install Node dependencies
RUN npm install --omit=dev

# Copy the rest of the app
COPY . .

# Ensure uploads and public directories exist
RUN mkdir -p uploads public

# Expose port
EXPOSE 6666

# Start the app
CMD ["node", "index.js"]
