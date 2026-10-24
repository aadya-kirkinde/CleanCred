"""CleanCred multimodal waste recognition via an OpenAI-compatible API."""

import base64
import json
import mimetypes
import os
from pathlib import Path

ALLOWED = {"WET", "DRY", "HAZARDOUS"}
PROMPT = """
You are CleanCred's fast waste-object recognition assistant.
Inspect ONLY the supplied image. Identify the visible objects and classify the waste immediately.
Return JSON and no other text using exactly this shape:
{"objects":[{"name":"plastic bottle","confidence":0.96,"material":"PET plastic"}],"category":"WET|DRY|HAZARDOUS|UNKNOWN","accepted":true|false,"confidence":0.0,"explanation":"short evidence-based reason"}
Rules:
- List at most 8 clearly visible objects. Include recognizable non-waste objects and containers (for example, a recycling bin) even when accepted=false.
- If any object is clearly recognizable, the objects array must not be empty. Use ordinary, specific names and never invent hidden objects.
- WET=mostly organic/biodegradable; DRY=paper/cardboard/plastic/metal/glass and other dry recyclable waste.
- HAZARDOUS=batteries, chemicals, medical/sharp hazardous household waste.
- UNKNOWN if the image is unclear, empty, unrelated, or contains inseparable mixed categories.
- Never infer from the user's selected category. accepted=true only when visual evidence is sufficient.
"""

def _extract_json(text: str) -> dict:
    text = (text or "").strip().replace("```json", "").replace("```", "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("Model did not return JSON")
    return json.loads(text[start:end + 1])

def _image_data_url(image_path: str) -> str:
    path = Path(image_path)
    mime_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"

def verify_image(image_path: str) -> dict:
    """Inspect waste evidence using APIClaw or the labeled offline demo mode."""
    api_key = os.getenv("APICLAW_API_KEY", "").strip()
    if not api_key:
        if os.getenv("DEMO_AI_MODE", "0") == "1":
            return {
                "objects": [{"name": "demo waste item", "confidence": 0.91, "material": "simulated"}],
                "category": "DRY",
                "accepted": True,
                "confidence": 0.91,
                "explanation": "Demo result only. Add APICLAW_API_KEY for real object recognition.",
                "model": "demo-simulator",
                "simulated": True,
            }
        raise RuntimeError("APICLAW_API_KEY is not configured")

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Live AI dependencies are missing. Install backend/requirements-ai.txt or set DEMO_AI_MODE=1.") from exc

    model = os.getenv("APICLAW_MODEL", "apiclaw/claude-opus-5.5")
    client = OpenAI(
        api_key=api_key,
        base_url=os.getenv("APICLAW_BASE_URL", "https://apiclaw.biz"),
        timeout=25.0,
        max_retries=0,
    )
    response = client.responses.create(
        model=model,
        max_output_tokens=300,
        input=[{"role":"user","content":[
            {"type":"input_text","text":PROMPT},
            {"type":"input_image","image_url":_image_data_url(image_path),"detail":"low"}
        ]}]
    )
    result = _extract_json(response.output_text)
    category = str(result.get("category", "UNKNOWN")).upper()
    accepted = bool(result.get("accepted", False))
    confidence = max(0.0, min(1.0, float(result.get("confidence", 0))))
    if category not in ALLOWED:
        category, accepted = "UNKNOWN", False
    if confidence < 0.60:
        accepted = False

    objects = []
    raw_objects = result.get("objects", [])
    if isinstance(raw_objects, list):
        for item in raw_objects[:8]:
            if isinstance(item, str):
                objects.append({"name": item[:100], "confidence": confidence, "material": "unknown"})
                continue
            if not isinstance(item, dict) or not str(item.get("name", "")).strip():
                continue
            try:
                object_confidence = max(0.0, min(1.0, float(item.get("confidence", confidence))))
            except (TypeError, ValueError):
                object_confidence = confidence
            objects.append({
                "name": str(item["name"]).strip()[:100],
                "confidence": object_confidence,
                "material": str(item.get("material", "unknown")).strip()[:100],
            })

    return {
        "objects": objects,
        "category": category,
        "accepted": accepted,
        "confidence": confidence,
        "explanation": str(result.get("explanation", "No explanation returned."))[:500],
        "model": model,
        "simulated": False,
    }
