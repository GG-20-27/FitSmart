/**
 * Whisper audio transcription service using OpenAI Whisper API.
 */

export const whisperService = {
  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  },

  async transcribeAudio(filePathOrBuffer: string | Buffer, filename?: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    let buffer: Buffer;
    if (typeof filePathOrBuffer === 'string') {
      const fs = await import('fs/promises');
      buffer = await fs.readFile(filePathOrBuffer);
    } else {
      buffer = filePathOrBuffer;
    }

    const fname = filename || 'audio.m4a';

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: 'audio/m4a' }), fname);
    formData.append('model', 'whisper-1');

    console.log(`[WHISPER] Transcribing ${fname} (${buffer.length} bytes)`);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WHISPER] API error ${response.status}: ${errorText}`);
      throw new Error(`Whisper API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as { text: string };
    console.log(`[WHISPER] Transcription complete: "${data.text.slice(0, 80)}..."`);
    return data.text;
  },
};
