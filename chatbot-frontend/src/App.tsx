import React, { useState, useRef, useEffect } from "react";


function App() {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(() => {
    const saved = localStorage.getItem("chatbot_messages");
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("chatbot_messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (lastMsgRef.current) {
      lastMsgRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: input }]);
    setLoading(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/ask?question=${encodeURIComponent(input)}`
      );
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "bot", text: data.answer }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "⚠️ Error: could not reach server." },
      ]);
    }
    setLoading(false);
    setInput("");
  };

  // Styles
  const bgGradient = {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const glassBox = {
    width: "100%",
    maxWidth: "420px",
    minHeight: "520px",
    background: "rgba(255,255,255,0.7)",
    boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "2rem 1.5rem 1rem 1.5rem",
    display: "flex",
    flexDirection: "column" as const,
    backdropFilter: "blur(8px)",
  };
  const headerStyle = {
    textAlign: "center" as const,
    fontSize: "2rem",
    fontWeight: 700,
    marginBottom: "1.2rem",
    color: "#333",
    letterSpacing: "1px",
    textShadow: "0 2px 8px #fff8",
  };
  const chatWindow = {
    flex: 1,
    overflowY: "auto" as const,
    marginBottom: "1rem",
    padding: "0.5rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.7rem",
    background: "rgba(255,255,255,0.5)",
    borderRadius: "12px",
    border: "1px solid #e0e0e0",
    boxShadow: "0 2px 8px #eee",
  };
  const inputArea = {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginTop: "0.5rem",
  };
  const inputStyle = {
    flex: 1,
    padding: "0.7rem 1rem",
    borderRadius: "999px",
    border: "1px solid #ccc",
    fontSize: "1rem",
    outline: "none",
    background: "#f9f9f9",
    boxShadow: "0 1px 4px #eee",
  };
  const buttonStyle = {
    padding: "0.7rem 1.2rem",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(90deg,#a8edea,#fed6e3)",
    color: "#333",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: "0 2px 8px #eee",
    transition: "background 0.2s",
  };
  const bubbleStyle = (role: string) => ({
    alignSelf: role === "user" ? "flex-end" : "flex-start",
    background: role === "user"
      ? "linear-gradient(135deg,#a8edea 60%,#fed6e3 100%)"
      : "#fff",
    color: "#333",
    padding: "0.8rem 1.2rem",
    borderRadius: role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    boxShadow: "0 2px 8px #e0e0e0",
    maxWidth: "80%",
    position: "relative" as const,
    fontSize: "1.05rem",
    display: "flex",
    alignItems: "center",
    gap: "0.7rem",
  });
  const avatarStyle = {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "#eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.3rem",
    boxShadow: "0 1px 4px #ccc",
  };

  return (
    <div style={bgGradient}>
      <div style={glassBox}>
        <div style={headerStyle}>
          <span role="img" aria-label="chat">💬</span> Customer Support Chatbot
        </div>
        <div style={chatWindow} ref={chatRef}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "#888", marginTop: "2rem" }}>
              Start the conversation!
            </div>
          )}
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1 && !loading;
            return (
              <div
                key={i}
                style={bubbleStyle(msg.role)}
                ref={isLast ? lastMsgRef : undefined}
              >
                <div style={avatarStyle}>
                  {msg.role === "user" ? "🧑" : "🤖"}
                </div>
                <div>
                  {msg.text}
                </div>
              </div>
            );
          })}
          {loading && (
            <div style={bubbleStyle("bot")} ref={lastMsgRef}>
              <div style={avatarStyle}>🤖</div>
              <div style={{ fontStyle: "italic", color: "#aaa" }}>...</div>
            </div>
          )}
        </div>
        <form
          style={inputArea}
          onSubmit={e => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <input
            style={inputStyle}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your question..."
            autoFocus
          />
          <button style={buttonStyle} type="submit">
            <span role="img" aria-label="send">📤</span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
