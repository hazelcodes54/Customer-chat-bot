# --------------------------
# Analytics logging
# --------------------------
import collections
import sqlite3
import os
import re
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
from transformers import pipeline
from collections import defaultdict

analytics = {
    "conversation_count": 0,
    "faq_hits": collections.Counter()
}
import sqlite3
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import sqlite3, os, re
from dotenv import load_dotenv
from transformers import pipeline
from collections import defaultdict

app = FastAPI()
user_context = defaultdict(dict)  # user/session -> context

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
    allow_origins=["http://localhost:3000"],  # Only allow frontend origin for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------
# Database setup
# --------------------------
def setup_database():
    con = sqlite3.connect("faq.db")
    cur = con.cursor()
    
    # Create orders table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        status TEXT,
        customer_name TEXT,
        items TEXT,
        total_price REAL,
        shipping_address TEXT,
        created_at TEXT
    )
    """)
    
    # Insert mock orders if empty
    existing = cur.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    if existing == 0:
        orders = [
            ("SH123", "Shipped and on the way!", "Alice Smith", "Widget A x2, Widget B x1", 59.99, "123 Main St, Springfield", "2025-08-28"),
            ("SH124", "Processing at warehouse.", "Bob Johnson", "Widget C x3", 39.99, "456 Oak Ave, Metropolis", "2025-08-29"),
            ("SH125", "Delivered yesterday.", "Carol Lee", "Widget D x1, Widget E x2", 89.99, "789 Pine Rd, Gotham", "2025-08-30"),
        ]
        cur.executemany("INSERT INTO orders (id, status, customer_name, items, total_price, shipping_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", orders)
    con.commit()
    con.close()

setup_database()  # Initialize database tables


# --------------------------
# FAQ search
# --------------------------
def get_answer(user_question: str):
    con = sqlite3.connect("faq.db")
    cur = con.cursor()

    # Case-insensitive direct match (exact question)
    row = cur.execute(
        "SELECT answer FROM faq WHERE LOWER(question) = ?",
        (user_question.lower(),)
    ).fetchone()
    if row:
        print("FAQ exact match found.")
        con.close()
        return row[0]

    # Keyword detection: match only if at least 2 keywords are found
    keywords = [w for w in user_question.lower().split() if len(w) > 3]
    matches = []
    for kw in keywords:
        row = cur.execute(
            "SELECT answer FROM faq WHERE LOWER(question) LIKE ?",
            ('%' + kw + '%',)
        ).fetchone()
        if row:
            matches.append(row[0])
    con.close()
    if len(matches) >= 2:
        print(f"FAQ keyword match found for keywords: {keywords}")
        return matches[0]
    print("No FAQ match found.")
    return None  # return None if not found


# --------------------------
# Order tracking
# --------------------------
def track_order(order_id: str):
    con = sqlite3.connect("faq.db")
    cur = con.cursor()
    row = cur.execute("SELECT id, status, customer_name, items, total_price, shipping_address, created_at FROM orders WHERE id = ?", (order_id,)).fetchone()
    con.close()
    if row:
        # Return full order details as a dict
        return {
            "id": row[0],
            "status": row[1],
            "customer_name": row[2],
            "items": row[3],
            "total_price": row[4],
            "shipping_address": row[5],
            "created_at": row[6]
        }
    return None


# --------------------------
# AI fallback
# --------------------------
def ask_ai(prompt: str):
    # 1. Try OpenAI if key is available
    if client:
        try:
            print("Using OpenAI for response.")
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful customer support assistant."},
                    {"role": "user", "content": f"The user asked: {prompt}"}
                ]
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"⚠️ OpenAI error: {e}")

    # 2. Hugging Face fallback (DialoGPT-small)
    try:
        print("Using HuggingFace for response.")
        hf_prompt = f"You are a helpful assistant. The user asked: {prompt}"
        response = qa_model(hf_prompt, max_length=40, num_return_sequences=1)
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
def ask(question: str, user_id: str = "default"):
    # First check FAQ database
    faq_answer = get_answer(question)
    if faq_answer:
        print("FAQ answer found, returning...")
        return {"question": question, "answer": faq_answer}
    
    # Show welcome message if conversation just started
    if question.strip().lower() in ["", "start", "begin", "welcome"]:
        response = {
            "question": question,
            "answer": "👋 Welcome! I'm your customer support assistant. How can I help you today?"
        }
        return response
    import re
    q = re.sub(r'[^a-zA-Z0-9 ]', '', question.strip().lower())
    # Use in-memory context
    global user_context

    # 0. Handoff trigger: if user asks for a human, trigger handoff
    handoff_phrases = [
        "speak to a human", "talk to a human", "real person", "human agent", "customer service rep", "connect me to a human", "need a human"
    ]
    for phrase in handoff_phrases:
        if phrase in q:
            print(f"Handoff triggered for phrase: {phrase}")
            response = {
                "question": question,
                "answer": "I'm unable to assist further. Please provide your email and issue so we can connect you to a human agent.",
                "handoff": True
            }
            return response
    # 1. Custom professional responses (partial match)
    custom_responses = {
        "hello": "Hi there! How can I help you today?",
        "hello!": "Hi there! How can I help you today?",
        "hey!": "Hi there! How can I help you today?",
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

    # --- Order tracking ---
    # First check for general order inquiries
    order_keywords = ["order", "package", "delivery", "shipped", "shipping"]
    if any(keyword in question.lower() for keyword in order_keywords):
        if not re.search(r"(SH\d+)", question.upper()):
            return {
                "question": question,
                "answer": "To track your order, please provide your order number (it starts with 'SH'). For example: SH123"
            }
    
    # Check for specific order number
    order_match = re.search(r"(SH\d+)", question.upper())
    if order_match:
        try:
            order_id = order_match.group(1)
            user_context[user_id]['last_order'] = order_id
            order_details = track_order(order_id)
            if order_details:
                print(f"Order tracking found for {order_id}")
                order_response = f"Here are the details for order {order_id}:\n"
                order_response += f"Status: {order_details['status']}\n"
                order_response += f"Items: {order_details['items']}\n"
                order_response += f"Total: ${order_details['total_price']:.2f}\n"
                order_response += f"Shipping to: {order_details['shipping_address']}"
                return {"question": question, "answer": order_response, "order": order_details}
            else:
                answer = f"Sorry, I couldn't find any information for order {order_id}. Please check if the order number is correct."
                return {"question": question, "answer": answer}
        except Exception as e:
            print(f"Error tracking order: {e}")
            return {"question": question, "answer": "Sorry, there was an error retrieving your order information. Please try again."}

    # --- Ticket tracking ---
    ticket_match = re.search(r"(TICKET\d+)", question.upper())
    if ticket_match:
        ticket_id = ticket_match.group(1)
        user_context[user_id]['last_ticket'] = ticket_id
        # Here you would call a function to get ticket info
        ticket_info = f"Ticket {ticket_id}: Your ticket is being processed."  # Placeholder
        print(f"Ticket tracking found for {ticket_id}.")
        return {"question": question, "answer": ticket_info}

    # --- Product tracking ---
    product_match = re.search(r"(PROD\d+)", question.upper())
    if product_match:
        product_id = product_match.group(1)
        user_context[user_id]['last_product'] = product_id
        # Here you would call a function to get product info
        product_info = f"Product {product_id}: This product is in stock."  # Placeholder
        print(f"Product tracking found for {product_id}.")
        return {"question": question, "answer": product_info}

    # --- Contextual pronoun resolution ---
    if "it" in question.lower():
        found = False
        if 'last_order' in user_context[user_id]:
            order_id = user_context[user_id]['last_order']
            order_status = track_order(order_id)
            if order_status:
                print(f"Contextual memory used for pronoun 'it', refers to {order_id}.")
                answer = f"{order_status} (referring to your last order {order_id})"
                return {"question": question, "answer": answer}
            found = True
        if 'last_ticket' in user_context[user_id]:
            ticket_id = user_context[user_id]['last_ticket']
            ticket_info = f"Ticket {ticket_id}: Your ticket is being processed."  # Placeholder
            print(f"Contextual memory used for pronoun 'it', refers to {ticket_id}.")
            answer = f"{ticket_info} (referring to your last ticket {ticket_id})"
            return {"question": question, "answer": answer}
            found = True
        if 'last_product' in user_context[user_id]:
            product_id = user_context[user_id]['last_product']
            product_info = f"Product {product_id}: This product is in stock."  # Placeholder
            print(f"Contextual memory used for pronoun 'it', refers to {product_id}.")
            answer = f"{product_info} (referring to your last product {product_id})"
            return {"question": question, "answer": answer}
            found = True
        if not found:
            print("Contextual pronoun 'it' used, but no entity found in memory.")
            answer = "Sorry, I couldn't find what 'it' refers to in our recent conversation."
            return {"question": question, "answer": answer}
    # Ensure every response has 'question' and 'answer'
    # If no answer found, fallback to AI or default message
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
        response = {"question": question, "answer": "Sorry, the bot is taking too long to reply. Please try again."}
        return response
    print(f"AI response: {result['value']}")
    answer = result["value"] or "Sorry, I don't have an answer for that."
    return {"question": question, "answer": answer}
