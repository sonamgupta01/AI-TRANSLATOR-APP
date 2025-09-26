from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from gtts import gTTS
import io
import base64
import torch
import gc
import asyncio
import edge_tts
import openai
import os


# Install: pip install googletrans==4.0.0rc1
from googletrans import Translator
from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Set OpenAI API key (you need to set this environment variable)
openai.api_key = os.getenv('OPENAI_API_KEY')

# Load translation model lazily (this will download ~2GB on first run)
model = None
tokenizer = None

def load_translation_model():
    global model, tokenizer
    if model is None:
        print("Loading M2M100 model...")
        from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer
        model_name = "facebook/m2m100_418M"
        model = M2M100ForConditionalGeneration.from_pretrained(model_name)
        tokenizer = M2M100Tokenizer.from_pretrained(model_name)

        if torch.cuda.is_available():
            print("CUDA available - using GPU")
            model = model.to('cuda')
        else:
            print("Using CPU - consider using smaller text chunks")

def cleanup_memory():
    """Clean up GPU/CPU memory"""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    gc.collect()

def adjust_grammatical_gender(text, target_lang, speaker_gender):
    """Adjust translation based on speaker's gender for languages that need it"""
    
    print(f"Adjusting grammar: {speaker_gender} speaker for {target_lang}")
    
    # Languages that have grammatical gender differences
    gender_sensitive_langs = ['hi', 'ur', 'ne', 'bn', 'gu', 'mr', 'pa']
    
    if target_lang not in gender_sensitive_langs:
        print(f"INFO: {target_lang} doesn't need gender adjustment")
        return text
    
    # Enhanced gender-based replacements for Hindi/Urdu
    if target_lang in ['hi', 'ur']:
        if speaker_gender == 'male':
            replacements = {
                # Present continuous (रहा/रही)
                'रही': 'रहा', 'रहीं': 'रहे',
                # Verb endings
                'करती': 'करता', 'जाती': 'जाता', 'आती': 'आता', 'खाती': 'खाता',
                'पीती': 'पीता', 'सोती': 'सोता', 'बोलती': 'बोलता', 'देती': 'देता',
                'लेती': 'लेता', 'चलती': 'चलता', 'पढ़ती': 'पढ़ता', 'लिखती': 'लिखता',
                'होती': 'होता', 'कहती': 'कहता', 'सुनती': 'सुनता', 'देखती': 'देखता',
                # Past tense
                'गई': 'गया', 'आई': 'आया', 'की': 'किया'
            }
            print(f"SUCCESS: Applied {len(replacements)} male grammar rules")
        else:  # female
            replacements = {
                # Present continuous (रहा/रही)
                'रहा': 'रही', 'रहे': 'रहीं',
                # Verb endings
                'करता': 'करती', 'जाता': 'जाती', 'आता': 'आती', 'खाता': 'खाती',
                'पीता': 'पीती', 'सोता': 'सोती', 'बोलता': 'बोलती', 'देता': 'देती',
                'लेता': 'लेती', 'चलता': 'चलती', 'पढ़ता': 'पढ़ती', 'लिखता': 'लिखती',
                'होता': 'होती', 'कहता': 'कहती', 'सुनता': 'सुनती', 'देखता': 'देखती',
                # Past tense
                'गया': 'गई', 'आया': 'आई', 'किया': 'की'
            }
            print(f"SUCCESS: Applied {len(replacements)} female grammar rules")
        
        original_text = text
        for old, new in replacements.items():
            text = text.replace(old, new)
        
        if text != original_text:
            print(f"INFO: Grammar changed: '{original_text}' -> '{text}'")
    
    # Enhanced Punjabi gender rules
    elif target_lang == 'pa':
        if speaker_gender == 'male':
            replacements = {
                'ਕਰਦੀ': 'ਕਰਦਾ', 'ਜਾਂਦੀ': 'ਜਾਂਦਾ', 'ਆਉਂਦੀ': 'ਆਉਂਦਾ',
                'ਰਹੀ': 'ਰਿਹਾ', 'ਹੈ': 'ਹੈ'
            }
        else:  # female
            replacements = {
                'ਕਰਦਾ': 'ਕਰਦੀ', 'ਜਾਂਦਾ': 'ਜਾਂਦੀ', 'ਆਉਂਦਾ': 'ਆਉਂਦੀ',
                'ਰਿਹਾ': 'ਰਹੀ'
            }
        
        for old, new in replacements.items():
            text = text.replace(old, new)
    
    # Enhanced Nepali gender rules
    elif target_lang == 'ne':
        if speaker_gender == 'male':
            replacements = {
                'छिन्': 'छु', 'छिन्न्': 'छु', 'छी': 'छु',
                'गर्छिन्': 'गर्छु', 'हुन्छिन्': 'हुन्छु'
            }
        else:  # female
            replacements = {
                'छु': 'छिन्', 'छ': 'छिन्', 'गर्छु': 'गर्छिन्',
                'हुन्छु': 'हुन्छिन्'
            }
        
        for old, new in replacements.items():
            text = text.replace(old, new)
    
    # Bengali gender rules
    elif target_lang == 'bn':
        if speaker_gender == 'male':
            replacements = {
                'করছি': 'করছি', 'যাচ্ছি': 'যাচ্ছি'  # Bengali has less gender distinction
            }
        else:
            replacements = {}
        
        for old, new in replacements.items():
            text = text.replace(old, new)
    
    return text

