from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3

app = FastAPI()

# ✅ CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production: replace "*" with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Function to get an answer from the database
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
    return "Sorry, I don’t know that yet."

@app.get("/")
def home():
    return {"message": "Hello, chatbot backend is running!"}

# Chatbot route
@app.get("/ask")
def ask(question: str):
    answer = get_answer(question)
    return {"question": question, "answer": answer}
