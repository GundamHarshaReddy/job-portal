import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('backend/.env')

async def test():
    try:
        print(f"Connecting to {os.environ['MONGO_URL']}")
        client = AsyncIOMotorClient(os.environ['MONGO_URL'])
        await client.server_info()
        print("Connected successfully!")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test())
