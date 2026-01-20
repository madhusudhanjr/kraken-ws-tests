# 1. Use the official Playwright image (Noble is the Ubuntu 24.04-based LTS version)
FROM mcr.microsoft.com/playwright:v1.49.0-noble

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package files first to optimize layer caching
COPY package*.json ./

# 4. Install dependencies (including those for WebSocket and TypeScript)
RUN npm install

# 5. Copy the entire project code (including tests, utils, and playwright.config.ts)
COPY . .

# 6. Install browsers specifically (redundant but helps avoid missing binaries)
RUN npx playwright install --with-deps chromium

# 7. Set environment variables (optional, e.g., for different URLs)
ENV KRAKEN_WS_URL=wss://ws.kraken.com/v2

# 8. Command to run your tests
# This runs the 'Full Regression' suite by default
CMD ["npx", "playwright", "test", "--grep", "Full Regression"]