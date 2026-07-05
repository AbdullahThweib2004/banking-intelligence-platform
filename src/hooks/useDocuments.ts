import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Row shape for the public.documents table in Supabase. */
export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  file_path: string | null;
  size: string | null;
  status: string;
  upload_date: string | null;
  user_id: string | null;
  confidence: number | null;
  extracted_fields: number | null;
  created_at: string;
  updated_at: string;
}

export type DocumentInsert = {
  name: string;
  type: string;
  file_path?: string | null;
  size?: string | null;
  status: string;
  upload_date?: string | null;
  user_id: string;
  confidence?: number | null;
  extracted_fields?: number | null;
};

const DOCUMENTS_SELECT =
  'id,name,type,file_path,size,status,upload_date,user_id,confidence,extracted_fields,created_at,updated_at';

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENTS_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DocumentRecord[];
}

export async function insertDocument(row: DocumentInsert): Promise<DocumentRecord | null> {
  const { data, error } = await supabase
    .from('documents')
    .insert(row)
    .select(DOCUMENTS_SELECT)
    .single();

  if (error) throw error;
  return data as DocumentRecord;
}

export function formatDocumentDate(record: DocumentRecord, locale: string): string {
  const raw = record.upload_date ?? record.created_at;
  if (!raw) return '—';
  const date = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(locale === 'ar' ? 'ar-PS' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Normalize DB confidence to 0–100 for display. */
export function confidenceToPercent(confidence: number | null | undefined): number | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  return confidence <= 1 ? Math.round(confidence * 1000) / 10 : confidence;
}

export function formatConfidence(confidence: number | null | undefined): string {
  const pct = confidenceToPercent(confidence);
  return pct == null ? '—' : `${pct.toFixed(1)}%`;
}

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchDocuments();
      setDocuments(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Enable Realtime for public.documents in Supabase Dashboard → Database →
    // Replication, or postgres_changes will not fire.
    const channel = supabase
      .channel('documents-table-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'documents' },
        (payload) => {
          const row = payload.new as DocumentRecord;
          setDocuments((prev) => {
            if (prev.some((d) => d.id === row.id)) return prev;
            return [row, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'documents' },
        (payload) => {
          const row = payload.new as DocumentRecord;
          setDocuments((prev) => prev.map((d) => (d.id === row.id ? row : d)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const upsertLocal = useCallback((row: DocumentRecord) => {
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.id === row.id);
      if (idx === -1) return [row, ...prev];
      const next = [...prev];
      next[idx] = row;
      return next;
    });
  }, []);

  return { documents, loading, error, reload: load, upsertLocal };
}

export function docTypeIconKey(type: string): 'pdf' | 'image' | 'excel' | 'other' {
  const t = type.toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('image') || t.includes('jpg') || t.includes('png')) return 'image';
  if (t.includes('excel') || t.includes('xlsx') || t.includes('sheet')) return 'excel';
  return 'other';
}
