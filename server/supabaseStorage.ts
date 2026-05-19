import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET = 'meals';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function uploadMealImage(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimetype, upsert: false });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

// Returns the image URL for a given filename — handles both legacy filenames and full URLs
export function resolveImageUrl(filename: string, serverBaseUrl: string): string {
  if (filename.startsWith('http')) return filename;
  if (filename === 'text-only') return '';
  return `${serverBaseUrl}/uploads/${filename}`;
}
