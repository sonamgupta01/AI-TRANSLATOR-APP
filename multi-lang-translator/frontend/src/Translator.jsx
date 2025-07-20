/* eslint-disable no-unused-vars */
// src/Translator.jsx
import React, { useState } from "react";
// import axios from "axios";
import ReactAudioPlayer from "react-audio-player";
import { languages } from "./languages";

export default function Translator() {
  const [inputText, setInputText] = useState("");
  const [sourceLang, setSourceLang] = useState("en"); // default English
  const [targetLang, setTargetLang] = useState("hi"); // default Hindi
  const [translatedText, setTranslatedText] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [listening, setListening] = useState(false);
  const [gender, setGender] = useState("female"); // Keep for grammatical gender
  const [voiceGender, setVoiceGender] = useState("female"); // Add for voice
  const [isTranslating, setIsTranslating] = useState(false);

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
          🌍 Multi-Language AI Translator & Pronunciation Coach
        </h1>

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
