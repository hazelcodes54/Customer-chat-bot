from fastapi import FastAPI
import sqlite3

app = FastAPI()

# Function to get an answer from the database
def get_answer(user_question: str):
    con = sqlite3.connect("faq.db")
    cur = con.cursor()
    row = cur.execute(
        "SELECT answer FROM faq WHERE question LIKE ?",
        ('%' + user_question + '%',)
    ).fetchone()
    con.close()
    if row:
        return row[0]
    return "Sorry, I don’t know that yet."

@app.get("/")
def home():
    return {"message": "Hello, chatbot backend is running!"}

# Chatbot route
@app.get("/ask")
def ask(question: str):
    answer = get_answer(question)
    return {"question": question, "answer": answer}
