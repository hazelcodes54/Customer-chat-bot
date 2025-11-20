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
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const completed = localStorage.getItem("onboardingCompleted");
    return !completed;
  });
  const [currentSlide, setCurrentSlide] = useState(0);

  // Onboarding slides
  const onboardingSlides = [
    {
      icon: "👋",
      title: "Welcome to Customer Support Chat",
      description: "Get instant help with your orders, products, and questions 24/7"
    },
    {
      icon: "📦",
      title: "Track Your Orders",
      description: "Simply type your order number (e.g., SH123) to get real-time tracking updates"
    },
    {
      icon: "🌍",
      title: "Multi-Language Support",
      description: "Chat in your preferred language! We support 15+ languages including English, Spanish, French, German, and more"
    },
    {
      icon: "🎯",
      title: "Quick Answers",
      description: "Ask about products, returns, policies, or anything else. Our bot is here to help!"
    }
  ];

  const handleNextSlide = () => {
    if (currentSlide < onboardingSlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // Complete onboarding
      localStorage.setItem("onboardingCompleted", "true");
      setShowOnboarding(false);
    }
  };

  const skipOnboarding = () => {
    localStorage.setItem("onboardingCompleted", "true");
    setShowOnboarding(false);
  };

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });
  
  // Language state
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const saved = localStorage.getItem("selectedLanguage");
    return saved || navigator.language.split('-')[0] || 'en';
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
    language?: string;
  }

  // Supported languages
  const languages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'nl': 'Dutch',
    'ru': 'Russian',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'hi': 'Hindi'
  };

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = sessionStorage.getItem("chatbot_messages");
    if (saved) {
      return JSON.parse(saved);
    }
    // Default welcome message
    return [{
      role: 'bot',
      text: "👋 Welcome! I'm your customer support assistant. How can I help you today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }];
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
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
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

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEmojiPicker || showLanguagePicker) {
        const target = event.target as HTMLElement;
        if (!target.closest('.emoji-picker') && !target.closest('.language-picker')) {
          setShowEmojiPicker(false);
          setShowLanguagePicker(false);
        }
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showEmojiPicker, showLanguagePicker]);

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
        `http://127.0.0.1:8000/ask?question=${encodeURIComponent(input)}&target_lang=${selectedLanguage}`
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
      console.error("API Error:", error);  // Add detailed error logging
      setMessages((prev) => [
        ...prev,
        { 
          role: "bot", 
          text: "⚠️ Error: Could not reach server. Please make sure the backend is running on http://127.0.0.1:8000", 
          timestamp: getTimestamp() 
        },
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
    width: "100vw",
    margin: 0,
    padding: 0,
    background: isDarkMode 
      ? "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)"
      : "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const glassBox = {
    width: "100%",
    maxWidth: "480px",
    minHeight: "600px",
    background: isDarkMode 
      ? "rgba(25, 25, 40, 0.85)"
      : "rgba(255, 255, 255, 0.7)",
    boxShadow: isDarkMode
      ? "0 8px 32px 0 rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(123, 97, 255, 0.3)"
      : "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
    borderRadius: "20px",
    border: isDarkMode
      ? "1px solid rgba(123, 97, 255, 0.2)"
      : "1px solid rgba(255,255,255,0.18)",
    padding: "2rem 1.5rem 1rem 1.5rem",
    display: "flex",
    flexDirection: "column" as const,
    backdropFilter: "blur(12px)",
    overflow: "hidden" as const,
  };
  const headerStyle = {
    textAlign: "center" as const,
    fontSize: "2rem",
    fontWeight: 700,
    marginBottom: "1.2rem",
    color: isDarkMode ? "#fff" : "#333",
    letterSpacing: "1px",
    textShadow: isDarkMode 
      ? "0 0 20px rgba(123, 97, 255, 0.5), 0 2px 8px rgba(0,0,0,0.5)"
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
      ? "rgba(20, 20, 35, 0.6)"
      : "rgba(255, 255, 255, 0.5)",
    borderRadius: "12px",
    border: isDarkMode
      ? "1px solid rgba(123, 97, 255, 0.15)"
      : "1px solid #e0e0e0",
    boxShadow: isDarkMode
      ? "inset 0 2px 8px rgba(0,0,0,0.3)"
      : "0 2px 8px #eee",
  };
  const inputArea = {
    display: "flex",
    gap: "0.4rem",
    alignItems: "center",
    marginTop: "0.5rem",
    position: "relative" as const,
    flexWrap: "nowrap" as const,
  };
  const inputStyle = {
    flex: 1,
    padding: "0.7rem 1rem",
    borderRadius: "999px",
    border: isDarkMode
      ? "1px solid rgba(123, 97, 255, 0.3)"
      : "1px solid #ccc",
    fontSize: "1rem",
    outline: "none",
    background: isDarkMode ? "rgba(30, 30, 45, 0.8)" : "#f9f9f9",
    color: isDarkMode ? "#e0e0e0" : "#333",
    boxShadow: isDarkMode
      ? "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 2px rgba(123, 97, 255, 0.1)"
      : "0 1px 4px #eee",
  };
  const buttonStyle = {
    padding: "0.6rem",
    width: "2.6rem",
    height: "2.6rem",
    borderRadius: "999px",
    border: "none",
    background: isDarkMode 
      ? "linear-gradient(135deg, #7b61ff, #9c4dff)"
      : "linear-gradient(135deg, #fed6e3, #a8edea)",
    color: isDarkMode ? "#fff" : "#333",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: isDarkMode
      ? "0 4px 15px rgba(123, 97, 255, 0.4), 0 0 20px rgba(123, 97, 255, 0.2)"
      : "0 4px 12px rgba(0,0,0,0.1)",
    transition: "all 0.3s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  const bubbleStyle = (role: string) => ({
    alignSelf: role === "user" ? "flex-end" : "flex-start",
    background: isDarkMode
      ? (role === "user"
        ? "linear-gradient(135deg, #7b61ff 0%, #9c4dff 100%)"
        : "linear-gradient(135deg, #2d3548 0%, #1f2937 100%)")
      : (role === "user"
        ? "linear-gradient(135deg,#a8edea 60%,#fed6e3 100%)"
        : "#fff"),
    color: isDarkMode ? "#fff" : "#333",
    padding: "0.8rem 1.2rem",
    borderRadius: role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    boxShadow: isDarkMode
      ? (role === "bot" 
        ? "0 4px 12px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(123, 97, 255, 0.2)"
        : "0 4px 15px rgba(123, 97, 255, 0.3), 0 0 20px rgba(123, 97, 255, 0.1)")
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
    background: isDarkMode ? "linear-gradient(135deg, #7b61ff 0%, #9c4dff 100%)" : "#eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.3rem",
    boxShadow: isDarkMode
      ? "0 0 15px rgba(123, 97, 255, 0.5), 0 2px 6px rgba(0,0,0,0.3)"
      : "0 1px 4px #ccc",
    border: isDarkMode ? "2px solid rgba(255,255,255,0.2)" : "none",
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
    <>
      {showOnboarding ? (
        <div style={bgGradient}>
          <div style={{
            ...glassBox,
            maxWidth: "500px",
            minHeight: "500px",
            display: "flex",
            flexDirection: "column" as const,
            justifyContent: "space-between",
            alignItems: "center",
            padding: "3rem 2rem",
            textAlign: "center" as const
          }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, justifyContent: "center", alignItems: "center" }}>
              <div style={{ 
                fontSize: "5rem", 
                marginBottom: "1.5rem",
                animation: "bounceIn 0.6s ease"
              }}>
                {onboardingSlides[currentSlide].icon}
              </div>
              <h2 style={{ 
                fontSize: "1.8rem", 
                fontWeight: 700, 
                marginBottom: "1rem",
                color: isDarkMode ? "#fff" : "#333"
              }}>
                {onboardingSlides[currentSlide].title}
              </h2>
              <p style={{ 
                fontSize: "1.1rem", 
                lineHeight: "1.6",
                color: isDarkMode ? "#e0e0e0" : "#666",
                maxWidth: "400px"
              }}>
                {onboardingSlides[currentSlide].description}
              </p>
            </div>

            <div style={{ width: "100%", marginTop: "2rem" }}>
              {/* Progress dots */}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginBottom: "1.5rem" }}>
                {onboardingSlides.map((_, index) => (
                  <div
                    key={index}
                    style={{
                      width: currentSlide === index ? "2rem" : "0.5rem",
                      height: "0.5rem",
                      borderRadius: "999px",
                      background: currentSlide === index 
                        ? (isDarkMode ? "#7b61ff" : "#a8edea")
                        : (isDarkMode ? "#555" : "#ddd"),
                      transition: "all 0.3s ease"
                    }}
                  />
                ))}
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                {currentSlide > 0 && (
                  <button
                    onClick={skipOnboarding}
                    style={{
                      padding: "0.8rem 1.5rem",
                      borderRadius: "999px",
                      border: isDarkMode ? "1px solid rgba(255,255,255,0.2)" : "1px solid #ddd",
                      background: "transparent",
                      color: isDarkMode ? "#fff" : "#666",
                      fontWeight: 600,
                      fontSize: "1rem",
                      cursor: "pointer",
                      transition: "all 0.3s ease"
                    }}
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={handleNextSlide}
                  style={{
                    padding: "0.8rem 2rem",
                    borderRadius: "999px",
                    border: "none",
                    background: isDarkMode 
                      ? "linear-gradient(135deg, #7b61ff, #9c4dff)"
                      : "linear-gradient(135deg, #a8edea, #fed6e3)",
                    color: isDarkMode ? "#fff" : "#333",
                    fontWeight: 700,
                    fontSize: "1rem",
                    cursor: "pointer",
                    boxShadow: isDarkMode
                      ? "0 4px 15px rgba(123, 97, 255, 0.4)"
                      : "0 4px 12px rgba(0,0,0,0.1)",
                    transition: "all 0.3s ease"
                  }}
                >
                  {currentSlide === onboardingSlides.length - 1 ? "Get Started 🚀" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
    <div style={bgGradient}>
      <div style={glassBox}>
        <div style={headerStyle}>
          <span role="img" aria-label="chat">💬</span> Customer Support Chatbot
        </div>
        <div style={{ display: "flex", gap: "0.7rem", marginBottom: "1rem", justifyContent: "center", alignItems: "center" }}>
          <button
            style={{
              padding: "0.6rem 1rem",
              minWidth: "6rem",
              height: "2.8rem",
              borderRadius: "999px",
              border: "none",
              background: isDarkMode 
                ? "linear-gradient(135deg, #7b61ff, #9c4dff)"
                : "linear-gradient(135deg, #fed6e3, #a8edea)",
              color: isDarkMode ? "#fff" : "#333",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              boxShadow: isDarkMode
                ? "0 4px 15px rgba(123, 97, 255, 0.4), 0 0 20px rgba(123, 97, 255, 0.2)"
                : "0 4px 12px rgba(0,0,0,0.1)",
              transition: "all 0.3s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              justifyContent: "center"
            }}
            onClick={handleClearChat}
          >
            <span>🗑️</span>
            <span>Clear Chat</span>
          </button>
          <button
            style={{
              padding: "0.6rem 1rem",
              minWidth: "6rem",
              height: "2.8rem",
              borderRadius: "999px",
              border: "none",
              background: isDarkMode 
                ? "linear-gradient(135deg, #7b61ff, #9c4dff)"
                : "linear-gradient(135deg, #fed6e3, #a8edea)",
              color: isDarkMode ? "#fff" : "#333",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              boxShadow: isDarkMode
                ? "0 4px 15px rgba(123, 97, 255, 0.4), 0 0 20px rgba(123, 97, 255, 0.2)"
                : "0 4px 12px rgba(0,0,0,0.1)",
              transition: "all 0.3s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              justifyContent: "center"
            }}
            onClick={handleExportChat}
          >
            <span>📄</span>
            <span>Download</span>
          </button>
          <button
            style={{
              padding: "0.6rem 1rem",
              minWidth: "6rem",
              height: "2.8rem",
              borderRadius: "999px",
              border: "none",
              background: isDarkMode 
                ? "linear-gradient(135deg, #7b61ff, #9c4dff)"
                : "linear-gradient(135deg, #fed6e3, #a8edea)",
              color: isDarkMode ? "#fff" : "#333",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              boxShadow: isDarkMode
                ? "0 4px 15px rgba(123, 97, 255, 0.4), 0 0 20px rgba(123, 97, 255, 0.2)"
                : "0 4px 12px rgba(0,0,0,0.1)",
              transition: "all 0.3s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              justifyContent: "center"
            }}
            onClick={() => setIsDarkMode(!isDarkMode)}
          >
            <span>{isDarkMode ? "🌞" : "🌙"}</span>
            <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
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
              placeholder="Ask about orders, products, or support..."
              autoFocus
            />
            <button
              type="button"
              style={buttonStyle}
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
                setShowLanguagePicker(false);
              }}
              aria-label="Pick emoji"
            >
              😊
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowLanguagePicker(!showLanguagePicker);
                setShowEmojiPicker(false);
              }}
              style={buttonStyle}
            >
              {selectedLanguage === 'en' ? '🌐' : '🔄'}
            </button>
            <button 
              type="button"
              style={{
                ...buttonStyle,
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
            {showLanguagePicker && (
              <div style={{
                position: "absolute",
                bottom: "3.5rem",
                right: "3.5rem",
                background: isDarkMode ? "#2d2d2d" : "#fff",
                border: isDarkMode ? "1px solid #404040" : "1px solid #eee",
                borderRadius: "10px",
                boxShadow: isDarkMode 
                  ? "0 2px 8px rgba(0,0,0,0.2)"
                  : "0 2px 8px #eee",
                padding: "0.5rem",
                display: "flex",
                flexDirection: "column" as const,
                gap: "0.3rem",
                zIndex: 10,
                maxHeight: "200px",
                overflowY: "auto" as const,
                width: "150px"
              }}>
                {Object.entries(languages).map(([code, name]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setSelectedLanguage(code);
                      localStorage.setItem("selectedLanguage", code);
                      setShowLanguagePicker(false);
                    }}
                    style={{
                      fontSize: "0.9rem",
                      padding: "0.5rem",
                      background: selectedLanguage === code 
                        ? (isDarkMode ? "#404040" : "#f0f0f0")
                        : "none",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      color: isDarkMode ? "#fff" : "#333",
                      textAlign: "left" as const,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem"
                    }}
                  >
                    <span>{code === 'en' ? '🌐' : '🔄'}</span>
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            )}
            {showEmojiPicker && (
              <div className="emoji-picker" style={{ position: "absolute", bottom: "3.5rem", left: 0, background: isDarkMode ? "#2d2d2d" : "#fff", border: isDarkMode ? "1px solid #404040" : "1px solid #eee", borderRadius: "10px", boxShadow: isDarkMode ? "0 2px 8px rgba(0,0,0,0.2)" : "0 2px 8px #eee", padding: "0.5rem", display: "flex", gap: "0.3rem", zIndex: 10 }}>
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
      )}
    </>
  );
}

export default App;
