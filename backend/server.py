from fastapi import FastAPI, APIRouter, HTTPException, Request
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

class BroadcastMessage(BaseModel):
    message: str

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
async def send_telegram_message(chat_id: str, text: str, reply_markup: Optional[dict] = None):
    """Send a Telegram message, optionally with inline keyboard buttons."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("No Telegram bot token configured")
        return
    try:
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                f"{TELEGRAM_API}/sendMessage",
                json=payload
            )
            if resp.status_code != 200:
                logger.error(f"Telegram send failed: {resp.text}")
    except Exception as e:
        logger.error(f"Telegram error: {e}")

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

async def notify_all_users_new_job(text: str, job_id: str):
    """Send a new job notification with inline buttons to all linked users."""
    users = await db.users.find(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]},
        {"_id": 0, "telegram_chat_id": 1}
    ).to_list(1000)
    buttons = build_job_buttons(job_id)
    for user in users:
        chat_id = user.get("telegram_chat_id")
        if chat_id:
            await send_telegram_message(chat_id, text, reply_markup=buttons)

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
        except Exception as e:
            logger.error(f"Deadline check error for job {job.get('id', '?')}: {e}")

# ---- Startup ----
@app.on_event("startup")
async def startup():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.jobs.create_index("id", unique=True)
    await db.job_responses.create_index([("chat_id", 1), ("job_id", 1)], unique=True)
    await db.reminder_log.create_index([("chat_id", 1), ("job_id", 1), ("sent_at", 1)])
    
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
        f"Deadline: {data.deadline[:10]}\n"
        f"Posted by: {user['name']}\n"
        f"Apply: {data.apply_link}"
    )
    # Fire and forget — send with inline buttons
    asyncio.create_task(notify_all_users_new_job(msg, job_doc["id"]))
    
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
async def broadcast_message(data: BroadcastMessage, request: Request):
    await require_admin(request)
    
    if not data.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    users = await db.users.find(
        {"$and": [{"telegram_chat_id": {"$ne": None}}, {"telegram_chat_id": {"$ne": ""}}]},
        {"_id": 0, "telegram_chat_id": 1}
    ).to_list(1000)
    
    sent_count: int = 0
    failed_count: int = 0
    for user in users:
        chat_id = user.get("telegram_chat_id")
        if chat_id:
            try:
                await send_telegram_message(chat_id, data.message)
                sent_count += 1
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
                elif user.get("telegram_chat_id") and user["telegram_chat_id"] == chat_id:
                    # Same user re-linking from the same account
                    await send_telegram_message(chat_id, "\u2705 Your Telegram is already linked to FriendBoard!")
                elif user.get("telegram_chat_id") and user["telegram_chat_id"] != chat_id:
                    # Someone else trying to hijack this email's Telegram link
                    await send_telegram_message(chat_id, "\u26d4 This email is already linked to another Telegram account. If this is your email, please contact the admin to unlink it first.")
                    # Notify the original linked user about the attempt
                    await send_telegram_message(user["telegram_chat_id"], f"\u26a0\ufe0f <b>Security Alert:</b> Someone tried to re-link your FriendBoard account ({email}) from a different Telegram account. If this wasn't you, no action is needed — your link is safe.")
                else:
                    # First time linking — no existing chat_id
                    await db.users.update_one(
                        {"email": email},
                        {"$set": {"telegram_chat_id": chat_id}}
                    )
                    await send_telegram_message(chat_id, "\u2705 Your Telegram is now linked to FriendBoard! You'll receive job notifications here.")
            else:
                await send_telegram_message(
                    chat_id,
                    "\U0001f44b <b>Welcome to FriendBoard Bot!</b>\n\n"
                    "To link your account, use:\n"
                    "<code>/start your@email.com</code>\n\n"
                    "Once linked, you'll receive job notifications with these options:\n"
                    "\u2705 <b>Applied</b> — stop reminders for that job\n"
                    "\u274c <b>Not Interested</b> — stop reminders for that job\n"
                    "\U0001f514 <b>Remind Me Later</b> — get reminders until the deadline"
                )
    
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
                # Save response (upsert — one response per user per job)
                await db.job_responses.update_one(
                    {"chat_id": chat_id, "job_id": job_id},
                    {"$set": {
                        "response": action,
                        "responded_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
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

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
