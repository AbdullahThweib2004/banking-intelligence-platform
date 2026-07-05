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
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'documents' },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (!deletedId) return;
          setDocuments((prev) => prev.filter((d) => d.id !== deletedId));
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

  const removeLocal = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { documents, loading, error, reload: load, upsertLocal, removeLocal };
}

export function docTypeIconKey(type: string): 'pdf' | 'image' | 'excel' | 'other' {
  const t = type.toLowerCase();
  if (t.includes('pdf')) return 'pdf';
  if (t.includes('image') || t.includes('jpg') || t.includes('png')) return 'image';
  if (t.includes('excel') || t.includes('xlsx') || t.includes('sheet')) return 'excel';
  return 'other';
}

const DOCUMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_DOCUMENTS_BUCKET as string | undefined)?.trim() || 'documents';

const INTERNAL_DOC_ID = /^doc_[a-f0-9]+$/i;

function parseStoragePath(filePath: string): { bucket: string; objectPath: string } {
  let bucket = DOCUMENTS_BUCKET;
  let objectPath = filePath;

  if (filePath.includes('/')) {
    const [first, ...rest] = filePath.split('/');
    if (rest.length > 0 && first && !first.includes('.')) {
      bucket = first;
      objectPath = rest.join('/');
    }
  }

  return { bucket, objectPath };
}

/** Upload a file blob to Supabase Storage; returns the object path stored in file_path. */
export async function uploadDocumentToStorage(
  userId: string,
  file: Blob,
  filename: string,
  contentType?: string
): Promise<string> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'document';
  const objectPath = `${userId}/${crypto.randomUUID()}/${safeName}`;

  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(objectPath, file, {
    contentType: contentType || file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) throw error;
  return objectPath;
}

/** Resolve a viewable URL from file_path (absolute URL or Supabase Storage object path). */
export async function resolveDocumentViewUrl(filePath: string): Promise<string> {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error('No file path on this document.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (INTERNAL_DOC_ID.test(trimmed)) {
    throw new Error('INTERNAL_DOC_ID');
  }

  const { bucket, objectPath } = parseStoragePath(trimmed);

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, 60 * 60);

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Could not open file from storage.');
  }

  return data.signedUrl;
}

export type DocumentViewSource = 'url' | 'blob';

export interface DocumentViewTarget {
  url: string;
  source: DocumentViewSource;
}

/**
 * Resolve how to open a document row: storage signed URL, direct URL, or backend PDF blob.
 */
export async function resolveDocumentForView(
  doc: DocumentRecord,
  fetchBackendPdf?: (documentId: string) => Promise<Blob>
): Promise<DocumentViewTarget> {
  const path = doc.file_path?.trim();
  if (!path) {
    throw new Error('No file is attached to this document.');
  }

  if (/^https?:\/\//i.test(path)) {
    return { url: path, source: 'url' };
  }

  if (INTERNAL_DOC_ID.test(path)) {
    if (fetchBackendPdf) {
      try {
        const blob = await fetchBackendPdf(path);
        return { url: URL.createObjectURL(blob), source: 'blob' };
      } catch {
        // Fall through to user-friendly error below.
      }
    }
    throw new Error(
      'This document was saved before file storage was enabled and the PDF is no longer on the server. ' +
        'Complete a new account opening to save a viewable copy.'
    );
  }

  const signedUrl = await resolveDocumentViewUrl(path);
  return { url: signedUrl, source: 'url' };
}

export async function deleteDocumentRecord(record: DocumentRecord): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', record.id);
  if (error) throw error;

  const path = record.file_path?.trim();
  if (path && !/^https?:\/\//i.test(path) && !INTERNAL_DOC_ID.test(path)) {
    const { bucket, objectPath } = parseStoragePath(path);
    const { error: storageError } = await supabase.storage.from(bucket).remove([objectPath]);
    if (storageError) {
      console.warn('[documents] storage cleanup skipped:', storageError.message);
    }
  }
}