def get_ai_explanation(message, skill_topic, user_role):
    """Get AI explanation for teaching context"""
    try:
        prompt = f"""
        You are an AI mediator in a peer teaching session. One user is teaching {skill_topic} to another.
        The {user_role} just said: "{message}"

        Provide a helpful explanation or mediation that:
        - Clarifies any confusion
        - Suggests next steps for teaching/learning
        - Translates complex concepts into simpler terms
        - Encourages effective communication

        Keep your response concise (2-3 sentences) and supportive.
        """

        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"AI explanation error: {e}")
        return None

@socketio.on('join_room')
def handle_join_room(data):
    room = data['room']
    username = data['username']
    join_room(room)
    emit('user_joined', {'username': username}, room=room)

@socketio.on('send_message')
def handle_send_message(data):
    room = data['room']
    message = data['message']
    username = data['username']
    user_lang = data.get('user_lang', 'en')
    target_lang = data.get('target_lang', 'en')
    skill_topic = data.get('skill_topic', 'general')
    user_role = data.get('user_role', 'learner')

    # Translate message if languages are different
    translated_message = message
    if user_lang != target_lang:
        try:
            translated_message = translate_text(message, user_lang, target_lang)
        except Exception as e:
            print(f"Translation failed for chat: {e}")

    emit('receive_message', {
        'username': username,
        'message': message,
        'translated_message': translated_message,
        'original_lang': user_lang,
        'target_lang': target_lang,
        'timestamp': data.get('timestamp')
    }, room=room)

    # Get AI explanation (disabled due to quota limits)
    # try:
    #     ai_explanation = get_ai_explanation(message, skill_topic, user_role)
    #     if ai_explanation:
    #         emit('ai_message', {
    #             'message': ai_explanation,
    #             'type': 'explanation'
    #         }, room=room)
    # except Exception as e:
    #     print(f"AI explanation skipped: {e}")
    pass  # AI explanations disabled due to quota

@socketio.on('request_explanation')
def handle_request_explanation(data):
    room = data['room']
    topic = data['topic']
    context = data['context']

    prompt = f"Explain {topic} in simple terms. Context: {context}"

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200
        )
        explanation = response.choices[0].message.content.strip()
        emit('ai_message', {
            'message': explanation,
            'type': 'explanation'
        }, room=room)
    except Exception as e:
        print(f"AI explanation error: {e}")

