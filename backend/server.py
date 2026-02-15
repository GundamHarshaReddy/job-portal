from fastapi import FastAPI, APIRouter, HTTPException, Request, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, Any
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

class JobUpdate(BaseModel):
    company_name: Optional[str] = None
    role: Optional[str] = None
    job_type: Optional[str] = None
    location: Optional[str] = None
    apply_link: Optional[str] = None
    deadline: Optional[str] = None
    source: Optional[str] = None

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
    with open("debug_auth.log", "a") as f:
        f.write(f"{datetime.now()}: Auth Header: '{auth_header}'\n")

    if not auth_header.startswith("Bearer "):
        with open("debug_auth.log", "a") as f:
            f.write(f"{datetime.now()}: Missing or invalid Bearer prefix\n")
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        with open("debug_auth.log", "a") as f:
            f.write(f"{datetime.now()}: Token Payload: {payload}\n")
    except jwt.ExpiredSignatureError:
        with open("debug_auth.log", "a") as f:
            f.write(f"{datetime.now()}: Token Expired\n")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        with open("debug_auth.log", "a") as f:
            f.write(f"{datetime.now()}: Invalid Token: {e}\n")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        with open("debug_auth.log", "a") as f:
            f.write(f"{datetime.now()}: Detailed Auth Error: {type(e).__name__} - {e}\n")
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")
    
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        with open("debug_auth.log", "a") as f:
            f.write(f"{datetime.now()}: User not found for ID {payload.get('user_id')}\n")
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ---- Bot Event Logger ----
async def log_bot_event(
    event_type: str,
    chat_id: str = "",
    user_email: str = "",
    user_name: str = "",
    job_id: str = "",
    job_title: str = "",
    action: str = "",
    metadata: Optional[dict] = None
):
    """Log a bot interaction event for analytics."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "chat_id": chat_id,
            "user_email": user_email,
            "user_name": user_name,
            "job_id": job_id,
            "job_title": job_title,
            "action": action,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.bot_events.insert_one(doc)
    except Exception as e:
        logger.error(f"Failed to log bot event: {e}")

# ---- Telegram Helpers ----
async def send_telegram_message(chat_id: str, text: str, reply_markup: Optional[dict] = None):
    """Send a Telegram message, optionally with inline keyboard buttons. Includes retry mechanism."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("No Telegram bot token configured")
        return
    
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
        
    for attempt in range(5): # Retry up to 5 times
        try:
            async with httpx.AsyncClient() as client_http:
                resp = await client_http.post(
                    f"{TELEGRAM_API}/sendMessage",
                    json=payload
                )
                if resp.status_code == 200:
                    return
                elif resp.status_code == 429:
                    retry_after = int(resp.json().get("parameters", {}).get("retry_after", 5))
                    logger.warning(f"Rate limited. Sleeping for {retry_after}s...")
                    await asyncio.sleep(retry_after)
                else:
                    logger.error(f"Telegram send failed: {resp.text}")
                    return # Don't retry other errors for now
        except Exception as e:
            logger.error(f"Telegram error: {e}")
            await asyncio.sleep(1) # Basic backoff

async def send_telegram_photo(chat_id: str, photo_bytes: bytes, caption: str = ""):
    """Send a photo to Telegram."""
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                f"{TELEGRAM_API}/sendPhoto",
                data={"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"},
                files={"photo": ("image.jpg", photo_bytes, "image/jpeg")}
            )
            if resp.status_code != 200:
                logger.error(f"Telegram photo send failed: {resp.text}")
    except Exception as e:
        logger.error(f"Telegram photo error: {e}")

async def answer_callback_query(callback_query_id: str, text: str = ""):
    """Acknowledge a callback query (removes loading spinner on button)."""
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient() as client_http:
            await client_http.post(
                f"{TELEGRAM_API}/answerCallbackQuery",
                json={"callback_query_id": callback_query_id, "text": text}
            )
    except Exception as e:
        logger.error(f"Callback query error: {e}")

async def edit_telegram_message(chat_id: str, message_id: int, text: str):
    """Edit an existing Telegram message (used to update after button click)."""
    if not TELEGRAM_BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient() as client_http:
            await client_http.post(
                f"{TELEGRAM_API}/editMessageText",
                json={"chat_id": chat_id, "message_id": message_id, "text": text, "parse_mode": "HTML"}
            )
    except Exception as e:
        logger.error(f"Edit message error: {e}")

