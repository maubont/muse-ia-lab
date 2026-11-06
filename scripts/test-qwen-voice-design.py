import os
import shutil
from gradio_client import Client

print("=== GENERANDO VOZ CON QWEN3-TTS VOICE DESIGN ===")
client = Client("Qwen/Qwen3-TTS")

texto = "Hola, soy Musa. El mercado de las modelos virtuales en Fanvue está creciendo cada día, y en nuestro taller vas a aprender el método completo por solo treinta y tres mil pesos colombianos. Escríbeme y empezamos hoy."
voice_desc = "Young 23-year-old Latina woman speaking Colombian Spanish. Very sensual, intimate, warm, confident, silky tone with soft natural breathing, seductive and welcoming."

print(f"Texto: {texto}")
print(f"Descripción de voz: {voice_desc}")

try:
    result = client.predict(
        text=texto,
        language="Spanish",
        voice_description=voice_desc,
        api_name="/generate_voice_design"
    )
    print("Respuesta recibida:", result)
    audio_path, status = result
    print("Audio generado en:", audio_path)
    print("Status:", status)
    
    out_dir = "creativos-revisar/audio"
    os.makedirs(out_dir, exist_ok=True)
    dst = os.path.join(out_dir, "musa-qwen3-voice-design.wav")
    shutil.copy(audio_path, dst)
    print(f"✓ Copiado exitosamente a: {dst}")

    # También copiar a landing para poder escuchar en el navegador
    landing_dst = "next/landing/audio/musa-qwen3-voice-design.wav"
    shutil.copy(audio_path, landing_dst)
    print(f"✓ Copiado a landing: {landing_dst}")

except Exception as e:
    print("Error:", e)
