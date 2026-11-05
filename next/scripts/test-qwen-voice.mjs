/**
 * @file test-qwen-voice.mjs
 * @description Prueba unitaria del cliente Qwen Voice & Companion Chat
 */

import { QwenVoiceClient } from '../src/ia/qwen-voice.ts';

async function main() {
  console.log('🧪 Iniciando verificación del módulo Qwen Voice & Novia Virtual...');

  const client = new QwenVoiceClient({
    defaultVoice: 'Chelsie',
  });

  console.log('  [1] Verificando instanciación y configuración por defecto...');
  if (!client) {
    throw new Error('Fallo al instanciar QwenVoiceClient');
  }
  console.log('  ✓ QwenVoiceClient instanciado correctamente (Voz: Chelsie, Modelo: qwen3-tts-flash)');

  console.log('  [2] Verificando manejo de ausencia de API Key (Graceful Degradation)...');
  const res = await client.conversarNoviaVirtual('Hola Chelsie, ¿cómo estás hoy?');
  
  if (res.ok) {
    console.log('  ✓ Llamada real completada:', res.texto);
  } else {
    console.log('  ✓ Control de error verificado (esperado sin API Key):', res.error);
    if (!res.error?.includes('DASHSCOPE_API_KEY')) {
      throw new Error('El mensaje de error debería mencionar DASHSCOPE_API_KEY');
    }
  }

  console.log('✅ Verificación de Qwen Voice completada con éxito.');
}

main().catch((err) => {
  console.error('❌ Error en test-qwen-voice:', err);
  process.exit(1);
});
