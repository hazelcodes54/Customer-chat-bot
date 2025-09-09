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
from langdetect import detect
from deep_translator import GoogleTranslator

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
def ask_ai(prompt: str, original_lang: str = 'en'):
    # 1. Try OpenAI if key is available
    if client:
        try:
            print("Using OpenAI for response.")
            # Always ask in English for consistent responses
            eng_prompt = prompt if original_lang == 'en' else translate_text(prompt, 'en')
            
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful customer support assistant."},
                    {"role": "user", "content": eng_prompt}
                ]
            )
            response_text = response.choices[0].message.content
            
            # Translate response back to original language if needed
            if original_lang != 'en':
                print(f"Translating response to {original_lang}")
                response_text = translate_text(response_text, original_lang)
            return response_text
        except Exception as e:
            print(f"⚠️ OpenAI error: {e}")

    # 2. Hugging Face fallback (DialoGPT-small)
    try:
        print("Using HuggingFace for response.")
        # Use English for the model
        eng_prompt = prompt if original_lang == 'en' else translate_text(prompt, 'en')
        response = qa_model(eng_prompt, max_length=100, num_return_sequences=1)
        
        if isinstance(response, list) and 'generated_text' in response[0]:
            # Use a default customer service response instead of DialoGPT's creative responses
            response_text = "Hello! I'm your customer support assistant. How may I help you today?"
            
            # Translate response back to original language if needed
            if original_lang != 'en':
                print(f"Translating response to {original_lang}")
                response_text = translate_text(response_text, original_lang)
            return response_text
            
        default_response = "Hi! How can I help you today?"
        return translate_text(default_response, original_lang) if original_lang != 'en' else default_response
    except Exception as e:
        error_msg = f"⚠️ HuggingFace error: {e}"
        return translate_text(error_msg, original_lang) if original_lang != 'en' else error_msg


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

# Define supported languages and their greetings
SUPPORTED_LANGUAGES = {
    'en': 'Hello! How may I assist you today?',
    'fr': 'Bonjour! Comment puis-je vous aider aujourd\'hui?',
    'es': '¡Hola! ¿Cómo puedo ayudarte hoy?',
    'de': 'Hallo! Wie kann ich Ihnen heute helfen?',
    'it': 'Ciao! Come posso aiutarti oggi?',
    'pt': 'Olá! Como posso ajudá-lo hoje?',
    'nl': 'Hallo! Hoe kan ik u vandaag helpen?',
    'ru': 'Здравствуйте! Как я могу вам помочь сегодня?',
    'zh': '你好！今天我能为您做些什么？',
    'ja': 'こんにちは！今日はどのようにお手伝いできますか？',
    'ko': '안녕하세요! 오늘 어떻게 도와드릴까요?',
    'ar': 'مرحباً! كيف يمكنني مساعدتك اليوم؟',
    'hi': 'नमस्ते! आज मैं आपकी कैसे सहायता कर सकता हूं?'
}

def translate_text(text: str, target_lang: str = 'en') -> str:
    """Translate text to target language."""
    if not text or target_lang == 'en':
        return text
        
    # If it's a greeting and we have a pre-defined translation, use that
    if text.lower() in [v.lower() for v in SUPPORTED_LANGUAGES.values()]:
        return SUPPORTED_LANGUAGES.get(target_lang, SUPPORTED_LANGUAGES['en'])
        
    try:
        translator = GoogleTranslator(source='auto', target=target_lang)
        translated = translator.translate(text)
        print(f"Translated '{text}' to {target_lang}: '{translated}'")
        return translated
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def detect_language(text: str) -> str:
    """Detect the language of the input text."""
    try:
        detected = detect(text)
        # If detected language is supported, use it; otherwise fall back to English
        return detected if detected in SUPPORTED_LANGUAGES else 'en'
    except:
        return 'en'