def build_job_buttons(job_id: str) -> dict:
    """Build inline keyboard with Applied / Not Interested / Remind Me Later buttons."""
    return {
        "inline_keyboard": [
            [
                {"text": "\u2705 Applied", "callback_data": f"applied:{job_id}"},
                {"text": "\u274c Not Interested", "callback_data": f"not_interested:{job_id}"}
            ],
            [
                {"text": "\U0001f514 Remind Me Later", "callback_data": f"remind:{job_id}"}
            ]
        ]
    }

async def notify_all_users_new_job(text: str, job_id: str, job_title: str = ""):
    """Send a new job notification with inline buttons to all linked users. Throttled."""
    users = await db.users.find(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]},
        {"_id": 0, "telegram_chat_id": 1, "email": 1, "name": 1}
    ).to_list(1000)
    buttons = build_job_buttons(job_id)
    
    for user in users:
        chat_id = user.get("telegram_chat_id")
        if chat_id:
            try:
                await send_telegram_message(chat_id, text, reply_markup=buttons)
                await log_bot_event(
                    event_type="job_notification_sent",
                    chat_id=chat_id,
                    user_email=user.get("email", ""),
                    user_name=user.get("name", ""),
                    job_id=job_id,
                    job_title=job_title,
                    action="notification_sent"
                )
                # Rate limit to ~20 messages per second
                await asyncio.sleep(0.05) 
            except Exception as e:
                logger.error(f"Failed to notify {chat_id}: {e}")
async def check_deadlines():
    """Check for jobs with upcoming deadlines and notify all users except those who opted out."""
    now = datetime.now(timezone.utc)
    
    # Get all linked users
    all_users = await db.users.find(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]},
        {"_id": 0, "telegram_chat_id": 1}
    ).to_list(1000)
    all_chat_ids = [u["telegram_chat_id"] for u in all_users if u.get("telegram_chat_id")]
    
    if not all_chat_ids:
        return
    
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(1000)
    for job in jobs:
        try:
            deadline = datetime.fromisoformat(job["deadline"].replace("Z", "+00:00"))
            if deadline <= now:
                continue  # Skip expired jobs
            
            hours_left = (deadline - now).total_seconds() / 3600
            job_id = job["id"]
            
            # Find users who clicked "Applied" or "Not Interested" — they opted OUT
            opted_out = await db.job_responses.find(
                {"job_id": job_id, "response": {"$in": ["applied", "not_interested"]}}
            ).to_list(1000)
            opted_out_chat_ids = {r["chat_id"] for r in opted_out}
            
            # Everyone else gets reminders (no response = default remind)
            remind_chat_ids = [cid for cid in all_chat_ids if cid not in opted_out_chat_ids]
            
            for chat_id in remind_chat_ids:
                # Check cooldown: every 6h if deadline <= 24h, every 24h otherwise
                if hours_left <= 24:
                    cooldown_hours = 6
                else:
                    cooldown_hours = 24
                
                # Check if we already sent a reminder within the cooldown period
                cutoff = now - timedelta(hours=cooldown_hours - 0.5)  # 30 min buffer
                already_sent = await db.reminder_log.find_one({
                    "chat_id": chat_id,
                    "job_id": job_id,
                    "sent_at": {"$gte": cutoff.isoformat()}
                })
                
                if already_sent:
                    continue  # Already reminded recently
                
                # Determine urgency label
                if hours_left <= 6:
                    urgency = "\U0001f6a8 URGENT"
                elif hours_left <= 24:
                    urgency = "\u23f0 Less than 24 hours left"
                else:
                    days_left = int(hours_left / 24)
                    urgency = f"\U0001f4c5 {days_left} day{'s' if days_left != 1 else ''} left"
                
                msg = (
                    f"<b>{urgency}</b>\n\n"
                    f"<b>{job['role']}</b> at <b>{job['company_name']}</b>\n"
                    f"Deadline: {job['deadline']}\n"
                    f"Apply: {job['apply_link']}"
                )
                await send_telegram_message(chat_id, msg)
                
                # Log that we sent this reminder
                await db.reminder_log.insert_one({
                    "chat_id": chat_id,
                    "job_id": job_id,
                    "sent_at": now.isoformat()
                })
                # Log bot event for analytics
                await log_bot_event(
                    event_type="reminder_sent",
                    chat_id=chat_id,
                    job_id=job_id,
                    job_title=f"{job['role']} at {job['company_name']}"
                )
        except Exception as e:
            logger.error(f"Deadline check error for job {job.get('id', '?')}: {e}")

