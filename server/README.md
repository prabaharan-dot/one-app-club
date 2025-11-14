Server for One App Club

# install
cd server
npm install

# create .env from .env.example and fill GOOGLE_CLIENT_ID and SECRET

# dev
npm run dev

Endpoints
- GET /api/auth/url -> returns Google OAuth URL
- GET /api/auth/oauth2callback -> OAuth callback
- GET /api/auth/me -> current user
