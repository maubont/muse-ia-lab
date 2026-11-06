"""
scripts/probar-qwen-tts-gradio.py
Conector directo a Qwen3-TTS (Alibaba Qwen) mediante Gradio Client para pruebas inmediatas sin descargar modelos pesados.

Requisitos:
  pip install gradio_client

Uso:
  python scripts/probar-qwen-tts-gradio.py --texto "Hola, soy Musa..." --modo design
"""

import sys
import os
import argparse

def main():
    parser = argparse.ArgumentParser(description="Cliente Qwen3-TTS para Musa IA Lab")
    parser.add_argument("--texto", type=str, default="El mercado de las modelos virtuales para Fanvue está facturando miles de dólares cada mes. El secreto es la consistencia y la textura real.")
    parser.add_argument("--instruccion", type=str, default="Voz femenina latina de 23 años, sensual, seductora, tono cálido y cercano, ritmo pausado con respiración suave.")
    parser.add_argument("--ref_audio", type=str, default="", help="Ruta de audio de referencia para clonación (3 a 10s)")
    parser.add_argument("--output", type=str, default="creativos-revisar/audio/qwen3-musa-test.wav")
    args = parser.parse_args()

    print("=" * 60)
    print("Conectando con el espacio oficial de Qwen3-TTS...")
    print(f"Texto: {args.texto}")
    print(f"Instrucción de voz: {args.instruccion}")
    print("=" * 60)

    try:
        from gradio_client import Client, handle_file
    except ImportError:
        print("Instalando gradio_client...")
        os.system("pip install gradio_client")
        from gradio_client import Client, handle_file

    client = Client("Qwen/Qwen3-TTS")

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    if args.ref_audio and os.path.exists(args.ref_audio):
        print(f"Modo: Clonación Zero-Shot con referencia: {args.ref_audio}")
        result = client.predict(
            ref_audio=handle_file(args.ref_audio),
            text=args.texto,
            language="Spanish",
            api_name="/clone_voice"
        )
    else:
        print("Modo: Diseño de Voz (VoiceDesign) por instrucción")
        result = client.predict(
            text=args.texto,
            prompt_voice=args.instruccion,
            language="Spanish",
            api_name="/generate_speech"
        )

    print("✓ Audio recibido:", result)
    import shutil
    shutil.copy(result, args.output)
    print(f"✓ Guardado exitosamente en: {args.output}")

if __name__ == "__main__":
    main()