# ---- Startup ----
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.jobs.create_index("id", unique=True)
    await db.job_responses.create_index([("chat_id", 1), ("job_id", 1)], unique=True)
    await db.reminder_log.create_index([("chat_id", 1), ("job_id", 1), ("sent_at", 1)])
    await db.bot_events.create_index("created_at")
    await db.bot_events.create_index("event_type")
    await db.bot_events.create_index("chat_id")
    

    # Seed admin
    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@friendboard.com')
    admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
    desired_name = "GUNDAM HARSHA VARDHAN REDDY"
    
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": desired_name,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "telegram_chat_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_doc)
        logger.info(f"Admin account created: {admin_email}")
    elif existing.get("name") != desired_name:
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"name": desired_name}}
        )
        logger.info(f"Admin name updated to {desired_name}")
    
    # Start scheduler for deadline reminders (every 6 hours)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(check_deadlines, 'interval', hours=6)
    
    scheduler.start()
    logger.info("Deadline reminder scheduler started")
    
    yield
    
    # Shutdown
    client.close()

app = FastAPI(lifespan=lifespan)

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
        f"Deadline: {data.deadline[:10]}\n"
        f"Posted by: {user['name']}\n"
        f"Apply: {data.apply_link}"
    )
    # Fire and forget — send with inline buttons
    asyncio.create_task(notify_all_users_new_job(msg, job_doc["id"], job_title=f"{data.role} at {data.company_name}"))
    
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

@api_router.put("/jobs/{job_id}")
async def update_job(job_id: str, data: JobUpdate, request: Request):
    user = await get_current_user(request)
    
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    # Check ownership or admin status
    if job.get("posted_by") != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own jobs")
    
    update_data = {k: v for k, v in data.dict(exclude_unset=True).items()}
    
    if not update_data:
        # Return job without _id
        job.pop("_id", None)
        return job
        
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": update_data}
    )
    
    updated_job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    return updated_job

@api_router.get("/jobs")
async def list_jobs(request: Request):
    await get_current_user(request)
    # Filter out expired jobs from the list view as well, just in case
    now = datetime.now(timezone.utc).isoformat()
    jobs = await db.jobs.find({"deadline": {"$gte": now}}, {"_id": 0}).sort("created_at", -1).to_list(1000)
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
    # Cascade: clean up related responses and bot events
    await db.job_responses.delete_many({"job_id": job_id})
    await db.bot_events.delete_many({"job_id": job_id})
    return {"message": "Job deleted"}

# ---- Rankings ----
@api_router.get("/rankings")
async def get_rankings(request: Request):
    await get_current_user(request)
    
    # 1. Get job counts per user
    job_counts = {}
    pipeline = [
        {"$group": {"_id": "$posted_by", "count": {"$sum": 1}}}
    ]
    results = await db.jobs.aggregate(pipeline).to_list(1000)
    for r in results:
        job_counts[r["_id"]] = r["count"]

    # 2. Get all users
    users = await db.users.find({}, {"_id": 0, "password": 0, "telegram_chat_id": 0}).to_list(1000)
    
    # 3. Build rankings list
    rankings = []
    for user in users:
        count = job_counts.get(user["id"], 0)
        rankings.append({
            "user_id": user["id"],
            "name": user["name"],
            # Email removed for privacy
            "job_count": count
        })
    
    # 4. Sort by job_count (desc), then name (asc)
    rankings.sort(key=lambda x: (-x["job_count"], x["name"]))
    
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

# ---- Admin Broadcast ----
@api_router.post("/admin/broadcast")
async def broadcast_message(
    request: Request,
    message: str = Form(...),
    photo: Optional[UploadFile] = File(None)
):
    await require_admin(request)
    
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    users = await db.users.find(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]},
        {"_id": 0, "telegram_chat_id": 1, "email": 1, "name": 1}
    ).to_list(1000)
    
    sent_count: int = 0
    failed_count: int = 0
    
    # Read photo bytes once if present
    photo_bytes = None
    if photo:
        photo_bytes = await photo.read()
    
    for user in users:
        chat_id = user.get("telegram_chat_id")
        if chat_id:
            try:
                if photo_bytes:
                    await send_telegram_photo(chat_id, photo_bytes, caption=message)
                else:
                    await send_telegram_message(chat_id, message)
                
                sent_count += 1
                await log_bot_event(
                    event_type="broadcast_sent",
                    chat_id=chat_id,
                    user_email=user.get("email", ""),
                    user_name=user.get("name", ""),
                    metadata={"message_preview": message[:100], "has_photo": bool(photo)}
                )
            except Exception as e:
                logger.error(f"Failed to send to chat_id {chat_id}: {e}")
                failed_count += 1
    
    return {"message": "Broadcast sent", "sent_count": sent_count, "failed_count": failed_count}

