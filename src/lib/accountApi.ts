/**
 * Thin client for the account-opening backend used by the "Open New Account"
 * wizard on the Documents page.
 *
 * The base URL is read from `VITE_API_BASE_URL` (e.g. "https://api.example.com").
 * When unset, requests are made relative to the current origin, which lets you
 * proxy them through Vite in development.
 */
import { ACCOUNT_OPENING_ROLES, type Role } from '@/lib/roles';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * Caller identity forwarded to the backend so it can enforce access control,
 * and used here to fail fast before an unauthorized request is even sent.
 */
export interface AccountAuthz {
  accessToken: string | null;
  role: Role | null;
}

function assertCanOpenAccount(role: Role | null): void {
  if (!role || !ACCOUNT_OPENING_ROLES.includes(role)) {
    throw new Error('You are not authorized to perform account opening.');
  }
}

function authHeaders(authz: AccountAuthz): Record<string, string> {
  const headers: Record<string, string> = {};
  if (authz.accessToken) headers.Authorization = `Bearer ${authz.accessToken}`;
  if (authz.role) headers['X-User-Role'] = authz.role;
  return headers;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. an HTML error page) — leave data as null.
  }

  if (!res.ok) {
    const record = (data && typeof data === 'object' ? (data as Record<string, unknown>) : null);
    const message =
      (record && (record.message ?? record.error)) != null
        ? String(record.message ?? record.error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export interface ExtractIdResponse {
  document_id: string;
}

/** Step 1 — upload the ID image and receive a document id. */
export async function extractId(
  file: File,
  authz: AccountAuthz
): Promise<ExtractIdResponse> {
  assertCanOpenAccount(authz.role);

  const formData = new FormData();
  formData.append('file', file);

  const data = await requestJson<ExtractIdResponse>('/documents/extract-id', {
    method: 'POST',
    // Note: don't set Content-Type for FormData — the browser adds the boundary.
    headers: authHeaders(authz),
    body: formData,
  });

  if (!data?.document_id) {
    throw new Error('The server did not return a document id.');
  }
  return data;
}

export interface ExtractedFields {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  father_name?: string;
  mother_name?: string;
  id_number?: string;
  confidence?: number;
}

export interface ExtractFieldsResponse extends ExtractedFields {
  /** Some backends nest the values under `fields`. */
  fields?: ExtractedFields;
  extraction_source?: 'regex' | 'regex+llm' | 'llm';
  llm_fallback_attempted?: boolean;
  extraction_warnings?: string[];
  /** Detected form language from raw OCR text (ar | en). */
  language?: 'ar' | 'en';
  ocr_language?: string;
}

export interface GenerateFormPayload {
  language?: 'ar' | 'en';
  first_name: string;
  last_name: string;
  date_of_birth: string;
  id_number: string;
  father_name?: string;
  mother_name?: string;
  customer_signature?: string | null;
  employee_signature?: string | null;
  staff_signature?: string | null;
  return_format?: 'download' | 'base64';
}

export interface GenerateFormBase64Response {
  document_id: string;
  filename: string;
  content_type: string;
  pdf_base64: string;
  size_bytes: number;
}

/** Step 2 — run field extraction for a previously uploaded document. */
export async function extractFields(
  documentId: string,
  authz: AccountAuthz
): Promise<ExtractFieldsResponse> {
  assertCanOpenAccount(authz.role);
  return requestJson<ExtractFieldsResponse>(
    `/documents/${encodeURIComponent(documentId)}/extract-fields`,
    { method: 'POST', headers: authHeaders(authz) }
  );
}

export interface OpenAccountPayload {
  document_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  father_name: string;
  mother_name: string;
  id_number: string;
}

export interface OpenAccountResponse {
  reference_id?: string;
  document_id?: string;
  id?: string;
  file_name?: string;
  confidence?: number;
  extracted_fields?: number;
}

/** Sign & Print — render two-copy account-opening PDF with embedded signatures. */
export async function generateAccountForm(
  documentId: string,
  payload: GenerateFormPayload,
  authz: AccountAuthz
): Promise<GenerateFormBase64Response> {
  assertCanOpenAccount(authz.role);
  return requestJson<GenerateFormBase64Response>(
    `/documents/${encodeURIComponent(documentId)}/generate-form`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(authz) },
      body: JSON.stringify({ ...payload, return_format: 'base64' }),
    }
  );
}

/** Step 4 — submit the confirmed fields to open the account. */
export async function openNewAccount(
  payload: OpenAccountPayload,
  authz: AccountAuthz
): Promise<OpenAccountResponse> {
  assertCanOpenAccount(authz.role);
  return requestJson<OpenAccountResponse>('/accounts/open-new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(authz) },
    body: JSON.stringify(payload),
  });
}
