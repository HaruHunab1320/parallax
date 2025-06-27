# Sentiment Analysis Agent
FROM parallax/agent-typescript:latest

WORKDIR /app/agent

# Copy agent source
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

# Install any additional dependencies
RUN npm install

# Build the agent
RUN npx tsc

# Expose gRPC port
EXPOSE 50051

# Run the sentiment agent
CMD ["node", "dist/index.js"]