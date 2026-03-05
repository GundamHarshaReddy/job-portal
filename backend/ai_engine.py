import os
import httpx
import json
import logging

logger = logging.getLogger(__name__)

async def call_groq(prompt: str, system_prompt: str) -> str:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set")
    headers = {"Authorization": f"Bearer {api_key}"}
    data = {
        "model": "llama3-8b-8192",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3, # Keep it deterministic for JSON extraction
        "max_tokens": 1024,
        "response_format": {"type": "json_object"}
    }
    async with httpx.AsyncClient(timeout=15.0) as client_http:
        resp = await client_http.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=data)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

async def call_mistral(prompt: str, system_prompt: str) -> str:
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise ValueError("MISTRAL_API_KEY not set")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "mistral-small-latest",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }
    async with httpx.AsyncClient(timeout=15.0) as client_http:
        resp = await client_http.post("https://api.mistral.ai/v1/chat/completions", headers=headers, json=data)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

async def process_ai_request(block_type: str, raw_text: str, target_role: str = None) -> dict:
    """Routes the text to the appropriate AI and returns the polished JSON object."""
    SYSTEM_PROMPTS = {
        "personal": "You extract personal generic details. Return JSON with exactly these keys: name, email, phone, location, linkedin, github.",
        "summary": "You are an expert ATS resume writer. Convert the user input into a highly professional, engaging 3-sentence summary highlighting key strengths. Return JSON: {\"summary\": \"...\"}",
        "experience": "You are an ATS expert formatting work experience. Extract job title, company name, start/end dates, and rewrite achievements into 3 professional, metric-driven achievements using strong action verbs. Return JSON exactly: {\"title\": \"...\", \"company\": \"...\", \"dates\": \"...\", \"bullets\": [\"...\", \"...\"]}",
        "education": "Extract education details perfectly. Return JSON exactly: {\"degree\": \"...\", \"school\": \"...\", \"year\": \"...\"}",
        "skills": "Extract skills as an array of strings. Return JSON exactly: {\"skills\": [\"...\", \"...\"]}"
    }
    
    sys_prompt = SYSTEM_PROMPTS.get(block_type, "You are a helpful assistant mapping data to strict JSON.")
    if target_role:
        sys_prompt += f"\n\nCRITICAL CONTEXT: The user is specifically targeting a {target_role} role. You MUST deeply optimize all keywords, action verbs, industry jargon, and phrasing specifically for top-tier {target_role} ATS systems. Make them sound like an expert {target_role}."
    
    # Try Groq Free API first (High Speed, Strict Rate Limit)
    try:
        result_text = await call_groq(raw_text, sys_prompt)
        return {"source": "groq", "data": json.loads(result_text)}
    except Exception as e:
        logger.warning(f"Groq failed ({type(e).__name__}: {e}), cascading to Mistral...")
        
        # Fallback to Mistral Free API
        try:
            result_text = await call_mistral(raw_text, sys_prompt)
            return {"source": "mistral", "data": json.loads(result_text)}
        except Exception as mistral_err:
            logger.error(f"Mistral fallback failed: {mistral_err}")
            raise RuntimeError("AI processing failed on all free-tier fallbacks.")
