# FaceChat Frontend

React application for video chat interface.

## Deployment on Vercel

This frontend is configured for Vercel deployment with:
- Vite build system
- Environment variable support
- SPA routing configuration

## Environment Setup

Create `.env.production` with:
```
VITE_BACKEND_URL=https://your-backend-url.vercel.app
```

## Build and Deploy

```bash
npm install
npm run build
```

## Features

- Real-time video chat interface
- Modern responsive design
- WebRTC peer connection management
- Socket.IO integration
