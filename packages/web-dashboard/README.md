# @parallax/web-dashboard

Web-based management interface for the Parallax AI orchestration platform.

## Overview

The Parallax Web Dashboard provides a visual interface for:
- Monitoring agent status and health
- Browsing and executing patterns
- Viewing execution history and metrics
- Managing pattern configurations
- Real-time confidence tracking

## Development

```bash
# Install dependencies
npm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Start production server
npm start
```

## Architecture

The dashboard is built with:
- **Next.js** - React framework with SSR/SSG
- **React Query** - Data fetching and caching
- **Recharts** - Data visualization
- **Tailwind CSS** - Styling
- **WebSocket** - Real-time updates

## Configuration

Environment variables:
```bash
# API endpoint
NEXT_PUBLIC_API_URL=http://localhost:3000

# WebSocket endpoint  
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# Refresh intervals (ms)
NEXT_PUBLIC_AGENT_REFRESH=5000
NEXT_PUBLIC_METRICS_REFRESH=10000
```

## Features

### Agent Management
- View all registered agents
- Monitor agent health and capabilities
- Test individual agents
- View agent execution history

### Pattern Execution
- Browse pattern catalog
- Execute patterns with custom inputs
- Monitor execution progress
- View confidence scores in real-time

### Analytics
- Pattern execution metrics
- Agent performance tracking
- Confidence distribution charts
- System resource usage

### Real-time Updates
- Live execution status
- Agent registration/deregistration
- Confidence score updates
- Error notifications

## Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci --only=production
RUN pnpm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Kubernetes
See `@parallax/k8s-deployment` for Kubernetes manifests.

## Security

- Authentication via `@parallax/auth`
- RBAC for pattern execution
- Secure WebSocket connections
- API key management

## Contributing

1. Follow the design system in `/src/components`
2. Add tests for new features
3. Update documentation
4. Ensure accessibility compliance