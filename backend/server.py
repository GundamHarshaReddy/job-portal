from fastapi import FastAPI, APIRouter, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import certifi
from apscheduler.schedulers.asyncio import AsyncIOScheduler

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
db = client[os.environ['DB_NAME']]

# Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---- Models ----
class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    telegram_chat_id: Optional[str] = None
    created_at: str

class JobCreate(BaseModel):
    company_name: str
    role: str
    job_type: str  # Job / Internship
    location: str  # Remote / Onsite / Hybrid
    apply_link: str
    deadline: str  # ISO date string
    source: str  # linkedin, glassdoor, company_website, startup

class JobOut(BaseModel):
    id: str
    company_name: str
    role: str
    job_type: str
    location: str
    apply_link: str
    deadline: str
    posted_by: str
    posted_by_name: str
    created_at: str
    source: str = "company_website"

class RankingOut(BaseModel):
    user_id: str
    name: str
    email: str
    job_count: int

class TelegramLink(BaseModel):
    telegram_chat_id: str

# ---- Helpers ----
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ---- Telegram Helpers ----
async def send_telegram_message(chat_id: str, text: str):
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("No Telegram bot token configured")
        return
    try:
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                f"{TELEGRAM_API}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
            )
            if resp.status_code != 200:
                logger.error(f"Telegram send failed: {resp.text}")
    except Exception as e:
        logger.error(f"Telegram error: {e}")

async def notify_all_users(text: str):
    users = await db.users.find(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]},
        {"_id": 0, "telegram_chat_id": 1}
    ).to_list(1000)
    for user in users:
        chat_id = user.get("telegram_chat_id")
        if chat_id:
            await send_telegram_message(chat_id, text)

async def check_deadlines():
    """Check for jobs with deadlines within 24 hours and notify users."""
    now = datetime.now(timezone.utc)
    tomorrow = now + timedelta(hours=24)
    
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(1000)
    for job in jobs:
        try:
            deadline = datetime.fromisoformat(job["deadline"].replace("Z", "+00:00"))
            if now < deadline <= tomorrow:
                msg = (
                    f"<b>Deadline Reminder!</b>\n\n"
                    f"<b>{job['role']}</b> at <b>{job['company_name']}</b>\n"
                    f"Deadline: {job['deadline']}\n"
                    f"Apply: {job['apply_link']}"
                )
                await notify_all_users(msg)
        except Exception:
            pass

# ---- Startup ----
@app.on_event("startup")
async def startup():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.jobs.create_index("id", unique=True)
    
    # Seed admin
    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@friendboard.com')
    admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "telegram_chat_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_doc)
        logger.info(f"Admin account created: {admin_email}")
    
    # Start scheduler for deadline reminders (every 6 hours)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(check_deadlines, 'interval', hours=6)
    scheduler.start()
    logger.info("Deadline reminder scheduler started")

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---- Auth Routes ----
@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "telegram_chat_id": user.get("telegram_chat_id")
        }
    }

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "telegram_chat_id": user.get("telegram_chat_id")
    }

# ---- Admin Routes ----
@api_router.post("/admin/users")
async def create_user(data: UserCreate, request: Request):
    await require_admin(request)
    
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": data.email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": "friend",
        "telegram_chat_id": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    return {
        "id": user_doc["id"],
        "email": user_doc["email"],
        "name": user_doc["name"],
        "role": user_doc["role"],
        "telegram_chat_id": None,
        "created_at": user_doc["created_at"]
    }

@api_router.get("/admin/users")
async def list_users(request: Request):
    await require_admin(request)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    await require_admin(request)
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete admin")
    
    await db.users.delete_one({"id": user_id})
    return {"message": "User deleted"}