@app.get("/ask")
def ask(question: str, user_id: str = "default", target_lang: str = None):
    # Detect the input language
    detected_lang = detect_language(question)
    original_question = question
    
    # Translate question to English if it's not in English
    if detected_lang != 'en':
        question = translate_text(question, 'en')
    
    # First check FAQ database
    faq_answer = get_answer(question)
    if faq_answer:
        print("FAQ answer found, returning...")
        # Translate answer back to original language if needed
        if target_lang and target_lang != 'en':
            faq_answer = translate_text(faq_answer, target_lang)
        elif detected_lang != 'en':
            faq_answer = translate_text(faq_answer, detected_lang)
        return {
            "question": original_question,
            "answer": faq_answer,
            "detected_language": detected_lang
        }
    
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
        # Greetings in different languages
        "hello": SUPPORTED_LANGUAGES['en'],
        "hi": SUPPORTED_LANGUAGES['en'],
        "hey": SUPPORTED_LANGUAGES['en'],
        "bonjour": SUPPORTED_LANGUAGES['fr'],
        "salut": SUPPORTED_LANGUAGES['fr'],
        "hola": SUPPORTED_LANGUAGES['es'],
        "ciao": SUPPORTED_LANGUAGES['it'],
        "hallo": SUPPORTED_LANGUAGES['de'],
        "guten tag": SUPPORTED_LANGUAGES['de'],
        "olá": SUPPORTED_LANGUAGES['pt'],
        "здравствуйте": SUPPORTED_LANGUAGES['ru'],
        "привет": SUPPORTED_LANGUAGES['ru'],
        "你好": SUPPORTED_LANGUAGES['zh'],
        "こんにちは": SUPPORTED_LANGUAGES['ja'],
        "안녕하세요": SUPPORTED_LANGUAGES['ko'],
        "مرحبا": SUPPORTED_LANGUAGES['ar'],
        "नमस्ते": SUPPORTED_LANGUAGES['hi'],
        
        # Help requests
        "can you help": "Absolutely! Please tell me more about your issue.",
        "i need more help": "I'm here to assist you. Could you please describe your problem in detail?",
        "help": "Sure, I'm here to help. What do you need assistance with?",
        "i need help": "I'm here to help! What can I assist you with?",
        "aide": "I'm here to help! What can I assist you with?",
        "ayuda": "I'm here to help! What can I assist you with?",
        
        # Thanks
        "thank": "You're welcome! If you have any more questions, feel free to ask.",
        "thanks": "You're welcome! Let me know if you need anything else.",
        "merci": "You're welcome! Let me know if you need anything else.",
        "gracias": "You're welcome! Let me know if you need anything else.",
        "danke": "You're welcome! Let me know if you need anything else.",
        
        # Bot identity
        "who are you": "I'm your customer support assistant, here to help you with any questions or issues.",
        "what are you": "I'm your customer support assistant, ready to help with orders, products, and support.",
        
        # Capabilities
        "what can you do": "I can help you with:\n- Tracking orders\n- Product information\n- General support\n- Technical assistance\nWhat would you like help with?",
    }
    
    # Get the appropriate response and translate if needed
    for key, response in custom_responses.items():
        if key.lower() in q.lower():
            print(f"Custom response matched for key: {key}")
            if detected_lang != 'en':
                translated_response = translate_text(response, detected_lang)
                print(f"Translating response to {detected_lang}: {translated_response}")
                return {"question": original_question, "answer": translated_response, "detected_language": detected_lang}
            return {"question": original_question, "answer": response, "detected_language": "en"}

    # --- Order tracking ---
    # Keywords in different languages
    order_keywords = {
        'en': ["order", "package", "delivery", "shipped", "shipping", "track", "where"],
        'fr': ["commande", "colis", "livraison", "expédié", "expédition", "suivi", "où"],
        'es': ["pedido", "paquete", "entrega", "enviado", "envío", "seguimiento", "dónde"],
        'de': ["bestellung", "paket", "lieferung", "versand", "sendung", "tracking", "wo"],
        'it': ["ordine", "pacco", "consegna", "spedito", "spedizione", "tracciamento", "dove"],
        'pt': ["pedido", "pacote", "entrega", "enviado", "envio", "rastreamento", "onde"],
        'nl': ["bestelling", "pakket", "levering", "verzonden", "verzending", "tracking", "waar"],
        'ru': ["заказ", "посылка", "доставка", "отправлено", "отправка", "отслеживание", "где"],
        'zh': ["订单", "包裹", "发货", "运送", "快递", "跟踪", "在哪里"],
        'ja': ["注文", "荷物", "配送", "発送", "配達", "追跡", "どこ"],
        'ko': ["주문", "소포", "배송", "발송", "배달", "추적", "어디"],
        'ar': ["طلب", "حزمة", "توصيل", "شحن", "تتبع", "أين"],
        'hi': ["ऑर्डर", "पैकेज", "डिलीवरी", "भेजा", "शिपिंग", "ट्रैक", "कहाँ"]
    }
    
    # Check for order-related keywords in detected language
    lang_keywords = order_keywords.get(detected_lang, order_keywords['en'])
    eng_question = question.lower() if detected_lang == 'en' else translate_text(question.lower(), 'en')
    
    if any(keyword in question.lower() for keyword in lang_keywords):
        if not re.search(r"(SH\d+)", question.upper()):
            response = "To track your order, please provide your order number (it starts with 'SH'). For example: SH123"
            if detected_lang != 'en':
                response = translate_text(response, detected_lang)
            return {
                "question": original_question,
                "answer": response,
                "detected_language": detected_lang
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
                if detected_lang == 'en':
                    order_response = f"Here are the details for order {order_id}:\n"
                    order_response += f"Status: {order_details['status']}\n"
                    order_response += f"Items: {order_details['items']}\n"
                    order_response += f"Total: ${order_details['total_price']:.2f}\n"
                    order_response += f"Shipping to: {order_details['shipping_address']}"
                else:
                    # Translate status and compose response in detected language
                    translated_status = translate_text(order_details['status'], detected_lang)
                    translated_items = translate_text(order_details['items'], detected_lang)
                    translated_address = translate_text(order_details['shipping_address'], detected_lang)
                    
                    order_response = translate_text(f"Here are the details for order {order_id}:", detected_lang) + "\n"
                    order_response += translate_text("Status", detected_lang) + f": {translated_status}\n"
                    order_response += translate_text("Items", detected_lang) + f": {translated_items}\n"
                    order_response += translate_text("Total", detected_lang) + f": ${order_details['total_price']:.2f}\n"
                    order_response += translate_text("Shipping to", detected_lang) + f": {translated_address}"
                
                return {
                    "question": original_question,
                    "answer": order_response,
                    "order": order_details,
                    "detected_language": detected_lang
                }
            else:
                answer = f"Sorry, I couldn't find any information for order {order_id}. Please check if the order number is correct."
                if detected_lang != 'en':
                    answer = translate_text(answer, detected_lang)
                return {
                    "question": original_question,
                    "answer": answer,
                    "detected_language": detected_lang
                }
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
            result["value"] = ask_ai(question, detected_lang)
        except Exception as e:
            print(f"AI call error: {e}")
            error_msg = "Sorry, there was an error with the AI response."
            result["value"] = translate_text(error_msg, detected_lang) if detected_lang != 'en' else error_msg
    t = threading.Thread(target=ai_call)
    t.start()
    t.join(timeout=8)  # 8 seconds timeout
    if t.is_alive():
        print("AI call timed out.")
        response = {
            "question": original_question,
            "answer": "Sorry, the bot is taking too long to reply. Please try again.",
            "detected_language": detected_lang
        }
        return response
    print(f"AI response: {result['value']}")
    answer = result["value"] or "Sorry, I don't have an answer for that."
    
    # Translate answer back to original language if needed
    if target_lang and target_lang != 'en':
        answer = translate_text(answer, target_lang)
    elif detected_lang != 'en':
        answer = translate_text(answer, detected_lang)
    
    return {
        "question": original_question,
        "answer": answer,
        "detected_language": detected_lang
    }
