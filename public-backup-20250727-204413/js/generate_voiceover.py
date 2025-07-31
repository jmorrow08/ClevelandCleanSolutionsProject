import os
from google.cloud import texttospeech

# Initialize the client
# This automatically uses the GOOGLE_APPLICATION_CREDENTIALS you set
client = texttospeech.TextToSpeechClient()

# --- SCRIPT SEGMENT 1 ---
text_segment_1 = """
In an age of constant noise and information overload, many of us find ourselves grappling with profound questions. How do we find clarity? How do we align with our deepest selves amidst life's inherent complexities?
"""

# --- SCRIPT SEGMENT 2 ---
text_segment_2 = """
Introducing 'Klarity' – your private, AI co-pilot for profound self-discovery. It's not an advice-giver. It's a cognitive tool designed to help you navigate your own thoughts. Simply externalize your dilemma, and let the process begin.
"""

# --- SCRIPT SEGMENT 3 (Main Demo Walkthrough) ---
# This segment is longer and covers the core features as per our demo video plan.
text_segment_3 = """
But how does it provide real clarity? It does so by providing a cognitive scaffold. First, 'Deconstructive Insight' helps you reframe the problem, separating what you can control from what you can't. Next, 'Contextual Wisdom' broadens your perspective, showing how timeless philosophies might view your situation. Finally, 'Self-Alignment Guidance' uses metacognitive prompts to connect these insights back to your core values, guiding you toward your own authentic answer. This entire journey of introspection happens in a sanctuary of absolute privacy. Klarity is 100% local-first. Your data never leaves your device. And incredibly, this entire, fully functional application—its logic, its contemplative design, its privacy-by-design architecture—was brought to life from one single, unedited prompt to Bolt.new, showcasing the pinnacle of AI-driven development.
"""

# --- SCRIPT SEGMENT 4 (Conclusion & Call to Action) ---
# This is a new segment to keep the previous ones manageable and make the flow smoother for the final pitch.
text_segment_4 = """
Klarity: Augment your wisdom, not your data. Experience a new class of AI tool, built for genuine clarity. Thank you.
"""


# Function to synthesize speech
def synthesize_speech(text, filename, voice_name="en-US-Wavenet-D"):
    synthesis_input = texttospeech.SynthesisInput(text=text)

    # Select the type of voice and the language
    # Using a Wavenet voice for more natural sound. 'en-US-Wavenet-D' is a good male voice.
    # 'en-US-Wavenet-C' is a good female voice. You can experiment if you have a moment,
    # but 'Wavenet' is the key for quality.
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-US",
        name=voice_name, # Changed this to use the passed voice_name
        ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL  # Or FEMALE, MALE
    )

    # Select the type of audio file you want returned
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3
    )

    # Perform the text-to-speech request
    response = client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config
    )

    # Write the response to the output file
    with open(filename, "wb") as out:
        out.write(response.audio_content)
        print(f'Audio content written to "{filename}"')

# Generate each segment - I've updated the voice_name calls here to use Wavenet-D directly
synthesize_speech(text_segment_1, "klarity_voiceover_part1.mp3", voice_name="en-US-Wavenet-D")
synthesize_speech(text_segment_2, "klarity_voiceover_part2.mp3", voice_name="en-US-Wavenet-D")
synthesize_speech(text_segment_3, "klarity_voiceover_part3.mp3", voice_name="en-US-Wavenet-D")
synthesize_speech(text_segment_4, "klarity_voiceover_part4.mp3", voice_name="en-US-Wavenet-D")

print("\nAll audio segments generated. Combine them in your video editor.")