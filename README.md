# FriendBoard - Private Job Posting App

A full-stack application for sharing job opportunities among friends.

## 🚀 Quick Start

### 1. Start the Backend
Open a terminal and run:
```bash
cd backend
python3 -m uvicorn server:app --reload --port 8000
```
- The API will be available at `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`

### 2. Start the Frontend
Open a **new** terminal tab/window and run:
```bash
cd frontend
npm start
```
- The app will open at `http://localhost:3000`

---

## 🛠️ Configuration

### Environment Variables
Ensure you have `.env` files in both `backend/` and `frontend/`.

#### Backend (`backend/.env`)
```ini
MONGO_URL="mongodb+srv://..."
DB_NAME="friendboard_production"
JWT_SECRET="your_secret"
TELEGRAM_BOT_TOKEN="your_token"
ADMIN_EMAIL="admin@friendboard.com"
```

#### Frontend (`frontend/.env`)
```ini
REACT_APP_BACKEND_URL="http://localhost:8000"
```

## 📚 Documentation
- [Deployment Guide](DEPLOYMENT.md)
- [Database Setup](DATABASE_SETUP.md)