# ---- Telegram Webhook ----
@api_router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    data = await request.json()
    
    # Handle regular messages (e.g. /start command)
    if "message" in data:
        message = data["message"]
        chat_id = str(message["chat"]["id"])
        text = message.get("text", "")
        
        if text.startswith("/start"):
            parts = text.split(" ")
            if len(parts) > 1:
                email = parts[1]
                user = await db.users.find_one({"email": email}, {"_id": 0})
                
                if not user:
                    await send_telegram_message(chat_id, "\u274c Could not find an account with that email. Make sure admin has created your account first.")
                    await log_bot_event(event_type="link_failed", chat_id=chat_id, user_email=email, metadata={"reason": "email_not_found"})
                elif user.get("telegram_chat_id") and user["telegram_chat_id"] == chat_id:
                    # Same user re-linking from the same account
                    await send_telegram_message(chat_id, "\u2705 Your Telegram is already linked to FriendBoard!")
                    await log_bot_event(event_type="command_start", chat_id=chat_id, user_email=email, user_name=user.get("name", ""), metadata={"reason": "already_linked"})
                elif user.get("telegram_chat_id") and user["telegram_chat_id"] != chat_id:
                    # Someone else trying to hijack this email's Telegram link
                    await send_telegram_message(chat_id, "\u26d4 This email is already linked to another Telegram account. If this is your email, please contact the admin to unlink it first.")
                    # Notify the original linked user about the attempt
                    await send_telegram_message(user["telegram_chat_id"], f"\u26a0\ufe0f <b>Security Alert:</b> Someone tried to re-link your FriendBoard account ({email}) from a different Telegram account. If this wasn't you, no action is needed — your link is safe.")
                    await log_bot_event(event_type="link_failed", chat_id=chat_id, user_email=email, metadata={"reason": "hijack_attempt"})
                else:
                    # First time linking — no existing chat_id
                    await db.users.update_one(
                        {"email": email},
                        {"$set": {"telegram_chat_id": chat_id}}
                    )
                    await send_telegram_message(chat_id, "\u2705 Your Telegram is now linked to FriendBoard! You'll receive job notifications here.")
                    await log_bot_event(event_type="link_success", chat_id=chat_id, user_email=email, user_name=user.get("name", ""))
            else:
                await send_telegram_message(
                    chat_id,
                    "\U0001f44b <b>Welcome to FriendBoard Bot!</b>\n\n"
                    "To link your account, use:\n"
                    "<code>/start your@email.com</code>\n\n"
                    "To unlink and stop notifications:\n"
                    "<code>/stop your@email.com</code>\n\n"
                    "Once linked, you'll receive job notifications with these options:\n"
                    "\u2705 <b>Applied</b> — stop reminders for that job\n"
                    "\u274c <b>Not Interested</b> — stop reminders for that job\n"
                    "\U0001f514 <b>Remind Me Later</b> — get reminders until the deadline"
                )
                await log_bot_event(event_type="command_start", chat_id=chat_id, metadata={"reason": "no_email_provided"})
        
        elif text.startswith("/stop"):
            parts = text.split(" ")
            if len(parts) > 1:
                email = parts[1]
                user = await db.users.find_one({"email": email}, {"_id": 0})
                
                if not user:
                    await send_telegram_message(chat_id, "\u274c No account found with that email.")
                elif not user.get("telegram_chat_id"):
                    await send_telegram_message(chat_id, "\u2139\ufe0f This account doesn't have Telegram linked.")
                elif user["telegram_chat_id"] != chat_id:
                    await send_telegram_message(chat_id, "\u26d4 You can only unlink from the same Telegram account that was linked.")
                else:
                    await db.users.update_one(
                        {"email": email},
                        {"$set": {"telegram_chat_id": None}}
                    )
                    await send_telegram_message(chat_id, "\u2705 Telegram unlinked! You will no longer receive notifications.\n\nTo re-link, use:\n<code>/start " + email + "</code>")
                    await log_bot_event(event_type="unlink_success", chat_id=chat_id, user_email=email, user_name=user.get("name", ""))
            else:
                await send_telegram_message(chat_id, "\u2139\ufe0f To stop notifications, use:\n<code>/stop your@email.com</code>")
        
        elif text.startswith("/status"):
            user = await db.users.find_one({"telegram_chat_id": chat_id}, {"_id": 0, "email": 1, "name": 1})
            if user:
                await send_telegram_message(
                    chat_id,
                    f"\u2705 <b>Linked Account</b>\n\n"
                    f"Name: <b>{user.get('name', 'N/A')}</b>\n"
                    f"Email: <code>{user['email']}</code>\n\n"
                    f"To unlink, use:\n<code>/stop {user['email']}</code>"
                )
            else:
                await send_telegram_message(chat_id, "\u274c No account is linked to this Telegram chat.\n\nTo link, use:\n<code>/start your@email.com</code>")
    
    # Handle inline button clicks (callback queries)
    if "callback_query" in data:
        callback = data["callback_query"]
        callback_id = callback["id"]
        chat_id = str(callback["message"]["chat"]["id"])
        message_id = callback["message"]["message_id"]
        original_text = callback["message"].get("text", "")
        callback_data = callback.get("data", "")
        
        # Parse callback: "applied:JOB_ID", "not_interested:JOB_ID", "remind:JOB_ID"
        parts = callback_data.split(":", 1)
        if len(parts) == 2:
            action, job_id = parts
            
            if action in ("applied", "not_interested", "remind"):
                # Look up job info first
                btn_job = await db.jobs.find_one({"id": job_id}, {"_id": 0, "role": 1, "company_name": 1})
                job_title_str = f"{btn_job['role']} at {btn_job['company_name']}" if btn_job else ""
                
                # Save response (upsert — one response per user per job)
                await db.job_responses.update_one(
                    {"chat_id": chat_id, "job_id": job_id},
                    {"$set": {
                        "response": action,
                        "job_title": job_title_str,
                        "responded_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
                
                # Resolve user info for the event log
                btn_user = await db.users.find_one({"telegram_chat_id": chat_id}, {"_id": 0, "email": 1, "name": 1})
                await log_bot_event(
                    event_type="button_click",
                    chat_id=chat_id,
                    user_email=btn_user.get("email", "") if btn_user else "",
                    user_name=btn_user.get("name", "") if btn_user else "",
                    job_id=job_id,
                    job_title=job_title_str,
                    action=action
                )
                
                # Build confirmation and edit the original message
                if action == "applied":
                    status_line = "\n\n\u2705 <i>You marked this as Applied. No more reminders for this job.</i>"
                    popup = "Marked as Applied!"
                elif action == "not_interested":
                    status_line = "\n\n\u274c <i>You marked this as Not Interested. No more reminders for this job.</i>"
                    popup = "Marked as Not Interested."
                else:  # remind
                    status_line = "\n\n\U0001f514 <i>Reminder set! You'll be reminded every 24h, and every 6h in the last day.</i>"
                    popup = "Reminder set! \U0001f514"
                
                # Edit the message to show the choice and remove buttons
                await edit_telegram_message(chat_id, message_id, original_text + status_line)
                await answer_callback_query(callback_id, popup)
            else:
                await answer_callback_query(callback_id, "Unknown action")
        else:
            await answer_callback_query(callback_id, "Invalid data")
    
    return {"ok": True}

@api_router.get("/users/me/jobs")
async def get_my_jobs(request: Request):
    user = await get_current_user(request)
    jobs = await db.jobs.find({"posted_by": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return jobs

# ---- Get Jobs (Public) ----
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

# ---- Bot Analytics ----
@api_router.get("/admin/bot-analytics")
async def get_bot_analytics(request: Request):
    await require_admin(request)
    now = datetime.now(timezone.utc)
    
    # --- Overview Stats ---
    total_users = await db.users.count_documents({})
    total_linked = await db.users.count_documents(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]}
    )
    
    # Active jobs (deadline > now)
    now_iso = now.isoformat()
    total_active_jobs = await db.jobs.count_documents({"deadline": {"$gt": now_iso}})

    # Total jobs ever posted (Approximation: count distinct job_ids from notifications sent)
    # Since we delete expired jobs, we can't just count db.jobs
    # We use bot_events to track history
    historical_jobs = await db.bot_events.distinct("job_id", {"event_type": "job_notification_sent"})
    total_jobs_posted = len(historical_jobs)
    # Fallback: if event history is empty/cleared, at least show current active count
    if total_jobs_posted < total_active_jobs:
        total_jobs_posted = total_active_jobs

    total_bot_events = await db.bot_events.count_documents({})
    total_button_clicks = await db.bot_events.count_documents({"event_type": "button_click"})
    total_jobs_notified = await db.bot_events.count_documents({"event_type": "job_notification_sent"})
    total_broadcasts = await db.bot_events.count_documents({"event_type": "broadcast_sent"})
    total_reminders = await db.bot_events.count_documents({"event_type": "reminder_sent"})
    
    # --- Response Breakdown ---
    pipeline = [
        {"$group": {"_id": "$response", "count": {"$sum": 1}}}
    ]
    resp_agg = await db.job_responses.aggregate(pipeline).to_list(10)
    response_breakdown = {r["_id"]: r["count"] for r in resp_agg}
    
    # --- Per-job responses (Top 10 active/recent) ---
    # We prioritize active jobs first by filtering out expired ones
    # This ensures the table only shows jobs that are currently live
    jobs = await db.jobs.find({"deadline": {"$gt": now_iso}}, {"_id": 0}).sort("created_at", -1).to_list(10)
    per_job_responses = []
    
    for job in jobs:
        job_id = job["id"]
        job_title = f"{job['role']} at {job['company_name']}"
        
        # Count notifications sent for this job
        notified_count = await db.bot_events.count_documents(
            {"event_type": "job_notification_sent", "job_id": job_id}
        )
        
        # Get responses for this job
        job_resp_pipeline = [
            {"$match": {"job_id": job_id}},
            {"$group": {"_id": "$response", "count": {"$sum": 1}}}
        ]
        job_resp_agg = await db.job_responses.aggregate(job_resp_pipeline).to_list(10)
        applied = 0
        not_interested = 0
        remind = 0
        for r in job_resp_agg:
            if r["_id"] == "applied":
                applied = r["count"]
            elif r["_id"] == "not_interested":
                not_interested = r["count"]
            elif r["_id"] == "remind":
                remind = r["count"]
        total_responded = int(applied) + int(not_interested) + int(remind)
        no_response = max(0, int(notified_count) - total_responded)
        rate = round((total_responded / notified_count * 100), 1) if notified_count > 0 else 0
        per_job_responses.append({
            "job_id": job_id,
            "job_title": job_title,
            "company": job["company_name"],
            "total_notified": notified_count,
            "applied": applied,
            "not_interested": not_interested,
            "remind": remind,
            "no_response": no_response,
            "response_rate": rate
        })

    # --- Per-user activity from job_responses ---
    user_pipeline = [
        {"$group": {
            "_id": "$chat_id",
            "total_clicks": {"$sum": 1},
            "applied": {"$sum": {"$cond": [{"$eq": ["$response", "applied"]}, 1, 0]}},
            "not_interested": {"$sum": {"$cond": [{"$eq": ["$response", "not_interested"]}, 1, 0]}},
            "remind": {"$sum": {"$cond": [{"$eq": ["$response", "remind"]}, 1, 0]}},
            "last_active": {"$max": "$responded_at"}
        }}
    ]
    user_agg = await db.job_responses.aggregate(user_pipeline).to_list(100)
    per_user_activity = []
    for u in user_agg:
        chat_id = u["_id"]
        user_doc = await db.users.find_one({"telegram_chat_id": chat_id}, {"_id": 0, "name": 1, "email": 1})
        per_user_activity.append({
            "user_name": user_doc.get("name", "Unknown") if user_doc else "Unknown",
            "user_email": user_doc.get("email", "") if user_doc else "",
            "chat_id": chat_id,
            "total_clicks": u["total_clicks"],
            "applied": u["applied"],
            "not_interested": u["not_interested"],
            "remind": u["remind"],
            "last_active": u.get("last_active", "")
        })
    per_user_activity.sort(key=lambda x: x["total_clicks"], reverse=True)

    # --- Recent events (last 100) ---
    recent_events_raw = await db.bot_events.find(
        {}, {"_id": 0, "id": 0, "metadata": 0}
    ).sort("created_at", -1).to_list(100)
    recent_events = []
    for ev in recent_events_raw:
        recent_events.append({
            "event_type": ev.get("event_type", ""),
            "user_name": ev.get("user_name", ""),
            "user_email": ev.get("user_email", ""),
            "action": ev.get("action", ""),
            "job_title": ev.get("job_title", ""),
            "chat_id": ev.get("chat_id", ""),
            "created_at": ev.get("created_at", "")
        })

    # --- Daily activity (last 30 days) ---
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    daily_pipeline = [
        {"$match": {"created_at": {"$gte": thirty_days_ago}}},
        {"$addFields": {"date": {"$substr": ["$created_at", 0, 10]}}},
        {"$group": {
            "_id": "$date",
            "clicks": {"$sum": {"$cond": [{"$eq": ["$event_type", "button_click"]}, 1, 0]}},
            "notifications": {"$sum": {"$cond": [{"$eq": ["$event_type", "job_notification_sent"]}, 1, 0]}},
            "reminders": {"$sum": {"$cond": [{"$eq": ["$event_type", "reminder_sent"]}, 1, 0]}},
            "total": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_agg = await db.bot_events.aggregate(daily_pipeline).to_list(31)
    daily_activity = []
    for d in daily_agg:
        daily_activity.append({
            "date": d["_id"],
            "clicks": d["clicks"],
            "notifications": d["notifications"],
            "reminders": d["reminders"],
            "total": d["total"]
        })

    return {
        "overview": {
            "total_linked_users": total_linked,
            "total_users": total_users,
            "total_bot_events": total_bot_events,
            "total_button_clicks": total_button_clicks,
            "total_jobs_notified": total_jobs_notified,
            "total_active_jobs": total_active_jobs,  # New
            "total_jobs_posted": total_jobs_posted,  # New (Historical)
            "total_broadcasts_sent": total_broadcasts,
            "total_reminders_sent": total_reminders
        },
        "response_breakdown": response_breakdown,
        "per_job_responses": per_job_responses,
        "per_user_activity": per_user_activity,
        "recent_events": recent_events,
        "daily_activity": daily_activity
    }

@api_router.get("/admin/bot-analytics/user/{chat_id}")
async def get_user_bot_detail(chat_id: str, request: Request):
    await require_admin(request)
    
    # Get all job responses for this user
    responses = await db.job_responses.find(
        {"chat_id": chat_id}, {"_id": 0}
    ).sort("responded_at", -1).to_list(100)
    
    # Enrich with job titles
    detailed = []
    for r in responses:
        job_title = r.get("job_title", "")
        if not job_title and r.get("job_id"):
            job = await db.jobs.find_one({"id": r["job_id"]}, {"_id": 0, "role": 1, "company_name": 1})
            if job:
                job_title = f"{job.get('role', 'Unknown')} at {job.get('company_name', 'Unknown')}"
        detailed.append({
            "job_id": r.get("job_id", ""),
            "job_title": job_title,
            "response": r.get("response", ""),
            "responded_at": r.get("responded_at", "")
        })
    
    # Get recent bot events for this user
    events = await db.bot_events.find(
        {"chat_id": chat_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    recent_events = []
    for ev in events:
        recent_events.append({
            "event_type": ev.get("event_type", ""),
            "action": ev.get("action", ""),
            "job_title": ev.get("job_title", ""),
            "metadata": ev.get("metadata", {}),
            "created_at": ev.get("created_at", "")
        })
    
    return {
        "responses": detailed,
        "events": recent_events
    }



# ---- Scheduled Tasks ----
async def cleanup_expired_jobs():
    """Delete jobs that have passed their deadline."""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.jobs.delete_many({"deadline": {"$lt": now}})
    if result.deleted_count > 0:
        logger.info(f"Deleted {result.deleted_count} expired jobs")
        # Cleanup related data
        # Note: In a real app, we might want to keep the job but mark as archived
        # For now, we delete to keep it simple as requested
        # We could also find the IDs first to be more precise with cascading
        pass

async def check_reminders():
    """Send reminders to users who clicked 'Remind Me Later'."""
    # Logic: Find bot events of type 'button_click' with action 'remind' 
    # where created_at is older than X hours (e.g., 24 hours) and no reminder sent yet.
    # For simplicity/demo: querying job_responses with response='remind'
    
    # 1. Find all 'remind' responses
    reminders = await db.job_responses.find({"response": "remind"}).to_list(1000)
    
    count = 0
    for r in reminders:
        # Check if we already sent a reminder for this specific user+job combo
        # We can check bot_events for event_type='reminder_sent'
        already_sent = await db.bot_events.find_one({
            "event_type": "reminder_sent",
            "chat_id": r["chat_id"],
            "job_id": r["job_id"]
        })
        
        if not already_sent:
            # Check if enough time has passed (e.g., 4 hours for testing/demo, or user defined)
            # responded_at is ISO string
            responded_at = datetime.fromisoformat(r["responded_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > responded_at + timedelta(hours=4):
                # Send reminder
                job = await db.jobs.find_one({"id": r["job_id"]})
                if job:
                    msg = (
                        f"⏰ <b>Reminder: You asked to be reminded about this job!</b>\n\n"
                        f"<b>{job.get('role')}</b> at <b>{job.get('company_name')}</b>\n"
                        f"Deadline: {job.get('deadline', '')[:10]}\n"
                        f"Apply: {job.get('apply_link')}"
                    )
                    try:
                        # Re-send with buttons (Applied/Not Interested) to allow them to update status
                        await send_telegram_message(r["chat_id"], msg, reply_markup=build_job_buttons(job["id"]))
                        
                        # Log the event so we don't send again
                        await log_bot_event(
                            event_type="reminder_sent",
                            chat_id=r["chat_id"],
                            user_email="", # Could fetch user if needed
                            user_name="",
                            job_id=job["id"],
                            job_title=f"{job.get('role')} at {job.get('company_name')}",
                            action="reminder_sent"
                        )
                        count += 1
                    except Exception as e:
                        logger.error(f"Failed to send reminder to {r['chat_id']}: {e}")

    if count > 0:
        logger.info(f"Sent {count} reminders")

# ---- Force Push Endpoint ----
@api_router.post("/admin/force-push-jobs")
async def force_push_jobs(request: Request):
    await require_admin(request)
    
    # 1. Get all active active jobs (deadline > now)
    now = datetime.now(timezone.utc).isoformat()
    jobs = await db.jobs.find({"deadline": {"$gt": now}}).sort("created_at", -1).to_list(50) # Limit to 50 to avoid spamming too much
    
    if not jobs:
        return {"message": "No active jobs to push", "count": 0}

    # 2. Get count of linked users for reporting
    user_count = await db.users.count_documents(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]}
    )
    
    if user_count == 0:
        return {"message": "No linked users found", "count": 0}
        
    async def push_sequence(jobs_to_push):
        """Sequential push to respect rate limits"""
        logger.info(f"Starting force push of {len(jobs_to_push)} jobs to {user_count} users")
        for job in jobs_to_push:
            msg = (
                f"📢 <b>Job Alert!</b>\n\n"
                f"<b>{job['role']}</b> at <b>{job['company_name']}</b>\n"
                f"Location: {job['location']}\n"
                f"Deadline: {job['deadline'][:10]}\n"
                f"Apply: {job['apply_link']}"
            )
            # This function now has internal throttling (0.05s per user)
            # We await it to ensure we don't start the next job loop until this one is done/throttled
            await notify_all_users_new_job(msg, job["id"], job_title=f"{job['role']} at {job['company_name']}")
            
            # Extra pause between jobs to be safe
            await asyncio.sleep(1.0) 
        logger.info("Force push sequence completed")

    # Start the sequence in background
    asyncio.create_task(push_sequence(jobs))
        
    return {"message": f"Queued {len(jobs)} jobs to be sent to all users sequentially.", "jobs_count": len(jobs), "users_count": user_count}


# ---- App Startup ----
@app.on_event("startup")
async def startup_event():
    scheduler = AsyncIOScheduler()
    # Check for expired jobs every hour
    scheduler.add_job(cleanup_expired_jobs, 'interval', hours=1)
    
    # Check for reminders every 15 minutes
    scheduler.add_job(check_reminders, 'interval', minutes=15)
    
    scheduler.start()
    logger.info("Scheduler started for cleanup and reminders")
    
    # Run cleanup immediately on startup to ensure clean state
    # Use create_task to not block startup if it takes time
    asyncio.create_task(cleanup_expired_jobs())


# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
