"""
scripts/generar-video-veo2.py
Generación de Video de Frontera con Google DeepMind Veo 2 (veo-2.0-generate-001)

Requisitos:
  pip install google-genai
  export GEMINI_API_KEY="tu-api-key"

Uso:
  python scripts/generar-video-veo2.py --prompt "sensual" --output "creativos-revisar/videos/veo2-escena.mp4"
"""

import os
import sys
import time
import argparse

def main():
    parser = argparse.ArgumentParser(description="Generador de video Veo 2 de Google DeepMind")
    parser.add_argument("--prompt", type=str, default="A candid handheld smartphone video of a stunning 23-year-old Latina creator in a modern luxury apartment, looking at the camera with a warm seductive smile, natural skin pores, 35mm f/1.4 lens, natural sunlight, cinematic realism, 9:16 aspect ratio.")
    parser.add_argument("--output", type=str, default="creativos-revisar/videos/veo2-master.mp4")
    parser.add_argument("--aspect_ratio", type=str, default="9:16")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: Debe configurar la variable de entorno GEMINI_API_KEY con acceso al modelo Veo 2.")
        print("Obtenga su clave en: https://aistudio.google.com/app/api-keys")
        sys.exit(1)

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("Instalando SDK oficial google-genai...")
        os.system("pip install google-genai")
        from google import genai
        from google.genai import types

    client = genai.Client(api_key=api_key)
    print("=" * 60)
    print("Iniciando solicitud a Google Veo 2 (veo-2.0-generate-001)...")
    print(f"Prompt: {args.prompt}")
    print(f"Aspect Ratio: {args.aspect_ratio}")
    print("=" * 60)

    operation = client.models.generate_videos(
        model="veo-2.0-generate-001",
        prompt=args.prompt,
        config=types.GenerateVideosConfig(
            aspect_ratio=args.aspect_ratio,
            person_generation="allow_adult",
            number_of_videos=1
        ),
    )

    print("Esperando renderizado en cluster de GPU de Google DeepMind (toma aprox 60-90 segundos)...")
    while not operation.done:
        time.sleep(10)
        operation = client.operations.get(operation)
        print(".", end="", flush=True)

    print("\n¡Generación completada con éxito!")
    if operation.response and operation.response.generated_videos:
        video_result = operation.response.generated_videos[0]
        video_uri = video_result.video.uri
        print(f"Descargando video desde URI de DeepMind: {video_uri}")
        # Descargar y guardar
        import urllib.request
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        urllib.request.urlretrieve(video_uri, args.output)
        print(f"✓ Video guardado en: {args.output}")
    else:
        print("Error: La respuesta de Veo 2 no contiene video generado.")
        sys.exit(1)

if __name__ == "__main__":
    main()
