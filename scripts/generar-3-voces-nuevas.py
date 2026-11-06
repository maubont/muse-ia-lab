import asyncio
import os
import shutil
import edge_tts
from gradio_client import Client

print("=== GENERANDO 3 VOCES NUEVAS CON ESPONTANEIDAD Y SENSUALIDAD ===")

out_dir = "next/landing/audio"
os.makedirs(out_dir, exist_ok=True)

# 1. VOZ 1: Salomé Espontánea con muletillas y pensamiento (mmmm, haaa sí, espera...)
texto_v1 = "Mmm... hola... espera, ¿sí? Déjame contarte algo... Ummm, el mercado de las modelos virtuales en Fanvue está creciendo durísimo. En nuestro taller te enseño todo el método por solo treinta y tres mil pesos. Haaa sí... dale, escríbeme y arrancamos hoy."

async def gen_v1():
    print("Generando Voz 1 (Espontánea con muletillas)...")
    c = edge_tts.Communicate(texto_v1, "es-CO-SalomeNeural", rate="-6%", pitch="-1Hz")
    dst = os.path.join(out_dir, "musa-v1-espontanea.mp3")
    await c.save(dst)
    print("[OK] Voz 1 generada:", dst)

asyncio.run(gen_v1())

# 2. VOZ 2: Dalia Sensual Íntima (susurrada, seductora, joven 20 años)
texto_v2 = "Heee... hola guapo. Oye, ¿sabías que las creadoras virtuales están facturando miles de dólares cada mes? En el taller de Musa te enseño paso a paso, por solo treinta y tres mil pesos colombianos. Ok, ok... escríbeme y empezamos."

async def gen_v2():
    print("Generando Voz 2 (Dalia Íntima)...")
    c = edge_tts.Communicate(texto_v2, "es-MX-DaliaNeural", rate="-5%", pitch="-2Hz")
    dst = os.path.join(out_dir, "musa-v2-dalia-intima.mp3")
    await c.save(dst)
    print("[OK] Voz 2 generada:", dst)

asyncio.run(gen_v2())

# 3. VOZ 3: Qwen3-TTS Exotic Sensual (VoiceDesign afinada para máxima sensualidad y respiración suave)
print("Generando Voz 3 (Qwen3-TTS Exotic Sensual)...")
try:
    qc = Client("Qwen/Qwen3-TTS")
    texto_v3 = "Ummm... hola. Si quieres tener tu propia modelo virtual y monetizarla desde cero, en Musa IA Lab te mostramos el paso a paso completo por solo treinta y tres mil pesos. Escríbeme ahora mismo."
    voice_desc = "Young 20-year-old woman with a soft, breathy, intimate, extremely sensual voice, gentle relaxed breathing, playful cadence, slightly exotic allure."
    res = qc.predict(
        text=texto_v3,
        language="Spanish",
        voice_description=voice_desc,
        api_name="/generate_voice_design"
    )
    audio_path, status = res
    dst = os.path.join(out_dir, "musa-v3-qwen-exotic.wav")
    shutil.copy(audio_path, dst)
    print("[OK] Voz 3 generada con Qwen3-TTS:", dst)
except Exception as e:
    print("Aviso Qwen3:", e)

print("Proceso de audio completado.")