def romanize_text(text, target_lang):
    """Romanize text for pronunciation help"""
    try:
        # Languages that support romanization
        romanizable_langs = {
            'hi': 'devanagari',
            'bn': 'bengali',
            'te': 'telugu',
            'ta': 'tamil',
            'ml': 'malayalam',
            'gu': 'gujarati',
            'kn': 'kannada',
            'mr': 'devanagari',
            'pa': 'gurmukhi',
            'ur': 'urdu',
            'ne': 'devanagari',
            'or': 'oriya',
            'as': 'assamese',
            'mai': 'devanagari',
            'bho': 'devanagari',
            'awa': 'devanagari',
            'mag': 'devanagari',
            'hne': 'devanagari',
            'doi': 'devanagari'
        }

        if target_lang not in romanizable_langs:
            return None

        script = romanizable_langs[target_lang]
        romanized = transliterate(text, script, sanscript.ITRANS)
        return romanized

    except Exception as e:
        print(f"ERROR: Romanization failed for {target_lang}: {e}")
        return None

def translate_text(text, source_lang, target_lang, speaker_gender='female'):
    """Translate text with gender context"""
    try:
        # Try Google Translate first (BEST OPTION)
        translator = Translator()
        result = translator.translate(text, src=source_lang, dest=target_lang)
        translated = result.text

        # Apply gender adjustments only for specific languages
        if target_lang in ['hi', 'ur', 'ne', 'pa']:
            translated = adjust_grammatical_gender(translated, target_lang, speaker_gender)

        return translated

    except Exception as e:
        print(f"ERROR: Google Translate failed: {e}")
        # Try a simple fallback translation using basic mappings for common cases
        if source_lang == 'en' and target_lang == 'hi':
            # Very basic English to Hindi fallback
            basic_translations = {
                'hello': 'नमस्ते',
                'thank you': 'धन्यवाद',
                'please': 'कृपया',
                'yes': 'हाँ',
                'no': 'नहीं',
                'good': 'अच्छा',
                'bad': 'खराब',
                'how are you': 'आप कैसे हैं',
                'i am fine': 'मैं ठीक हूँ',
                'what': 'क्या',
                'where': 'कहाँ',
                'when': 'कब',
                'why': 'क्यों',
                'how': 'कैसे'
            }
            lower_text = text.lower().strip()
            if lower_text in basic_translations:
                return basic_translations[lower_text]
            else:
                # Return original text marked as untranslated
                return f"[Translation unavailable] {text}"

        # For other language pairs, return original text
        return f"[Translation unavailable] {text}"

def translate_single_chunk(text, source_lang, target_lang, speaker_gender='female'):
    """Translate a single chunk of text with optimized speed"""
    try:
        # Load model if not loaded
        load_translation_model()

        lang_codes = {
            'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
            'ru': 'ru', 'ja': 'ja', 'ko': 'ko', 'zh': 'zh', 'ar': 'ar', 'tr': 'tr',
            'hi': 'hi', 'bn': 'bn', 'te': 'te', 'ta': 'ta', 'ml': 'ml', 'gu': 'gu',
            'kn': 'kn', 'mr': 'mr', 'ur': 'ur', 'ne': 'ne', 'pa': 'pa',
            'pl': 'pl', 'nl': 'nl', 'sv': 'sv'
        }
        
        source_code = lang_codes.get(source_lang, 'en')
        target_code = lang_codes.get(target_lang, 'hi')
        
        print(f"Translating: '{text[:30]}...' {source_code}->{target_code}")
        
        # OPTIMIZED: Faster tokenization and generation
        tokenizer.src_lang = source_code
        encoded = tokenizer(text, return_tensors="pt", max_length=128, truncation=True, padding=False)
        
        # Move to GPU if available
        if torch.cuda.is_available():
            encoded = {k: v.to('cuda') for k, v in encoded.items()}
        
        # MUCH FASTER generation parameters
        with torch.no_grad():  # Disable gradient computation for speed
            generated_tokens = model.generate(
                **encoded, 
                forced_bos_token_id=tokenizer.get_lang_id(target_code),
                max_length=150,      # Reduced from 300
                num_beams=1,         # Reduced from 3 (greedy search - fastest)
                do_sample=False,     # No sampling for speed
                early_stopping=True,
                pad_token_id=tokenizer.pad_token_id,
                use_cache=True       # Enable caching
            )
        
        translated = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        translated = adjust_grammatical_gender(translated, target_lang, speaker_gender)
        
        print(f"SUCCESS: Translated: '{translated[:30]}...'")
        return translated
        
    except Exception as e:
        print(f"Translation error: {e}")
        return f"[Error: {str(e)}]"

