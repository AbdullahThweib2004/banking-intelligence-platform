// ============================================================================
// Bilingual RAG for the AI Assistant.
//
// Primary retrieval is Supabase + pgvector semantic search (via the
// `policy-search` Edge Function). If that is unavailable (not yet deployed,
// no embedding key, offline, etc.) it transparently falls back to the local,
// in-memory keyword engine built from the markdown files in src/data/policies.
//
// In both cases the behaviour is identical:
//   * answer language matches the query language
//   * the answer is composed ONLY from retrieved chunk content
//   * citations are localized: file name → section title (same language)
//   * if nothing relevant is found, the same-language fallback is returned
//
// The local markdown files are still imported so (a) the keyword fallback works
// and (b) they remain the single source ingested into Supabase.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';
import loanPolicy from '@/data/policies/loan-policy.md?raw';
import accountOpeningPolicy from '@/data/policies/account-opening-policy.md?raw';
import customerServiceGuidelines from '@/data/policies/customer-service-guidelines.md?raw';

export type Lang = 'ar' | 'en';

export interface PolicyChunk {
  fileName: string;
  sectionTitleEn: string;
  sectionTitleAr: string;
  textEn: string;
  textAr: string;
}

export interface Citation {
  fileName: string;
  sectionTitle: string;
}

export interface RagResult {
  found: boolean;
  answer: string;
  language: Lang;
  citations: Citation[];
  chunks: PolicyChunk[];
}

export const NOT_FOUND_MESSAGE: Record<Lang, string> = {
  en: 'I could not find this information in the available policy documents.',
  ar: 'لم أتمكن من العثور على هذه المعلومة في ملفات السياسات المتاحة.',
};

const ARABIC_CHAR = /[\u0600-\u06FF]/;

/** Detect the language of a piece of text: Arabic if it contains any Arabic letter. */
export function detectLanguage(text: string): Lang {
  return ARABIC_CHAR.test(text) ? 'ar' : 'en';
}

const RAW_DOCUMENTS: { fileName: string; content: string }[] = [
  { fileName: 'loan-policy.md', content: loanPolicy },
  { fileName: 'account-opening-policy.md', content: accountOpeningPolicy },
  { fileName: 'customer-service-guidelines.md', content: customerServiceGuidelines },
];

// English noise words.
const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are',
  'be', 'can', 'do', 'does', 'how', 'what', 'when', 'where', 'which', 'who',
  'whom', 'with', 'at', 'by', 'from', 'as', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'we', 'they', 'my', 'our', 'your', 'about',
  'into', 'if', 'should', 'must', 'may', 'will', 'would', 'there', 'their',
  'me', 'please', 'tell', 'give', 'need', 'want', 'get', 'have', 'has',
]);

// Arabic noise words (function words, question words, particles).
const AR_STOP_WORDS = new Set([
  'من', 'في', 'على', 'عن', 'ما', 'هي', 'هو', 'هل', 'الى', 'إلى', 'التي',
  'الذي', 'كيف', 'متى', 'اين', 'أين', 'ماذا', 'لماذا', 'مع', 'او', 'أو',
  'هذا', 'هذه', 'ذلك', 'تلك', 'كل', 'عند', 'عندما', 'بعد', 'قبل', 'هنا',
  'هناك', 'يجب', 'قد', 'لقد', 'كان', 'يكون', 'اي', 'أي', 'ايضا', 'أيضا',
  'الذين', 'لدى', 'حول', 'بين', 'ثم', 'لكن', 'ولا', 'الا', 'إلا', 'و',
]);

// Strip Arabic diacritics and normalize common letter variants so that, e.g.,
// "المستندات" and "مستندات" match.
function normalizeArabicWord(word: string): string {
  let w = word
    .replace(/[\u064B-\u0652\u0670]/g, '') // tashkeel
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه');
  if (w.startsWith('ال') && w.length > 4) w = w.slice(2); // definite article
  return w;
}

