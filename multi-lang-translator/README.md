**gTTS is a Python library** that uses Google's Text-to-Speech API internally.

````markdown path=multi-lang-translator/README.md mode=EDIT
# Multi-Language AI Translator & Pronunciation Coach

## 🎯 Project Overview

**What We Built:**
A comprehensive translation app that translates text between languages and provides audio pronunciation. Users can type or speak in any language and get translations with proper audio output.

**Why We Built This:**
To create a free, reliable translation tool that works across multiple languages with voice capabilities for better language learning.

## 🧠 AI Models & Technologies Used

### 1. **Google Translate API** (Primary Translation Engine)
- **File:** `backend/app.py` - `translate_with_google_gender()`
- **Why Chosen:** 
  - FREE and reliable
  - Supports 100+ languages
  - Fast response times
  - High translation quality
- **Enhancement:** Added context for better translations in some languages

### 2. **Facebook M2M100 Model** (Backup Translation)
- **File:** `backend/app.py` - `translate_single_chunk()`
- **Model:** `facebook/m2m-100_418M`
- **Why Chosen:**
  - Works offline
  - Good fallback when Google Translate fails
  - Supports 100 languages
  - Free to use

### 3. **gTTS Library** (Text-to-Speech)
- **File:** `backend/app.py` - `generate_gtts_audio()`
- **What it is:** Python library that uses Google's TTS API
- **Why Chosen:**
  - FREE and high-quality voices
  - Supports multiple languages
  - Natural pronunciation
  - Easy integration

### 4. **Edge TTS** (Enhanced Audio)
- **File:** `backend/app.py` - `generate_edge_tts()`
- **What it is:** Microsoft's Text-to-Speech engine
- **Why Added:**
  - Better voice quality
  - More natural sounding
  - Gender-specific voices
  - Free alternative

### 5. **Web Speech API** (Speech Recognition)
- **File:** `frontend/src/components/TranslatorApp.jsx`
- **What it is:** Browser-built speech recognition
- **Why Chosen:**
  - Built into browsers (FREE)
  - Real-time speech recognition
  - No API keys needed
  - Multiple language support

## 🔧 Key Technical Solutions

### Dual Translation System
**Problem:** Single translation engine might fail
**Solution:** Google Translate as primary, M2M100 as backup

### Dual Audio System  
**Problem:** Need better voice quality
**Solution:** Edge TTS as primary, gTTS as fallback

### Memory Management
**Problem:** Large AI models consume memory
**Solution:** Automatic cleanup after each translation

## 🏗️ Architecture

### Frontend: React + Vite
- Component-based UI
- Real-time translation
- Voice input/output

### Backend: Python + Flask
- Multiple translation engines
- Audio generation
- Memory optimization

## 🎯 Model Performance

| Technology | Speed | Quality | Cost | Languages |
|------------|-------|---------|------|-----------|
| Google Translate | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | FREE | 100+ |
| M2M100 | ⭐⭐⭐ | ⭐⭐⭐⭐ | FREE | 100 |
| Edge TTS | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | FREE | 80+ |
| gTTS | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | FREE | 60+ |

## 🚀 Key Features

1. **Multi-Language Support:** English, Hindi, Urdu, Nepali, Punjabi, Bengali
2. **Voice Input/Output:** Speech-to-text and text-to-speech
3. **Fallback System:** Multiple engines for reliability
4. **Free to Use:** No API keys required
5. **Real-time Translation:** Fast response times

## 🎉 Why This Works

**Completely Free:** Uses only free APIs and models
**Reliable:** Multiple fallback systems
**Fast:** Optimized for quick responses
**User-Friendly:** Simple voice-enabled interface
**Scalable:** Easy to add new languages

This demonstrates effective combination of free AI tools for practical language translation.
````

// To run
// cd multi-lang-translator
// cd backend
//backend_env/Scripts/activate    
// python app.py

// cd frontend
// npm run dev