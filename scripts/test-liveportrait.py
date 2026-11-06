import os
import shutil
from gradio_client import Client, handle_file

print("=== ANIMANDO RETRATO CORTO CON LIVEPORTRAIT ===")
client = Client("KlingTeam/LivePortrait")

source_img = "creativos-revisar/cand-samples/source-short.jpg"
driving_vid = "creativos-revisar/cand-samples/driver-short.mp4"

try:
    result = client.predict(
        param_0=handle_file(source_img),
        param_1={"video": handle_file(driving_vid)},
        param_2=True,
        param_3=True,
        param_4=True,
        api_name="/gpu_wrapped_execute_video"
    )
    print("Respuesta:", result)
    out_vid = result[0].get("video") if isinstance(result[0], dict) else result[0]
    dst = "creativos-revisar/cand-samples/liveportrait-result-2s.mp4"
    shutil.copy(out_vid, dst)
    print(f"Guardado exitosamente en: {dst}")

except Exception as e:
    print("Error:", e)