// Naive English singular/plural normalization so "documents" matches "document".
function stemEnglish(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function normalizeTerm(word: string): string {
  return ARABIC_CHAR.test(word) ? normalizeArabicWord(word) : stemEnglish(word);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !EN_STOP_WORDS.has(w) && !AR_STOP_WORDS.has(w))
    .map(normalizeTerm)
    .filter((w) => w.length >= 2);
}

// Split each markdown document into one chunk per `##` section, capturing the
// `### English` and `### العربية` bodies separately.
function buildChunks(): PolicyChunk[] {
  const chunks: PolicyChunk[] = [];

  for (const { fileName, content } of RAW_DOCUMENTS) {
    const lines = content.split('\n');
    let sectionTitleEn: string | null = null;
    let sectionTitleAr: string | null = null;
    let lang: Lang | null = null;
    let enBuffer: string[] = [];
    let arBuffer: string[] = [];

    const flush = () => {
      if (sectionTitleEn && (enBuffer.join('').trim() || arBuffer.join('').trim())) {
        chunks.push({
          fileName,
          sectionTitleEn,
          sectionTitleAr: sectionTitleAr || sectionTitleEn,
          textEn: enBuffer.join('\n').trim(),
          textAr: arBuffer.join('\n').trim(),
        });
      }
      enBuffer = [];
      arBuffer = [];
      lang = null;
    };

    for (const line of lines) {
      const sectionMatch = line.match(/^##\s+(.*)$/);
      if (sectionMatch) {
        flush();
        // Section headings are written as `English | Arabic`.
        const [en, ar] = sectionMatch[1].split('|').map((s) => s.trim());
        sectionTitleEn = en;
        sectionTitleAr = ar || en;
        continue;
      }

      const langMatch = line.match(/^###\s+(.*)$/);
      if (langMatch) {
        const label = langMatch[1].trim();
        lang = ARABIC_CHAR.test(label) ? 'ar' : 'en';
        continue;
      }

      // Skip the top-level `# Title` line.
      if (/^#\s+/.test(line)) continue;

      if (lang === 'ar') arBuffer.push(line);
      else if (lang === 'en') enBuffer.push(line);
    }
    flush();
  }

  return chunks;
}

const CHUNKS = buildChunks();

function bodyForLang(chunk: PolicyChunk, lang: Lang): string {
  if (lang === 'ar') return chunk.textAr || chunk.textEn;
  return chunk.textEn || chunk.textAr;
}

function titleForLang(chunk: PolicyChunk, lang: Lang): string {
  if (lang === 'ar') return chunk.sectionTitleAr || chunk.sectionTitleEn;
  return chunk.sectionTitleEn || chunk.sectionTitleAr;
}

// Precompute inverse-document-frequency per language so that rare, distinctive
// terms (e.g. "loan" / "قرض") outweigh common ones (e.g. "documents" /
// "مستندات") that appear across many sections.
const IDF: Record<Lang, Map<string, number>> = { en: new Map(), ar: new Map() };
(function buildIdf() {
  const n = CHUNKS.length;
  for (const lang of ['en', 'ar'] as Lang[]) {
    const df = new Map<string, number>();
    for (const chunk of CHUNKS) {
      for (const term of new Set(tokenize(bodyForLang(chunk, lang)))) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
    for (const [term, d] of df) IDF[lang].set(term, Math.log(n / (1 + d)) + 1);
  }
})();

function idf(term: string, lang: Lang): number {
  return IDF[lang].get(term) ?? Math.log(CHUNKS.length) + 1;
}

// BM25-style term-frequency saturation: extra repetitions of the same word add
// diminishing value, so broad query coverage beats a single repeated keyword.
const TF_K = 1.2;
function saturate(tf: number): number {
  return tf <= 0 ? 0 : (tf * (TF_K + 1)) / (tf + TF_K);
}

function scoreChunk(chunk: PolicyChunk, queryTerms: string[], lang: Lang): number {
  const bodyTerms = tokenize(bodyForLang(chunk, lang));
  const titleSet = new Set(tokenize(titleForLang(chunk, lang)));
  const fileSet = new Set(tokenize(chunk.fileName));

  const bodyCounts = new Map<string, number>();
  for (const t of bodyTerms) bodyCounts.set(t, (bodyCounts.get(t) ?? 0) + 1);

  let score = 0;
  for (const term of queryTerms) {
    score += saturate(bodyCounts.get(term) ?? 0) * idf(term, lang);
    // Heading matches are strong signals; the section title is matched in the
    // query language. File names are always English.
    if (titleSet.has(term)) score += 2.5 * idf(term, lang);
    if (fileSet.has(term)) score += 1.5 * idf(term, 'en');
  }
  return score;
}

/**
 * Local keyword retrieval (fallback engine).
 * Matching is done against the body that matches the query language.
 * Returns an empty array when nothing relevant is found.
 */
export function retrieveLocal(query: string, topK = 3, lang?: Lang): PolicyChunk[] {
  const language = lang ?? detectLanguage(query);
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0) return [];

  const scored = CHUNKS.map((chunk) => ({
    chunk,
    score: scoreChunk(chunk, queryTerms, language),
  })).filter((s) => s.score > 0);

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);

  // Keep only chunks reasonably close to the best match to avoid dragging in
  // weakly-related sections.
  const best = scored[0].score;
  const threshold = Math.max(1, best * 0.4);

  return scored
    .filter((s) => s.score >= threshold)
    .slice(0, topK)
    .map((s) => s.chunk);
}

interface PolicyMatchRow {
  file_name: string;
  section_title_en: string;
  section_title_ar: string;
  content_en: string;
  content_ar: string;
  similarity: number;
}

/**
 * Supabase + pgvector semantic retrieval (primary engine).
 * Throws if the Edge Function / vector store is unavailable so the caller can
 * fall back. A successful call returning zero rows means "no relevant match".
 */
export async function retrieveRemote(query: string, topK = 4): Promise<PolicyChunk[]> {
  const { data, error } = await supabase.functions.invoke('policy-search', {
    body: { query, matchCount: topK, matchThreshold: 0.3 },
  });

  if (error) throw error;
  const rows = (data?.chunks ?? []) as PolicyMatchRow[];

  return rows.map((r) => ({
    fileName: r.file_name,
    sectionTitleEn: r.section_title_en,
    sectionTitleAr: r.section_title_ar,
    textEn: r.content_en,
    textAr: r.content_ar,
  }));
}

function compose(chunks: PolicyChunk[], language: Lang): RagResult {
  if (chunks.length === 0) {
    return {
      found: false,
      answer: NOT_FOUND_MESSAGE[language],
      language,
      citations: [],
      chunks: [],
    };
  }

  const answer = chunks
    .map((c) => `**${titleForLang(c, language)}**\n${bodyForLang(c, language)}`)
    .join('\n\n---\n\n');

  const citations: Citation[] = chunks.map((c) => ({
    fileName: c.fileName,
    sectionTitle: titleForLang(c, language),
  }));

  return { found: true, answer, language, citations, chunks };
}

/**
 * Answer a question strictly from the policy documents, in the same language
 * as the question. Tries Supabase semantic retrieval first, then the local
 * keyword engine if the vector store is unavailable. The answer is composed
 * only from retrieved chunk text — no outside knowledge — and always carries
 * localized citations.
 */
export async function answerQuestion(query: string, topK = 3): Promise<RagResult> {
  const language = detectLanguage(query);

  // Primary: Supabase + pgvector semantic search.
  try {
    const remoteChunks = await retrieveRemote(query, Math.max(topK, 4));
    return compose(remoteChunks.slice(0, topK), language);
  } catch (err) {
    // Vector store unavailable — fall back to the local keyword engine.
    console.warn('[rag] semantic retrieval unavailable, using local fallback:', err);
    const localChunks = retrieveLocal(query, topK, language);
    return compose(localChunks, language);
  }
}

// Exposed for diagnostics / UI metadata.
export function getAllChunks(): PolicyChunk[] {
  return CHUNKS;
}
