FROM node:24-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

# Install Playwright's browser dependencies
RUN npx playwright install-deps

COPY . .

# Create the data directory and an empty reservations file to ensure the app can start.
# In a real production setup, this path should be mounted to a persistent volume.
RUN mkdir -p data && echo "[]" > data/reservations.json

EXPOSE 3001

CMD ["npm", "start"]
