# --------------------------
# Analytics logging
# --------------------------
import collections
analytics = {
    "conversation_count": 0,
    "faq_hits": collections.Counter()
}

# ...existing code...
from fastapi import FastAPI, Request
import sqlite3
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import sqlite3, os, re
from dotenv import load_dotenv
from transformers import pipeline

app = FastAPI()

# --------------------------
# Support ticket endpoint
# --------------------------
@app.post("/support_ticket")
async def support_ticket(request: Request):
    data = await request.json()
    email = data.get("email")
    issue = data.get("issue")
    con = sqlite3.connect("faq.db")
    cur = con.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS support_tickets (id INTEGER PRIMARY KEY, email TEXT, issue TEXT)")
    cur.execute("INSERT INTO support_tickets (email, issue) VALUES (?, ?)", (email, issue))
    con.commit()
    con.close()
    return {"status": "success"}

# Load environment variables (from .env file)
load_dotenv()

# Connect to OpenAI (if key available)
client = None
if os.getenv("OPENAI_API_KEY"):
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Hugging Face fallback model (DialoGPT-small for chat)
qa_model = pipeline("text-generation", model="microsoft/DialoGPT-small")


# Keep one chat history for fallback model
# chat_history = Conversation()

# ✅ CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production: replace "*" with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------
# Setup orders table (run once)
# --------------------------
def setup_orders():
    con = sqlite3.connect("faq.db")
    cur = con.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        status TEXT
    )
    """)
    # Insert some mock orders if empty
    existing = cur.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    if existing == 0:
        orders = [
            ("SH123", "Shipped and on the way!"),
            ("SH124", "Processing at warehouse."),
            ("SH125", "Delivered yesterday."),
        ]
        cur.executemany("INSERT INTO orders (id, status) VALUES (?, ?)", orders)
    con.commit()
    con.close()

setup_orders()


# --------------------------
# FAQ search
# --------------------------
def get_answer(user_question: str):
    con = sqlite3.connect("faq.db")
    cur = con.cursor()

    # Case-insensitive direct match
    row = cur.execute(
        "SELECT answer FROM faq WHERE LOWER(question) LIKE ?",
        ('%' + user_question.lower() + '%',)
    ).fetchone()
    if row:
        con.close()
        return row[0]

    # Keyword detection: try to match any keyword in the question
    keywords = [w for w in user_question.lower().split() if len(w) > 3]
    for kw in keywords:
        row = cur.execute(
            "SELECT answer FROM faq WHERE LOWER(question) LIKE ?",
            ('%' + kw + '%',)
        ).fetchone()
        if row:
            con.close()
            return row[0]

    con.close()
    return None  # return None if not found


# --------------------------
# Order tracking
# --------------------------
def track_order(order_id: str):
    con = sqlite3.connect("faq.db")
    cur = con.cursor()
    row = cur.execute("SELECT status FROM orders WHERE id = ?", (order_id,)).fetchone()
    con.close()
    if row:
        return f"Order {order_id}: {row[0]}"
    return None


# --------------------------
# AI fallback
# --------------------------
def ask_ai(prompt: str):
    # 1. Try OpenAI if key is available
    if client:
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful customer support assistant."},
                    {"role": "user", "content": prompt}
                ]
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"⚠️ OpenAI error: {e}")

    # 2. Hugging Face fallback (DialoGPT-small)
    try:
        response = qa_model(prompt, max_length=40, num_return_sequences=1)
        if isinstance(response, list) and 'generated_text' in response[0]:
            return response[0]['generated_text']
        return str(response)
    except Exception as e:
        return f"⚠️ HuggingFace error: {e}"


@app.get("/")
def home():
    # Show analytics summary on home endpoint
    top_faqs = analytics["faq_hits"].most_common(5)
    return {
        "message": "Hello, chatbot backend is running!",
        "conversation_count": analytics["conversation_count"],
        "top_faqs": top_faqs
    }


# --------------------------
# Chatbot route
# --------------------------

@app.get("/ask")
def ask(question: str):
    # Track new conversation (if user says hello or similar)
    if any(greet in question.lower() for greet in ["hello", "hi", "hey"]):
        analytics["conversation_count"] += 1
    import time
    print(f"Received question: {question}")
    import re
    q = re.sub(r'[^a-zA-Z0-9 ]', '', question.strip().lower())


    # 0. Handoff trigger: if user asks for a human, trigger handoff
    handoff_phrases = [
        "speak to a human", "talk to a human", "real person", "human agent", "customer service rep", "connect me to a human", "need a human"
    ]
    for phrase in handoff_phrases:
        if phrase in q:
            print(f"Handoff triggered for phrase: {phrase}")
            return {"question": question, "answer": "I'm unable to assist further. Please provide your email and issue so we can connect you to a human agent."}

    # 1. Custom professional responses (partial match)
    custom_responses = {
        "hello": "Hi there! How can I help you today?",
        "can you help": "Absolutely! Please tell me more about your issue.",
        "i need more help": "I'm here to assist you. Could you please describe your problem in detail?",
        "thank you": "You're welcome! If you have any more questions, feel free to ask.",
        "thanks": "You're welcome!",
        "help": "Sure, I'm here to help. What do you need assistance with?",
        "who are you": "I'm your customer support assistant, here to help you with any questions or issues.",
        "i need some help": "I'm happy to help! Please provide more details about your issue.",
        "how are you": "I'm just a bot, but I'm here to help you! How can I assist you today?",
        "what can you do": "I can answer questions about your orders, our policies, and provide support. How can I help?",
    }
    for key, resp in custom_responses.items():
        if key in q:
            print(f"Custom response sent for key: {key}")
            return {"question": question, "answer": resp}

    # 1. Try FAQ
    answer = get_answer(question)
    if answer:
        print("FAQ match found.")
        analytics["faq_hits"][question.strip().lower()] += 1
        return {"question": question, "answer": answer}

    # 2. Try order tracking (look for SHxxx pattern)
    order_match = re.search(r"(SH\d+)", question.upper())
    if order_match:
        order_id = order_match.group(1)
        order_status = track_order(order_id)
        if order_status:
            print(f"Order tracking found for {order_id}.")
            return {"question": question, "answer": order_status}

    # 3. Fallback to AI (OpenAI if available, otherwise HuggingFace) with timeout
    import threading
    result = {"value": None}
    def ai_call():
        try:
            print("Calling AI fallback...")
            result["value"] = ask_ai(question)
        except Exception as e:
            print(f"AI call error: {e}")
            result["value"] = "Sorry, there was an error with the AI response."
    t = threading.Thread(target=ai_call)
    t.start()
    t.join(timeout=8)  # 8 seconds timeout
    if t.is_alive():
        print("AI call timed out.")
        return {"question": question, "answer": "Sorry, the bot is taking too long to reply. Please try again."}
    print(f"AI response: {result['value']}")
    return {"question": question, "answer": result["value"]}