async def generate_edge_tts(text, target_lang, gender):
    """Generate TTS using Microsoft Edge TTS with proper male/female voices"""
    try:
        print(f"INFO: Edge TTS called: lang={target_lang}, gender={gender}")
        
        # COMPREHENSIVE Voice mapping for ALL languages
        voice_map = {
            'en': {'male': 'en-US-BrianNeural', 'female': 'en-US-JennyNeural'},
            'hi': {'male': 'hi-IN-MadhurNeural', 'female': 'hi-IN-SwaraNeural'},
            'bn': {'male': 'bn-BD-PradeepNeural', 'female': 'bn-BD-NabanitaNeural'},
            'es': {'male': 'es-ES-AlvaroNeural', 'female': 'es-ES-ElviraNeural'},
            'fr': {'male': 'fr-FR-HenriNeural', 'female': 'fr-FR-DeniseNeural'},
            'de': {'male': 'de-DE-ConradNeural', 'female': 'de-DE-KatjaNeural'},
            'it': {'male': 'it-IT-DiegoNeural', 'female': 'it-IT-ElsaNeural'},
            'pt': {'male': 'pt-BR-AntonioNeural', 'female': 'pt-BR-FranciscaNeural'},
            'ru': {'male': 'ru-RU-DmitryNeural', 'female': 'ru-RU-SvetlanaNeural'},
            'ja': {'male': 'ja-JP-KeitaNeural', 'female': 'ja-JP-NanamiNeural'},
            'ko': {'male': 'ko-KR-InJoonNeural', 'female': 'ko-KR-SunHiNeural'},
            'zh': {'male': 'zh-CN-YunxiNeural', 'female': 'zh-CN-XiaoxiaoNeural'},
            'ar': {'male': 'ar-SA-HamedNeural', 'female': 'ar-SA-ZariyahNeural'},
            'tr': {'male': 'tr-TR-AhmetNeural', 'female': 'tr-TR-EmelNeural'},
            'ur': {'male': 'ur-PK-AsadNeural', 'female': 'ur-PK-UzmaNeural'},
            'ne': {'male': 'ne-NP-SagarNeural', 'female': 'ne-NP-HemkalaNeural'},
            'pa': {'male': 'pa-IN-GaganNeural', 'female': 'pa-IN-HarpreetNeural'},
            'gu': {'male': 'gu-IN-NiranjanNeural', 'female': 'gu-IN-DhwaniNeural'},
            'mr': {'male': 'mr-IN-ManoharNeural', 'female': 'mr-IN-AarohiNeural'},
            'ta': {'male': 'ta-IN-ValluvarNeural', 'female': 'ta-IN-PallaviNeural'},
            'te': {'male': 'te-IN-MohanNeural', 'female': 'te-IN-ShrutiNeural'},
            'ml': {'male': 'ml-IN-MidhunNeural', 'female': 'ml-IN-SobhanaNeural'},
            'kn': {'male': 'kn-IN-GaganNeural', 'female': 'kn-IN-SapnaNeural'},
            'pl': {'male': 'pl-PL-MarekNeural', 'female': 'pl-PL-ZofiaNeural'},
            'nl': {'male': 'nl-NL-MaartenNeural', 'female': 'nl-NL-ColetteNeural'},
            'sv': {'male': 'sv-SE-MattiasNeural', 'female': 'sv-SE-SofieNeural'}
        }
        
        # Get voice for language and gender
        voice = voice_map.get(target_lang, {}).get(gender, 'en-US-JennyNeural')
        
        print(f"INFO: Using Edge TTS voice for {target_lang}-{gender}")
        
        # Generate speech
        communicate = edge_tts.Communicate(text, voice)
        
        # Save to memory
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        if not audio_data:
            print("ERROR: No audio data received from Edge TTS")
            return None
        
        print(f"SUCCESS: Edge TTS generated {len(audio_data)} bytes")
        
        # Convert to base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        return f"data:audio/mp3;base64,{audio_base64}"
        
    except Exception as e:
        print(f"ERROR: Edge TTS error for {target_lang}: {e}")
        return None