# ---- Job Routes ----
@api_router.post("/jobs")
async def create_job(data: JobCreate, request: Request):
    user = await get_current_user(request)
    
    job_doc = {
        "id": str(uuid.uuid4()),
        "company_name": data.company_name,
        "role": data.role,
        "job_type": data.job_type,
        "location": data.location,
        "apply_link": data.apply_link,
        "deadline": data.deadline,
        "posted_by": user["id"],
        "posted_by_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": data.source
    }
    await db.jobs.insert_one(job_doc)
    
    # Send Telegram notification
    msg = (
        f"<b>New Job Posted!</b>\n\n"
        f"<b>{data.role}</b> at <b>{data.company_name}</b>\n"
        f"Source: {data.source.replace('_', ' ').title()}\n"
        f"Type: {data.job_type} | Location: {data.location}\n"
        f"Deadline: {data.deadline}\n"
        f"Posted by: {user['name']}\n"
        f"Apply: {data.apply_link}"
    )
    # Fire and forget
    asyncio.create_task(notify_all_users(msg))
    
    return {
        "id": job_doc["id"],
        "company_name": job_doc["company_name"],
        "role": job_doc["role"],
        "job_type": job_doc["job_type"],
        "location": job_doc["location"],
        "apply_link": job_doc["apply_link"],
        "deadline": job_doc["deadline"],
        "posted_by": job_doc["posted_by"],
        "posted_by_name": job_doc["posted_by_name"],
        "created_at": job_doc["created_at"],
        "source": job_doc["source"]
    }

@api_router.get("/jobs")
async def list_jobs(request: Request):
    await get_current_user(request)
    jobs = await db.jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return jobs

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, request: Request):
    user = await get_current_user(request)
    
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Admin can delete any, friends can only delete own
    if user["role"] != "admin" and job["posted_by"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.jobs.delete_one({"id": job_id})
    return {"message": "Job deleted"}

# ---- Rankings ----
@api_router.get("/rankings")
async def get_rankings(request: Request):
    await get_current_user(request)
    
    pipeline = [
        {"$group": {"_id": "$posted_by", "job_count": {"$sum": 1}}},
        {"$sort": {"job_count": -1}}
    ]
    results = await db.jobs.aggregate(pipeline).to_list(1000)
    
    rankings = []
    for r in results:
        user = await db.users.find_one({"id": r["_id"]}, {"_id": 0})
        if user:
            rankings.append({
                "user_id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "job_count": r["job_count"]
            })
    
    return rankings

# ---- User Profile / Telegram ----
@api_router.put("/users/telegram")
async def link_telegram(data: TelegramLink, request: Request):
    user = await get_current_user(request)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"telegram_chat_id": data.telegram_chat_id}}
    )
    return {"message": "Telegram linked", "telegram_chat_id": data.telegram_chat_id}

# ---- Telegram Webhook ----
@api_router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    data = await request.json()
    
    if "message" in data:
        message = data["message"]
        chat_id = str(message["chat"]["id"])
        text = message.get("text", "")
        
        if text.startswith("/start"):
            # Try to extract user email from /start command
            parts = text.split(" ")
            if len(parts) > 1:
                email = parts[1]
                result = await db.users.update_one(
                    {"email": email},
                    {"$set": {"telegram_chat_id": chat_id}}
                )
                if result.modified_count > 0:
                    await send_telegram_message(chat_id, "Your Telegram is now linked to FriendBoard! You'll receive job notifications here.")
                else:
                    await send_telegram_message(chat_id, "Could not find an account with that email. Make sure admin has created your account first.")
            else:
                await send_telegram_message(chat_id, "Welcome to FriendBoard Bot!\n\nTo link your account, use:\n/start your@email.com\n\nOr link via the app settings.")
    
    return {"ok": True}

# ---- Stats (Admin) ----
@api_router.get("/admin/stats")
async def get_stats(request: Request):
    await require_admin(request)
    
    total_users = await db.users.count_documents({})
    total_friends = await db.users.count_documents({"role": "friend"})
    total_jobs = await db.jobs.count_documents({})
    
    # Jobs posted today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_jobs = await db.jobs.count_documents({
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    return {
        "total_users": total_users,
        "total_friends": total_friends,
        "total_jobs": total_jobs,
        "today_jobs": today_jobs
    }

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
