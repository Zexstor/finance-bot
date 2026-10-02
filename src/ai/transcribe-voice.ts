import { toFile } from 'openai';
import { openai } from './client.js';

export async function transcribeVoice(audio: Buffer): Promise<string> {
  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(audio, 'voice.ogg'),
    model: 'gpt-4o-transcribe',
  });

  return transcription.text;
}