def generate_tts_stream(text, target_lang, gender='female'):
    """Generate TTS with proper error handling"""
    try:
        print(f"INFO: TTS Request: lang={target_lang}, gender={gender}")
        
        # Try Edge TTS first
        try:
            # Fix event loop issue
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            result = loop.run_until_complete(generate_edge_tts(text, target_lang, gender))
            
            if result:
                print(f"SUCCESS: Edge TTS SUCCESS")
                return result
                
        except Exception as e:
            print(f"WARNING: Edge TTS failed: {e}")
        
        # Always fallback to gTTS
        print(f"INFO: Using gTTS fallback for {target_lang}")
        return generate_gtts_audio(text, target_lang, gender)
            
    except Exception as e:
        print(f"ERROR: All TTS failed for {target_lang}: {e}")
        return None

def generate_gtts_audio(text, target_lang, gender):
    """Generate TTS audio with gTTS - FIXED for all languages"""
    try:
        print(f"INFO: gTTS generating for {target_lang}: '{text[:30]}...'")
        
        # Enhanced TLD mapping for better voices
        tld_map = {
            'en': {'male': 'com.au', 'female': 'co.uk'},
            'hi': {'male': 'co.in', 'female': 'co.in'},
            'bn': {'male': 'com.bd', 'female': 'com.bd'},
            'ne': {'male': 'com.np', 'female': 'com.np'},
            'es': {'male': 'com.mx', 'female': 'es'},
            'fr': {'male': 'ca', 'female': 'fr'},
            'de': {'male': 'de', 'female': 'at'},
            'it': {'male': 'it', 'female': 'it'},
            'pt': {'male': 'com.br', 'female': 'pt'},
            'ru': {'male': 'ru', 'female': 'ru'},
            'ja': {'male': 'co.jp', 'female': 'co.jp'},
            'ko': {'male': 'co.kr', 'female': 'co.kr'},
            'zh': {'male': 'com.tw', 'female': 'com.hk'},
            'ar': {'male': 'com.sa', 'female': 'ae'},
            'tr': {'male': 'com.tr', 'female': 'com.tr'},
            'ur': {'male': 'com.pk', 'female': 'com.pk'},
            'ta': {'male': 'co.in', 'female': 'co.in'},
            'te': {'male': 'co.in', 'female': 'co.in'},
            'ml': {'male': 'co.in', 'female': 'co.in'},
            'gu': {'male': 'co.in', 'female': 'co.in'},
            'kn': {'male': 'co.in', 'female': 'co.in'},
            'mr': {'male': 'co.in', 'female': 'co.in'},
            'pa': {'male': 'co.in', 'female': 'co.in'},
            'pl': {'male': 'pl', 'female': 'pl'},
            'nl': {'male': 'nl', 'female': 'nl'},
            'sv': {'male': 'se', 'female': 'se'}
        }
        
        # Get appropriate TLD for gender
        tld = tld_map.get(target_lang, {}).get(gender, 'com')
        
        print(f"INFO: gTTS: {target_lang} with {gender} voice")
        
        # Create TTS with gender-specific settings
        if gender == 'male':
            tts = gTTS(text=text, lang=target_lang, slow=True, tld=tld)
        else:
            tts = gTTS(text=text, lang=target_lang, slow=False, tld=tld)
        
        # Save to memory buffer
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        
        # Convert to base64
        audio_base64 = base64.b64encode(audio_buffer.read()).decode('utf-8')
        
        print(f"SUCCESS: gTTS SUCCESS for {target_lang}")
        return f"data:audio/mp3;base64,{audio_base64}"
        
    except Exception as e:
        print(f"ERROR: gTTS error for {target_lang}: {e}")
        return None

