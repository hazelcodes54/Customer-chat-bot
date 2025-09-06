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
  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem("darkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Utility: check if bot response is a handoff
  function isHandoff(response: string) {
    return response && response.toLowerCase().includes("connect you to a human agent")
      || response.toLowerCase().includes("please provide your email")
      || response.toLowerCase().includes("unable to assist further");
  }
  // TypeScript definitions for Web Speech API
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    [index: number]: SpeechRecognitionResult;
    length: number;
  }

  interface SpeechRecognitionResult {
    [index: number]: SpeechRecognitionAlternative;
    length: number;
    isFinal: boolean;
  }

  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
  }

  interface Window {
    SpeechRecognition?: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition?: {
      new (): SpeechRecognition;
    };
  }

  interface Message {
    role: string;
    text: string;
    timestamp: string;
    audioUrl?: string;
  }

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = sessionStorage.getItem("chatbot_messages");
    return saved ? JSON.parse(saved) : [];
  });

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const audioUrl = URL.createObjectURL(blob);
        setMessages(prev => [...prev, {
          role: 'user',
          text: '🎤 Voice Message',
          timestamp: getTimestamp(),
          audioUrl
        }]);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check your permissions.');
    }
  };

  const processVoiceMessage = async (audioBlob: Blob) => {
    try {
      // Convert audio to text using Web Speech API
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Create a new SpeechRecognition instance
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass() as SpeechRecognition;
      recognition.continuous = true;
      recognition.interimResults = false;
      
      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        console.log('Transcribed text:', transcript);
        
        // Add voice message with transcription
        setMessages(prev => [...prev, {
          role: 'user',
          text: `🎤 "${transcript}"`,
          timestamp: getTimestamp(),
          audioUrl: audioUrl
        }]);

        // Get bot's response
        setLoading(true);
        try {
          const res = await fetch(
            `http://127.0.0.1:8000/ask?question=${encodeURIComponent(transcript)}`
          );
          const data = await res.json();
          
          if (data.order) {
            const order = data.order;
            const orderDetails = `Order ${order.id}\nStatus: ${order.status}\nCustomer: ${order.customer_name}\nItems: ${order.items}\nTotal: $${order.total_price}\nShipping: ${order.shipping_address}\nDate: ${order.created_at}`;
            setMessages((prev) => [...prev, { role: "bot", text: orderDetails, timestamp: getTimestamp() }]);
          } else {
            setMessages((prev) => [...prev, { role: "bot", text: data.answer, timestamp: getTimestamp() }]);
          }
          
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
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setMessages(prev => [...prev, {
          role: 'user',
          text: '🎤 Voice Message (Transcription failed)',
          timestamp: getTimestamp(),
          audioUrl: audioUrl
        }]);
      };

      // Start recognition with the audio file
      audio.onended = () => recognition.stop();
      recognition.start();
      audio.play();

    } catch (err) {
      console.error('Error processing voice message:', err);
      alert('Error processing voice message. Please try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());

      // Process the voice message once recording stops
      if (chunksRef.current.length > 0) {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        processVoiceMessage(audioBlob);
      }
    }
  };

  // Clear chat handler
  const handleClearChat = () => {
    sessionStorage.removeItem("chatbot_messages");
    setMessages([]);
  };
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

  // Order tracking: show more details if available
  const sendMessage = async () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: input, timestamp: getTimestamp() }]);
    setLoading(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/ask?question=${encodeURIComponent(input)}`
      );
      const data = await res.json();
      // If the response contains order details, format them nicely
      if (data.order) {
        const order = data.order;
        const orderDetails = `Order ${order.id}\nStatus: ${order.status}\nCustomer: ${order.customer_name}\nItems: ${order.items}\nTotal: $${order.total_price}\nShipping: ${order.shipping_address}\nDate: ${order.created_at}`;
        setMessages((prev) => [...prev, { role: "bot", text: orderDetails, timestamp: getTimestamp() }]);
      } else {
        setMessages((prev) => [...prev, { role: "bot", text: data.answer, timestamp: getTimestamp() }]);
      }
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
    background: isDarkMode 
      ? "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)"
      : "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const glassBox = {
    width: "100%",
    maxWidth: "420px",
    minHeight: "520px",
    background: isDarkMode 
      ? "rgba(30, 30, 30, 0.8)"
      : "rgba(255, 255, 255, 0.7)",
    boxShadow: isDarkMode
      ? "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
      : "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
    borderRadius: "20px",
    border: isDarkMode
      ? "1px solid rgba(255,255,255,0.1)"
      : "1px solid rgba(255,255,255,0.18)",
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
    color: isDarkMode ? "#fff" : "#333",
    letterSpacing: "1px",
    textShadow: isDarkMode 
      ? "0 2px 8px rgba(0,0,0,0.5)"
      : "0 2px 8px #fff8",
  };
  const chatWindow = {
    flex: 1,
    overflowY: "auto" as const,
    marginBottom: "1rem",
    padding: "0.5rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.7rem",
    background: isDarkMode 
      ? "rgba(40, 40, 40, 0.5)"
      : "rgba(255, 255, 255, 0.5)",
    borderRadius: "12px",
    border: isDarkMode
      ? "1px solid #404040"
      : "1px solid #e0e0e0",
    boxShadow: isDarkMode
      ? "0 2px 8px rgba(0,0,0,0.2)"
      : "0 2px 8px #eee",
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
    border: isDarkMode
      ? "1px solid #404040"
      : "1px solid #ccc",
    fontSize: "1rem",
    outline: "none",
    background: isDarkMode ? "#2d2d2d" : "#f9f9f9",
    color: isDarkMode ? "#fff" : "#333",
    boxShadow: isDarkMode
      ? "0 1px 4px rgba(0,0,0,0.2)"
      : "0 1px 4px #eee",
  };
  const buttonStyle = {
    padding: "0.7rem 1.2rem",
    borderRadius: "999px",
    border: "none",
    background: isDarkMode
      ? "linear-gradient(90deg,#2d2d2d,#404040)"
      : "linear-gradient(90deg,#a8edea,#fed6e3)",
    color: isDarkMode ? "#fff" : "#333",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: isDarkMode
      ? "0 2px 8px rgba(0,0,0,0.2)"
      : "0 2px 8px #eee",
    transition: "background 0.2s",
  };
  const bubbleStyle = (role: string) => ({
    alignSelf: role === "user" ? "flex-end" : "flex-start",
    background: isDarkMode
      ? (role === "user"
        ? "linear-gradient(135deg,#404040 60%,#2d2d2d 100%)"
        : "linear-gradient(135deg, #2b2f3a 0%, #1e2127 100%)")
      : (role === "user"
        ? "linear-gradient(135deg,#a8edea 60%,#fed6e3 100%)"
        : "#fff"),
    color: isDarkMode ? "#fff" : "#333",
    padding: "0.8rem 1.2rem",
    borderRadius: role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    boxShadow: isDarkMode
      ? (role === "bot" 
        ? "0 4px 12px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.1)"
        : "0 2px 8px rgba(0,0,0,0.2)")
      : "0 2px 8px #e0e0e0",
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
    background: isDarkMode ? "linear-gradient(135deg, #3a3f4c 0%, #2b2f3a 100%)" : "#eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.3rem",
    boxShadow: isDarkMode
      ? "0 2px 6px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.1)"
      : "0 1px 4px #ccc",
    border: isDarkMode ? "2px solid rgba(255,255,255,0.1)" : "none",
  };


  // Export chat handler
  const handleExportChat = () => {
    const chatText = messages.map(m => `${m.role === "user" ? "You" : "Bot"} (${m.timestamp}):\n${m.text}\n`).join("\n");
    const blob = new Blob([chatText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chat_history.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={bgGradient}>
      <div style={glassBox}>
        <div style={headerStyle}>
          <span role="img" aria-label="chat">💬</span> Customer Support Chatbot
        </div>
        <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1rem", justifyContent: "center", alignItems: "center" }}>
          <button
            style={{
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
          <button
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "999px",
              border: "none",
              background: "#a8edea",
              color: "#333",
              fontWeight: 500,
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: "0 1px 4px #eee",
              transition: "background 0.2s",
            }}
            onClick={handleExportChat}
          >
            📄 Export Chat
          </button>
          <button
            style={{
              padding: "0.4rem 1rem",
              borderRadius: "999px",
              border: "none",
              background: isDarkMode ? "#2d2d2d" : "#fff",
              color: isDarkMode ? "#fff" : "#333",
              fontWeight: 500,
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: isDarkMode
                ? "0 1px 4px rgba(0,0,0,0.2)"
                : "0 1px 4px #eee",
              transition: "background 0.2s",
            }}
            onClick={() => setIsDarkMode(!isDarkMode)}
          >
            {isDarkMode ? "🌞 Light" : "🌙 Dark"}
          </button>
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
                className="chat-bubble-animate"
              >
                <div style={avatarStyle}>
                  {msg.role === "user" ? "🧑" : (
                    <img src="/bot-avatar.svg" alt="Bot Avatar" style={{ width: "32px", height: "32px" }} />
                  )}
                </div>
                <div style={{ width: "100%", position: "relative" }}>
                  <div style={{ 
                    position: "absolute", 
                    right: msg.role === "user" ? "-30px" : "auto",
                    left: msg.role === "bot" ? "-30px" : "auto",
                    top: "0",
                    cursor: "pointer",
                    padding: "4px",
                    borderRadius: "50%",
                    background: isDarkMode ? "rgba(40, 40, 40, 0.8)" : "rgba(255, 255, 255, 0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isDarkMode 
                      ? "0 2px 4px rgba(0,0,0,0.2)"
                      : "0 2px 4px rgba(0,0,0,0.1)"
                  }}
                    onClick={() => {
                      const text = msg.text;
                      const shareData = {
                        title: 'Customer Support Chat',
                        text: `${text}\n\nShared from Customer Support Chatbot`,
                        url: window.location.href
                      };

                      if (navigator.share && navigator.canShare(shareData)) {
                        navigator.share(shareData)
                          .catch((error) => console.log('Error sharing:', error));
                      } else {
                        // Fallback for desktop or browsers without Web Share API
                        const platforms = {
                          Twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.text)}&url=${encodeURIComponent(shareData.url)}`,
                          Facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}&quote=${encodeURIComponent(shareData.text)}`,
                          LinkedIn: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareData.url)}`
                        };
                        
                        // Open in a new window
                        const width = 550;
                        const height = 400;
                        const left = (window.innerWidth - width) / 2;
                        const top = (window.innerHeight - height) / 2;
                        
                        // Let user choose platform
                        const platform = prompt("Choose a platform to share on (Twitter, Facebook, LinkedIn):");
                        if (platform && platforms[platform as keyof typeof platforms]) {
                          window.open(
                            platforms[platform as keyof typeof platforms],
                            'share',
                            `width=${width},height=${height},left=${left},top=${top}`
                          );
                        }
                      }
                    }}
                  >
                    <span role="img" aria-label="share" style={{ fontSize: "14px" }}>📤</span>
                  </div>
                  {msg.text}
                  {msg.audioUrl && (
                    <div style={{ 
                      marginTop: "0.5rem",
                      background: isDarkMode ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.5)",
                      padding: "0.5rem",
                      borderRadius: "8px",
                      boxShadow: isDarkMode 
                        ? "inset 0 0 0 1px rgba(255,255,255,0.1)"
                        : "inset 0 0 0 1px rgba(0,0,0,0.1)"
                    }}>
                      <audio 
                        controls 
                        src={msg.audioUrl}
                        style={{ 
                          width: "100%",
                          height: "32px",
                          filter: isDarkMode ? "invert(1)" : "none"
                        }}
                      />
                    </div>
                  )}
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
            <button 
              type="button"
              style={{
                ...buttonStyle,
                padding: "0.7rem",
                background: isRecording
                  ? "linear-gradient(90deg, #ff6b6b, #ff8787)"
                  : buttonStyle.background
              }}
              onClick={isRecording ? stopRecording : startRecording}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              <span role="img" aria-label="microphone">
                {isRecording ? "⏹️" : "🎤"}
              </span>
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
