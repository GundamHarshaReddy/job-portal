import requests
import json
import os

# Configuration
BASE_URL = "http://localhost:8000/api"
API_KEY = "default_secret_key"  # Matching the default in server.py

def test_bulk_create():
    print("Testing Bulk Create...")
    url = f"{BASE_URL}/rcjo-jobs/bulk"
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    }
    payload = [
        {
            "company_name": "Test Company A",
            "role": "Software Engineer",
            "location": "Remote",
            "apply_link": "https://example.com/apply/a",
            "job_type": "Full-time",
            "source": "n8n_test"
        },
        {
            "company_name": "Test Company B",
            "role": "Product Manager",
            "location": "New York",
            "apply_link": "https://example.com/apply/b",
            "deadline": "2024-12-31T23:59:59"
        }
    ]
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        if response.status_code == 200:
            print(f"Success! Response: {response.json()}")
        else:
            print(f"Failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error: {e}")

def test_list_jobs():
    print("\nTesting List Jobs...")
    # admin login to get token
    login_url = f"{BASE_URL}/auth/login"
    # Assuming admin credentials from server.py (default)
    # If changed, this might fail, but let's try default
    admin_creds = {
        "email": "admin@friendboard.com",
        "password": "admin123"
    }
    
    try:
        # 1. Login
        session = requests.Session()
        resp = session.post(login_url, json=admin_creds)
        if resp.status_code != 200:
            print(f"Login failed: {resp.text}")
            return
            
        token = resp.json()["token"]
        
        # 2. Get Jobs
        url = f"{BASE_URL}/rcjo-jobs"
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            jobs = response.json()
            print(f"Success! Found {len(jobs)} jobs.")
            for job in jobs[:2]:
                print(f"- {job['role']} at {job['company_name']}")
        else:
            print(f"Failed: {response.status_code} - {response.text}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_bulk_create()
    test_list_jobs()
