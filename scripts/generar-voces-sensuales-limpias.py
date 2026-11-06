import asyncio
import os
import edge_tts

print("=== GENERANDO VOCES SENSUALES LIMPIAS Y NATURALES (SIN MULETILLAS FORZADAS) ===")

out_dir = "next/landing/audio"
os.makedirs(out_dir, exist_ok=True)

# Guion natural, íntimo y fluido para acompañar el creativo 9:16
texto_locucion = (
    "Hola... Qué bueno que estás aquí. "
    "Si estás viendo esto, es porque sabes que hoy las modelos creadas con inteligencia artificial "
    "están facturando en dólares... y no necesitas mostrar tu cara, ni tener experiencia previa. "
    "En el taller de Musa Estudio te enseño paso a paso cómo crear un personaje hiperrealista, "
    "con consistencia total, piel real y sin censura, por solo treinta y tres mil pesos colombianos. "
    "Toca el botón de aquí abajo y te paso todos los detalles por WhatsApp... Te espero adentro."
)

# 1. Salomé Neural (Colombia) - Voz natural, sensual, cadencia fluida colombiana
async def gen_salome():
    print("Generando Salomé Colombia Natural...")
    # Tasa ligeramente pausada e íntima (-4%), tono suave
    c = edge_tts.Communicate(texto_locucion, "es-CO-SalomeNeural", rate="-4%", pitch="-1Hz")
    dst = os.path.join(out_dir, "musa-v1-salome-limpia.mp3")
    await c.save(dst)
    print("[OK] Salomé generada:", dst)
    # También actualizar musa-v1-espontanea.mp3 para que el reproductor de la web la use de inmediato
    dst_main = os.path.join(out_dir, "musa-v1-espontanea.mp3")
    await edge_tts.Communicate(texto_locucion, "es-CO-SalomeNeural", rate="-4%", pitch="-1Hz").save(dst_main)
    print("[OK] musa-v1-espontanea.mp3 actualizada con locución limpia.")

# 2. Dalia Neural (Latina Íntima / Susurrada)
async def gen_dalia():
    print("Generando Dalia Latina Íntima...")
    c = edge_tts.Communicate(texto_locucion, "es-MX-DaliaNeural", rate="-5%", pitch="-2Hz")
    dst = os.path.join(out_dir, "musa-v2-dalia-intima.mp3")
    await c.save(dst)
    print("[OK] Dalia generada:", dst)

async def main():
    await gen_salome()
    await gen_dalia()
    print("Voces limpias generadas con éxito.")

asyncio.run(main())
