# Vercel Deployment Guide for FaceChat

Follow these steps to deploy your FaceChat application to Vercel:

## Prerequisites

1. Push your code to a GitHub repository
2. Have a Vercel account (sign up at vercel.com)

## Step 1: Deploy Backend

1. **Create New Project in Vercel**
   - Go to Vercel dashboard
   - Click "New Project"
   - Import your GitHub repository
   - Set **Root Directory** to `backend`

2. **Configure Build Settings**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Deploy Backend**
   - Click "Deploy"
   - Wait for deployment to complete
   - Note your backend URL (e.g., `https://your-backend-name.vercel.app`)

## Step 2: Update Frontend Environment

1. **Update Production Environment File**
   - Edit `frontend/.env.production`
   - Replace the URL with your actual backend URL:
   ```
   VITE_BACKEND_URL=https://your-actual-backend-url.vercel.app
   ```

2. **Commit and Push Changes**
   ```bash
   git add .
   git commit -m "Update backend URL for production"
   git push
   ```

## Step 3: Deploy Frontend

1. **Create Another New Project in Vercel**
   - Go to Vercel dashboard
   - Click "New Project"
   - Import the same GitHub repository
   - Set **Root Directory** to `frontend`

2. **Configure Build Settings**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Deploy Frontend**
   - Click "Deploy"
   - Wait for deployment to complete
   - Note your frontend URL (e.g., `https://your-frontend-name.vercel.app`)

## Step 4: Update CORS Settings

1. **Update Backend CORS Configuration**
   - Edit `backend/src/index.ts`
   - Replace the frontend URL in the CORS settings:
   ```typescript
   origin: process.env.NODE_ENV === 'production' 
     ? ["https://your-actual-frontend-url.vercel.app"] 
     : ["http://localhost:5173", "http://localhost:5174"]
   ```

2. **Redeploy Backend**
   - Commit and push the changes
   - Vercel will automatically redeploy the backend

## Step 5: Test Your Deployment

1. Open your frontend URL in two different browser tabs/windows
2. Enter names and start video chats
3. Test the video and audio functionality

## Environment Variables Summary

### Frontend (.env.production)
```
VITE_BACKEND_URL=https://your-backend-url.vercel.app
```

### Backend
- `NODE_ENV=production` (automatically set by Vercel)
- `PORT` (automatically set by Vercel)

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure frontend URL is correctly added to backend CORS settings
2. **Build Failures**: Check that all dependencies are listed in package.json
3. **WebRTC Issues**: Ensure HTTPS is used (Vercel provides this automatically)
4. **Socket.IO Connection Issues**: Verify backend URL is correctly set in frontend

### Checking Logs:
- In Vercel dashboard, go to your project
- Click on "Functions" tab to see backend logs
- Click on "Deployments" to see build logs

## Custom Domains (Optional)

You can add custom domains in Vercel:
1. Go to project settings
2. Click "Domains"
3. Add your custom domain
4. Update environment variables with new domain

## Notes

- Both frontend and backend will auto-deploy on Git pushes
- Vercel provides automatic HTTPS certificates
- The app uses WebRTC which requires HTTPS in production
- Socket.IO will automatically fallback to polling if WebSocket fails

Your FaceChat application should now be live and accessible worldwide! 🎉
