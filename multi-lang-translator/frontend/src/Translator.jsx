/* eslint-disable no-unused-vars */
// src/Translator.jsx
import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import ReactAudioPlayer from "react-audio-player";
import { languages } from "./languages";

export default function Translator() {
  // Translation states
  const [inputText, setInputText] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("hi");
  const [translatedText, setTranslatedText] = useState("");
  const [romanizedText, setRomanizedText] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [listening, setListening] = useState(false);
  const [gender, setGender] = useState("female");
  const [voiceGender, setVoiceGender] = useState("female");
  const [isTranslating, setIsTranslating] = useState(false);

  // Chat and teaching states
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("teaching-room");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [userRole, setUserRole] = useState("learner");
  const [skillTopic, setSkillTopic] = useState("guitar");
  const [isJoined, setIsJoined] = useState(false);

  const skills = [
    "guitar", "coding", "cooking", "painting", "language", "math", "science", "music"
  ];

  // SocketIO connection
  useEffect(() => {
    const newSocket = io("http://localhost:5000");
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('receive_message', (data) => {
      setChatMessages(prev => [...prev, {
        type: 'user',
        username: data.username,
        message: data.message,
        translated_message: data.translated_message,
        original_lang: data.original_lang,
        target_lang: data.target_lang,
        timestamp: data.timestamp
      }]);
    });

    newSocket.on('ai_message', (data) => {
      setChatMessages(prev => [...prev, {
        type: 'ai',
        message: data.message,
        aiType: data.type
      }]);
    });

    newSocket.on('user_joined', (data) => {
      setChatMessages(prev => [...prev, {
        type: 'system',
        message: `${data.username} joined the room`
      }]);
    });

    return () => newSocket.close();
  }, []);

  // Join room
  const joinRoom = () => {
    if (socket && username.trim()) {
      socket.emit('join_room', { room, username });
      setIsJoined(true);
      setChatMessages(prev => [...prev, {
        type: 'system',
        message: `You joined the room as ${userRole} for ${skillTopic}`
      }]);
    }
  };

  // Send chat message
  const sendMessage = () => {
    if (socket && chatInput.trim() && isJoined) {
      const messageData = {
        room,
        message: chatInput,
        username,
        user_lang: sourceLang,
        target_lang: targetLang,
        skill_topic: skillTopic,
        user_role: userRole,
        timestamp: new Date().toISOString()
      };
      socket.emit('send_message', messageData);
      setChatInput("");
    }
  };

  // Find the selected source and target language objects with support flags
  const selectedSourceLang = languages.find((l) => l.code === sourceLang);
  const selectedTargetLang = languages.find((l) => l.code === targetLang);

  // Handle Translate button click
  const handleTranslate = async () => {
    if (!inputText.trim()) {
      alert("Please enter some text to translate");
      return;
    }

    // Check text length
    if (inputText.length > 500) {
      if (!confirm("Large text detected. This may take 30-60 seconds. Continue?")) {
        return;
      }
    }

    setIsTranslating(true);
    setTranslatedText("");
    setRomanizedText("");
    setAudioUrl("");

    try {
      const response = await fetch("http://localhost:5000/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: inputText,
          source_lang: sourceLang,
          target_lang: targetLang,
          tts: true, // Always request TTS - let backend decide
          speaker_gender: gender,
          voice_gender: voiceGender,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setTranslatedText(data.translated_text);
      setRomanizedText(data.romanized_text || "");

      // Set audio if available (backend will return null if not supported)
      if (data.audio_url) {
        setAudioUrl(data.audio_url);
      }
    } catch (error) {
      console.error("Translation error:", error);
      setTranslatedText(`Error: ${error.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  // Handle Speech-to-Text using Web Speech API
  const startSpeechRecognition = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Your browser does not support Speech Recognition");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = sourceLang; // Listen in the selected source language
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const speechResult = event.results[0][0].transcript;
      setInputText(speechResult);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      alert("Speech recognition error: " + event.error);
    };

    recognition.onend = () => setListening(false);

    recognition.start();
  };

  return (
    <div className="app-container">
      <div className="translator-card">
        <h1 className="main-title">
          🌍 Multi-Language AI Translator & Peer Teaching Platform
        </h1>

        {/* Teaching Setup */}
        <div className="teaching-setup">
          <h2>🎓 Join Teaching Session</h2>
          <div className="form-row">
            <div>
              <label className="section-title">Your Name:</label>
              <input
                type="text"
                className="text-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name"
                disabled={isJoined}
              />
            </div>
            <div>
              <label className="section-title">Your Role:</label>
              <select
                className="language-select"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                disabled={isJoined}
              >
                <option value="learner">Learner</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>
            <div>
              <label className="section-title">Skill Topic:</label>
              <select
                className="language-select"
                value={skillTopic}
                onChange={(e) => setSkillTopic(e.target.value)}
                disabled={isJoined}
              >
                {skills.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill.charAt(0).toUpperCase() + skill.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isJoined ? (
            <button
              className="btn btn-primary"
              onClick={joinRoom}
              disabled={!username.trim() || !isConnected}
            >
              {isConnected ? 'Join Teaching Session' : 'Connecting...'}
            </button>
          ) : (
            <div className="session-info">
              <span>Connected as {userRole} for {skillTopic} • Room: {room}</span>
            </div>
          )}
        </div>

        {/* Chat Interface */}
        {isJoined && (
          <div className="chat-section">
            <h3>💬 Teaching Chat (AI Mediator)</h3>
            <div className="chat-messages">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.type}`}>
                  {msg.type === 'user' && (
                    <div>
                      <strong>{msg.username}: </strong>
                      <span>{msg.message}</span>
                      {msg.translated_message && msg.message !== msg.translated_message && (
                        <div style={{fontSize: '0.9em', color: 'rgba(255,255,255,0.7)', marginTop: '4px'}}>
                          <em>Translated: {msg.translated_message}</em>
                        </div>
                      )}
                    </div>
                  )}
                  {msg.type === 'ai' && (
                    <div>
                      <strong>🤖 AI {msg.aiType}: </strong>
                      <span>{msg.message}</span>
                    </div>
                  )}
                  {msg.type === 'system' && (
                    <em>{msg.message}</em>
                  )}
                </div>
              ))}
            </div>
            <div className="chat-input-row">
              <input
                type="text"
                className="text-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type your teaching message..."
              />
              <button
                className="btn btn-primary"
                onClick={sendMessage}
                disabled={!chatInput.trim()}
              >
                Send
              </button>
            </div>
          </div>
        )}

        <hr style={{margin: '20px 0', borderColor: 'rgba(255,255,255,0.2)'}} />

        <h2>🔄 Translation Tool</h2>

        <div className="form-grid">
          <div>
            <textarea
              className="text-input"
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your sentence here..."
            />
            <div className={`char-counter ${inputText.length > 200 ? 'char-warning' : ''} ${inputText.length > 500 ? 'char-error' : ''}`}>
              {inputText.length}/500 characters
              {inputText.length > 200 && (
                <span className="ml-2">⚠️ Large text may take 30-60 seconds</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="section-title">Source Language:</label>
              <select
                className="language-select"
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} {!lang.stt && '(Text Only)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="section-title">Target Language:</label>
              <select
                className="language-select"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} {!lang.tts && '(Text Only)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div>
              <label className="section-title">Gender (for grammar):</label>
              <select
                className="language-select"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>

            <div>
              <label className="section-title">Voice Gender:</label>
              <select
                className="language-select"
                value={voiceGender}
                onChange={(e) => setVoiceGender(e.target.value)}
                disabled={!selectedTargetLang?.tts}
              >
                <option value="female">Female Voice</option>
                <option value="male">Male Voice</option>
              </select>
              {!selectedTargetLang?.tts && (
                <small style={{color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem'}}>
                  Voice not available for this language
                </small>
              )}
            </div>
          </div>

          <div className="form-row">
            <button
              className={`btn mic-button ${listening ? 'listening' : 'btn-secondary'}`}
              onClick={startSpeechRecognition}
              disabled={!selectedSourceLang?.stt || listening}
              title={!selectedSourceLang?.stt ? 'Speech recognition not available for this language' : 'Click to speak'}
            >
              🎤 {!selectedSourceLang?.stt && '❌'}
            </button>

            <button
              className={`btn ${isTranslating ? 'btn-disabled' : 'btn-primary'}`}
              onClick={handleTranslate}
              disabled={isTranslating || inputText.length > 500}
            >
              {isTranslating ? (
                <>
                  <span className="loading-spinner"></span> Translating...
                </>
              ) : (
                '🔄 Translate'
              )}
            </button>
          </div>

          {translatedText && (
            <div className="translation-output">
              <h3 className="section-title">Translation:</h3>
              <p className="translation-text">{translatedText}</p>

              {romanizedText && (
                <div className="mt-md">
                  <h4 className="section-title" style={{fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)'}}>
                    Romanized (for pronunciation):
                  </h4>
                  <p className="translation-text" style={{fontStyle: 'italic', color: 'rgba(255,255,255,0.9)'}}>
                    {romanizedText}
                  </p>
                </div>
              )}

              {audioUrl && (
                <div className="mt-md">
                  <ReactAudioPlayer
                    src={audioUrl}
                    controls
                    style={{
                      width: '100%',
                      marginTop: '10px'
                    }}
                  />
                </div>
              )}
              
              {!audioUrl && translatedText && !translatedText.startsWith("Error:") && (
                <div style={{marginTop: '10px', padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px'}}>
                  <small style={{color: 'rgba(255,255,255,0.8)'}}>
                    🔇 Audio not available for {selectedTargetLang?.name}
                  </small>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
