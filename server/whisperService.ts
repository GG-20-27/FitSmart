/**
 * Minimal stub for Whisper audio transcription service.
 * This file is only meant to satisfy imports and prevent runtime failures.
 */

export const whisperService = {
  /**
   * Check if Whisper service is configured
   */
  isConfigured(): boolean {
    return false; // Minimal stub - always returns false
  },

  /**
   * Transcribe audio file to text
   * Accepts either a file path (string) or a buffer with optional filename
   */
  async transcribeAudio(filePathOrBuffer: string | Buffer, filename?: string): Promise<string> {
    console.warn("Whisper transcription is temporarily disabled.");
    return "Transcription unavailable.";
  }
};
  