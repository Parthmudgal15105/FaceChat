# FaceChat - Video Chat Application

A real-time peer-to-peer video chat application built with React, Node.js, Socket.IO, and WebRTC.

## Features

- 🎥 Real-time video and audio communication
- 🔄 Automatic peer matching
- 🎙️ Mute/unmute functionality
- 📹 Camera on/off controls
- 📱 Responsive design
- 🚀 Modern UI with beautiful animations

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Socket.IO Client for real-time communication
- WebRTC for peer-to-peer video calls
- CSS3 with modern animations

### Backend
- Node.js with Express
- Socket.IO for WebSocket communication
- TypeScript
- WebRTC signaling server

## Deployment

### Deploy Backend to Vercel

1. Create a new Vercel project for the backend
2. Set the root directory to `backend`
3. Deploy the backend first
4. Note the deployed backend URL

### Deploy Frontend to Vercel

1. Update the backend URL in `frontend/.env.production`:
   ```
   VITE_BACKEND_URL=https://your-backend-url.vercel.app
   ```
2. Create a new Vercel project for the frontend
3. Set the root directory to `frontend`
4. Deploy the frontend

### Update CORS Settings

After deploying the frontend, update the backend CORS settings in `backend/src/index.ts`:
```typescript
origin: process.env.NODE_ENV === 'production' 
  ? ["https://your-frontend-url.vercel.app"] 
  : ["http://localhost:5173", "http://localhost:5174"]
```

## Local Development

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

### Frontend (.env.production)
- `VITE_BACKEND_URL` - Backend server URL

### Backend
- `NODE_ENV` - Environment (production/development)
- `PORT` - Server port (automatically set by Vercel)

## Architecture

The application uses a signaling server pattern:
1. Users connect to the Socket.IO server
2. Server matches users and creates rooms
3. WebRTC peer connection is established through signaling
4. Direct peer-to-peer communication for video/audio

## License

MIT License
