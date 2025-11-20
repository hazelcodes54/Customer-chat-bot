# Deployment Guide for Render

## Prerequisites
- GitHub repository
- Render account (free tier works)
- OpenAI API key

## Deploy Backend (FastAPI)

1. **Create New Web Service** on Render
   - Connect your GitHub repository
   - Select this root directory
   - Settings:
     - **Name**: `customer-chatbot-api` (or your choice)
     - **Environment**: `Python 3`
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

2. **Add Environment Variables**:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `ALLOWED_ORIGINS`: `https://your-frontend-url.onrender.com` (add after frontend is deployed)

3. **Deploy** - Copy the backend URL (e.g., `https://customer-chatbot-api.onrender.com`)

## Deploy Frontend (React)

1. **Create New Static Site** on Render
   - Connect your GitHub repository
   - Select the `chatbot-frontend` directory as root
   - Settings:
     - **Name**: `customer-chatbot` (or your choice)
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `build`

2. **Add Environment Variable**:
   - `REACT_APP_API_URL`: Your backend URL from step 1 (e.g., `https://customer-chatbot-api.onrender.com`)

3. **Deploy**

4. **Update Backend CORS**:
   - Go back to your backend service
   - Update `ALLOWED_ORIGINS` to include your frontend URL
   - Example: `https://customer-chatbot.onrender.com`

## Important Notes

- Both services will be deployed on free tier (may sleep after inactivity)
- First request may be slow due to cold start
- Database (SQLite) will reset on redeployment - consider upgrading to PostgreSQL for production
- Keep your `.env` files local - never commit them!

## Local Development

Backend:
```bash
python -m uvicorn main:app --reload
```

Frontend:
```bash
cd chatbot-frontend
npm start
```
