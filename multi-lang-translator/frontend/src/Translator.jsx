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
    setAudioUrl(null);

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
          tts: selectedTargetLang?.tts || false,
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
    <div
      style={{
        maxWidth: 600,
        margin: "auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Multi-Language AI Translator & Pronunciation Coach</h1>

      <textarea
        rows={4}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Type your sentence here"
        style={{ width: "100%", fontSize: 16, padding: 10 }}
      />
      <div style={{ textAlign: "right", fontSize: "12px", color: "#666", marginTop: "5px" }}>
        {inputText.length}/500 characters
        {inputText.length > 200 && (
          <span style={{ color: "#ff6b35", marginLeft: "10px" }}>
            ⚠️ Large text may take 30-60 seconds
          </span>
        )}
        {inputText.length > 500 && (
          <span style={{ color: "#dc3545", marginLeft: "10px" }}>
            ❌ Too long! Please reduce text.
          </span>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <label htmlFor="source-language-select" style={{ fontWeight: "bold" }}>
          Source Language (What you're speaking/typing):
        </label>
        <br />
        <select
          id="source-language-select"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          style={{ width: "100%", padding: 8, fontSize: 16, marginTop: 5 }}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          onClick={startSpeechRecognition}
          disabled={!selectedSourceLang?.stt || listening}
          style={{
            width: "100%",
            padding: "10px 0",
            fontSize: 16,
            cursor: selectedSourceLang?.stt ? "pointer" : "not-allowed",
            backgroundColor: selectedSourceLang?.stt ? "#28a745" : "#6c757d",
            color: "white",
            border: "none",
            borderRadius: 4,
            marginBottom: 10
          }}
          title={
            selectedSourceLang?.stt
              ? `Speak in ${selectedSourceLang.name}`
              : `Speech input not supported for ${selectedSourceLang?.name}`
          }
        >
          {listening ? "Listening..." : `🎤 Speak in ${selectedSourceLang?.name}`}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <label htmlFor="target-language-select" style={{ fontWeight: "bold" }}>
          Target Language (What you want to translate to):
        </label>
        <br />
        <select
          id="target-language-select"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          style={{ width: "100%", padding: 8, fontSize: 16, marginTop: 5 }}
        >
          <optgroup label="🔊 Fully Supported (Translate + Audio + Voice Input)">
            {languages
              .filter((l) => l.tts && l.stt)
              .map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="📝 Text Only (Translate Only)">
            {languages
              .filter((l) => !l.tts)
              .map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
          </optgroup>
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ fontWeight: "bold" }}>
          Speaker Gender (affects grammar in Hindi/Urdu/Nepali):
        </label>
        <br />
        <div style={{ marginTop: 5 }}>
          <label style={{ marginRight: 20 }}>
            <input
              type="radio"
              value="male"
              checked={gender === "male"}
              onChange={(e) => setGender(e.target.value)}
              style={{ marginRight: 5 }}
            />
            Male Speaker
          </label>
          <label>
            <input
              type="radio"
              value="female"
              checked={gender === "female"}
              onChange={(e) => setGender(e.target.value)}
              style={{ marginRight: 5 }}
            />
            Female Speaker
          </label>
        </div>
        <small style={{ color: "#666", fontSize: "12px" }}>
          
        </small>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ fontWeight: "bold" }}>
          Voice Gender (for audio):
        </label>
        <br />
        <div style={{ marginTop: 5 }}>
          <label style={{ marginRight: 20 }}>
            <input
              type="radio"
              value="female"
              checked={voiceGender === "female"}
              onChange={(e) => setVoiceGender(e.target.value)}
              style={{ marginRight: 5 }}
            />
            Female Voice
          </label>
          <label>
            <input
              type="radio"
              value="male"
              checked={voiceGender === "male"}
              onChange={(e) => setVoiceGender(e.target.value)}
              style={{ marginRight: 5 }}
            />
            Male Voice
          </label>
        </div>
      </div>

      <div style={{ marginTop: 15 }}>
        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          style={{
            width: "100%",
            padding: "10px 0",
            fontSize: 16,
            cursor: isTranslating ? "not-allowed" : "pointer",
            backgroundColor: isTranslating ? "#6c757d" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: 4,
          }}
        >
          {isTranslating ? "Translating..." : "🔄 Translate"}
        </button>
      </div>

      {translatedText && (
        <div style={{ marginTop: 30 }}>
          <h3>Translated Text:</h3>
          <p
            style={{
              padding: 10,
              backgroundColor: "#f1f1f1",
              borderRadius: 4,
              fontSize: 18,
              minHeight: 60,
              color: "#000000",
              fontWeight: "bold"
            }}
          >
            {translatedText}
          </p>

          {audioUrl && (
            <ReactAudioPlayer
              src={audioUrl}
              controls
              style={{ marginTop: 15, width: "100%" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
