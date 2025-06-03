FROM node:22-alpine AS builder
RUN npm install -g typescript

# Set the working directory inside the container
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the source code and TypeScript config
COPY tsconfig.json ./
COPY src/ ./src/

# Run TypeScript compilation
RUN npm run build


FROM node:22-alpine

WORKDIR /app

# Create a non-root user to run the application
RUN addgroup -g 1001 -S catomcp && \
    adduser -S catomcp -u 1001 && \
    chown -R catomcp:catomcp /app

COPY --from=builder /app/package*.json .

# Install only production dependencies
RUN npm install --only=production

COPY --from=builder /app/build .

# Switch to the non-root user
USER catomcp

# Command to run the application
CMD ["node", "index.js"]
