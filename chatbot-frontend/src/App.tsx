
import React, { useState, useRef, useEffect } from "react";
import './App.css';

// Typing indicator component
const TypingIndicator = () => (
  <div className="typing-indicator">
    <span className="dot" />
    <span className="dot" />
    <span className="dot" />
  </div>
);


function App() {
  // Utility: check if bot response is a handoff
  function isHandoff(response: string) {
    return response && response.toLowerCase().includes("connect you to a human agent")
      || response.toLowerCase().includes("please provide your email")
      || response.toLowerCase().includes("unable to assist further");
  }
  const [messages, setMessages] = useState<{ role: string; text: string; timestamp: string }[]>(() => {
    const saved = sessionStorage.getItem("chatbot_messages");
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Emoji list (simple set)
  const emojis = ["😀", "😂", "😍", "😎", "👍", "🙏", "🎉", "😢", "🤔", "🙌", "🔥", "🥳", "💡", "🚀"];

  const handleEmojiClick = (emoji: string) => {
    setInput(input + emoji);
    setShowEmojiPicker(false);
  };
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);

  // Handoff state
  const [handoffActive, setHandoffActive] = useState(false);
  const [handoffError, setHandoffError] = useState<string>("");
  const [handoffEmail, setHandoffEmail] = useState("");
  const [handoffIssue, setHandoffIssue] = useState("");
  const [handoffSent, setHandoffSent] = useState(false);

  // Save messages to sessionStorage whenever they change

  // Add welcome message on initial load
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "bot",
          text: "👋 Welcome! I'm your customer support assistant. How can I help you today?",
          timestamp: getTimestamp()
        }
      ]);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem("chatbot_messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (lastMsgRef.current) {
      lastMsgRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: input, timestamp: getTimestamp() }]);
    setLoading(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/ask?question=${encodeURIComponent(input)}`
      );
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "bot", text: data.answer, timestamp: getTimestamp() }]);
      // If bot triggers handoff, show form
      if (isHandoff(data.answer)) {
        setHandoffActive(true);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "⚠️ Error: could not reach server.", timestamp: getTimestamp() },
      ]);
    }
    setLoading(false);
    setInput("");
  };

  // Submit handoff form
  const submitHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    setHandoffSent(false);
    try {
      const res = await fetch("http://127.0.0.1:8000/support_ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: handoffEmail, issue: handoffIssue })
      });
      if (res.ok) {
        setHandoffSent(true);
        setHandoffActive(false);
  setMessages((prev) => [...prev, { role: "bot", text: "Thank you! Your message has been received. A human agent will contact you soon.", timestamp: getTimestamp() }]);
        setHandoffEmail("");
        setHandoffIssue("");
      }
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: "Sorry, there was an error logging your issue.", timestamp: getTimestamp() }]);
    }
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

  // Clear chat handler
  const handleClearChat = () => {
    sessionStorage.removeItem("chatbot_messages");
    setMessages([]);
  };

  return (
    <div style={bgGradient}>
      <div style={glassBox}>
        <div style={headerStyle}>
          <span role="img" aria-label="chat">💬</span> Customer Support Chatbot
        </div>
        <button
          style={{
            marginBottom: "1rem",
            alignSelf: "flex-end",
            padding: "0.4rem 1rem",
            borderRadius: "999px",
            border: "none",
            background: "#fed6e3",
            color: "#333",
            fontWeight: 500,
            fontSize: "0.95rem",
            cursor: "pointer",
            boxShadow: "0 1px 4px #eee",
            transition: "background 0.2s",
          }}
          onClick={handleClearChat}
        >
          🗑️ Clear Chat
        </button>
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
                className="chat-bubble-animate"
              >
                <div style={avatarStyle}>
                  {msg.role === "user" ? "🧑" : (
                    <img src="/bot-avatar.svg" alt="Bot Avatar" style={{ width: "32px", height: "32px" }} />
                  )}
                </div>
                <div>
                  {msg.text}
                  <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.2rem", textAlign: msg.role === "user" ? "right" : "left" }}>
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && (
            <div style={bubbleStyle("bot")} ref={lastMsgRef}>
              <div style={avatarStyle}>
                <img src="/bot-avatar.svg" alt="Bot Avatar" style={{ width: "32px", height: "32px" }} />
              </div>
              <TypingIndicator />
            </div>
          )}
        </div>
        {handoffActive ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '1rem' }}>
            <form className="handoff-form" onSubmit={submitHandoff} style={{ width: '100%', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.5)', padding: '0.7rem 0.5rem', borderRadius: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
              <input
                type="email"
                value={handoffEmail}
                onChange={e => setHandoffEmail(e.target.value)}
                placeholder="Email"
                required
                style={{ fontSize: '0.95rem', padding: '0.4rem', borderRadius: '6px', border: '1px solid #cce', marginBottom: '0.3rem' }}
              />
              <input
                value={handoffIssue}
                onChange={e => setHandoffIssue(e.target.value)}
                placeholder="Issue"
                required
                style={{ fontSize: '0.95rem', padding: '0.4rem', borderRadius: '6px', border: '1px solid #cce', marginBottom: '0.3rem' }}
              />
              <button type="submit" style={{ fontSize: '1rem', padding: '0.4rem', borderRadius: '6px', background: 'linear-gradient(90deg,#b2f7ef,#fbc2eb)', color: '#333', fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>Submit Ticket</button>
            </form>
            {handoffError && (
              <div style={{ color: '#d33', marginTop: '0.3rem', textAlign: 'center', fontWeight: 500, fontSize: '0.95rem' }}>
                {handoffError}
              </div>
            )}
          </div>
        ) : (
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
            <button
              type="button"
              style={{ ...buttonStyle, padding: "0.7rem", fontSize: "1.2rem" }}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label="Pick emoji"
            >
              😊
            </button>
            <button style={buttonStyle} type="submit">
              <span role="img" aria-label="send">📤</span>
            </button>
            {showEmojiPicker && (
              <div style={{ position: "absolute", bottom: "3.5rem", left: 0, background: "#fff", border: "1px solid #eee", borderRadius: "10px", boxShadow: "0 2px 8px #eee", padding: "0.5rem", display: "flex", gap: "0.3rem", zIndex: 10 }}>
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    style={{ fontSize: "1.3rem", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => handleEmojiClick(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default App;