def translate_with_google_gender(text, source_lang, target_lang, speaker_gender):
    """Use Google Translate with gender context - FREE"""
    try:
        print(f"INFO: Google Translate: '{text[:30]}...' {source_lang} -> {target_lang}")
        translator = Translator()
        
        # Simple translation without complex context for reliability
        result = translator.translate(text, src=source_lang, dest=target_lang)
        
        translated = result.text
        print(f"SUCCESS: Google Translate result: '{translated[:50]}...'")
        
        # Apply gender adjustments only for specific languages
        if target_lang in ['hi', 'ur', 'ne', 'pa']:
            translated = adjust_grammatical_gender(translated, target_lang, speaker_gender)
        
        return translated
        
    except Exception as e:
        print(f"ERROR: Google Translate error: {e}")
        raise e  # Re-raise to trigger fallback

@app.route('/translate', methods=['POST'])
def translate():
    try:
        data = request.get_json()
        print(f"INFO: Received request: {data}")
        
        if not data or 'text' not in data:
            return jsonify({"error": "No text provided"}), 400
            
        text = data['text'].strip()
        if not text:
            return jsonify({"error": "Empty text"}), 400
            
        source_lang = data.get('source_lang', 'en')
        target_lang = data.get('target_lang', 'hi')
        tts_required = data.get('tts', False)
        speaker_gender = data.get('speaker_gender', 'female')
        voice_gender = data.get('voice_gender', 'female')

        print(f"INFO: Processing: '{text}' | {source_lang} -> {target_lang} | TTS: {tts_required}")
        
        # Translate text
        translated_text = translate_text(text, source_lang, target_lang, speaker_gender)

        if not translated_text:
            return jsonify({"error": "Translation failed"}), 500

        cleanup_memory()

        # Generate romanized text for pronunciation help
        romanized_text = None
        try:
            romanized_text = romanize_text(translated_text, target_lang)
        except Exception as e:
            print(f"WARNING: Romanization failed: {e}")

        # Generate TTS for target language
        audio_url = None
        if tts_required:
            try:
                print(f"INFO: Generating TTS for text in {target_lang} with {voice_gender} voice")
                audio_url = generate_tts_stream(translated_text, target_lang, voice_gender)
                if audio_url:
                    print(f"SUCCESS: TTS generated, URL length: {len(audio_url)}")
                else:
                    print(f"WARNING: TTS returned None")
            except Exception as e:
                print(f"ERROR: TTS generation failed: {e}")
                import traceback
                traceback.print_exc()

        response = {
            "translated_text": translated_text,
            "romanized_text": romanized_text,
            "audio_url": audio_url,
            "source_lang": source_lang,
            "target_lang": target_lang
        }
        
        print(f"SUCCESS: Response ready (translated_text length: {len(response.get('translated_text', ''))})")
        return jsonify(response)
        
    except Exception as e:
        print(f"ERROR: API error occurred")
        cleanup_memory()
        return jsonify({"error": "Translation service temporarily unavailable"}), 500

if __name__ == '__main__':
    print("Flask-SocketIO server starting on http://localhost:5000")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)

