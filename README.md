# CarFit Chat - Backend

AI-powered car selection chat service - REST API + WebSocket server.

## 🛠 Tech Stack

- **Runtime:** Node.js 20
- **Framework:** Express 5.2.1
- **WebSocket:** Socket.io 4.8.3
- **ORM:** Prisma 6.2.1
- **Database:** PostgreSQL 16
- **Auth:** JWT (access + refresh tokens)
- **AI:** DeepSeek via OpenRouter
- **External APIs:** auto.dev (TCO calculation)

## 📋 Features

- User registration/authentication (JWT)
- Real-time chat via Socket.io
- AI assistant for car selection
- Vehicle catalog (imported from XML)
- TCO calculation by VIN
- Content moderation
- Admin panel (users, dialogs, logs)

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- npm or pnpm

### Setup

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npm run prisma:migrate

# Seed initial data
npm run seed

# Import vehicle catalog (optional)
npm run import:xml

# Start development server
npm run dev
```

Server will start on http://localhost:3000

## 📦 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio GUI
- `npm run seed` - Seed database with test data
- `npm run import:xml` - Import vehicle catalog from XML
- `npm test` - Run tests

## 🔧 Environment Variables

See `.env.example` for all required variables.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` - JWT secrets
- `DEEPSEEK_API_KEY` - OpenRouter API key for DeepSeek
- `CORS_ORIGINS` - Allowed frontend origins

**Optional:**
- `AUTO_DEV_API_KEY` - auto.dev API key (use 'mock-key' for testing)

## 📚 API Documentation

### REST Endpoints

**Auth:**
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout

**User:**
- `GET /me` - Get current user profile

**Dialogs:**
- `GET /dialogs/me` - Get user's dialog
- `GET /dialogs/me/messages` - Get dialog history

**Cars:**
- `GET /cars/brands` - List brands
- `GET /cars/models?brand=` - List models
- `GET /cars/search?marka=&model=&...` - Search vehicles

**TCO:**
- `GET /tco/by-vin?vin=` - Calculate TCO by VIN

**Admin:**
- `GET /admin/users` - List all users
- `POST /admin/users/:id/reset-password` - Reset user password
- `GET /admin/dialogs` - List all dialogs
- `GET /admin/dialogs/:id/messages` - View dialog history
- `DELETE /admin/dialogs/:id` - Delete dialog
- `GET /admin/dialogs/:id/export` - Export dialog
- `GET /admin/logs?kind=&dialogId=&userId=` - View logs

### WebSocket Events (Socket.io)

**Client → Server:**
- `chat:user_message { dialogId, text }` - Send message

**Server → Client:**
- `chat:assistant_start { messageId }` - Response streaming started
- `chat:assistant_delta { messageId, deltaText }` - Response chunk
- `chat:assistant_done { messageId, finalText, extractedPreferencesJson }` - Response complete
- `chat:error { code, message }` - Error occurred

## 🗄 Database Schema

See `prisma/schema.prisma` for complete schema.

**Main tables:**
- `users` - User accounts and preferences
- `dialogs` - User dialogs (1:1 with users)
- `messages` - Chat message history
- `car_brands`, `car_models`, `car_variants` - Vehicle catalog
- `tco_cache` - Cached TCO results
- `provider_logs` - Integration logs

## 🏗 Architecture

Modular monolith structure:

```
src/
├── modules/
│   ├── auth/          # Authentication & JWT
│   ├── users/         # User management
│   ├── dialogs/       # Dialog management
│   ├── messages/      # Message history
│   ├── cars/          # Vehicle catalog
│   ├── ai/            # LLM orchestration
│   ├── tco/           # auto.dev integration
│   ├── admin/         # Admin panel
│   └── moderation/    # Content moderation
├── middleware/        # Express middleware
├── shared/            # Shared utilities
└── index.ts          # Entry point
```

## 🚀 Deployment

### Render.com (Recommended for MVP)

1. Create account on [render.com](https://render.com)
2. Connect GitHub repository
3. Render will auto-detect `render.yaml`
4. Set environment variables in dashboard
5. Deploy

See `render.yaml` for complete configuration.

### After deployment:

```bash
# SSH into Render Shell and run:
npm run prisma:migrate deploy
npm run seed
```

## 🧪 Testing

```bash
npm test
```

## 📝 License

MIT

## 👤 Author

Vladimir Kopylov
