import sqlite3

con = sqlite3.connect("faq.db")
cur = con.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS faq (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT,
    answer TEXT
)
""")

faqs = [
    ("What is your return policy?", "You can return items within 30 days."),
    ("How do I track my order?", "Go to your account > Orders > Track."),
    ("Do you ship internationally?", "Yes, we ship to most countries worldwide."),
]

cur.executemany("INSERT INTO faq (question, answer) VALUES (?, ?)", faqs)

con.commit()
con.close()
print("Database setup complete ✅")
