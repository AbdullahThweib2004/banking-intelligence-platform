/**
 * Internal Banking AI Assistant — behavior policy.
 *
 * The assistant answers ONLY from the bank knowledge base (policy RAG).
 * No general model knowledge, no internet, no hallucination.
 */

import type { Lang } from '@/lib/rag';

/** Exact refusal text (English) — do not paraphrase. */
export const REFUSAL_MESSAGE_EN =
  'I could not find relevant information in the bank knowledge base. Please ask about bank policies, procedures, products, or internal guidelines.';

/** Arabic equivalent of the refusal message. */
export const REFUSAL_MESSAGE_AR =
  'لم أتمكن من العثور على معلومات ذات صلة في قاعدة المعرفة المصرفية. يرجى السؤال عن سياسات البنك أو الإجراءات أو المنتجات أو الإرشادات الداخلية.';

export const REFUSAL_MESSAGE: Record<Lang, string> = {
  en: REFUSAL_MESSAGE_EN,
  ar: REFUSAL_MESSAGE_AR,
};

/** Terms that indicate the question is about bank internal knowledge. */
const BANKING_TERMS_EN = [
  'loan', 'credit', 'account', 'deposit', 'complaint', 'escalat', 'kyc',
  'document', 'policy', 'policies', 'procedure', 'branch', 'customer',
  'savings', 'mortgage', 'income', 'debt', 'approval', 'reject', 'bank',
  'opening', 'verification', 'service', 'guideline', 'employee', 'risk',
  'assessment', 'national', 'salary', 'statement', 'purpose', 'minimum',
];

const BANKING_TERMS_AR = [
  'قرض', 'ائتمان', 'حساب', 'إيداع', 'شكو', 'تصعيد', 'مستند', 'وثيق',
  'سياس', 'إجراء', 'فرع', 'عميل', 'توفير', 'دخل', 'مديون', 'موافق',
  'رفض', 'بنك', 'فتح', 'تحقق', 'خدم', 'موظف', 'مخاطر', 'راتب', 'كشف',
];

/** Strong signals the question is outside the bank knowledge domain. */
const OUT_OF_SCOPE_EN = [
  'stock price', 'share price', 'bitcoin', 'crypto', 'ethereum',
  'world cup', 'football', 'soccer', 'basketball', 'nba', 'premier league',
  'weather', 'temperature forecast', 'who won', 'celebrity', 'movie', 'netflix',
  'python code', 'javascript', 'programming', 'react component', 'typescript',
  'symptoms', 'cancer', 'diagnosis', 'medicine', 'doctor',
  'president', 'election', 'politics', 'war', 'country capital',
  'recipe', 'restaurant', 'dating', 'relationship advice',
  'apple stock', 'google stock', 'tesla stock', 'amazon stock',
];

const OUT_OF_SCOPE_AR = [
  'سعر السهم', 'بitcoin', 'بتكوين', 'كريبتو', 'كأس العالم', 'مبارا',
  'الطقس', 'درجة الحرارة', 'من فاز', 'فيلم', 'مسلسل', 'برمج',
  'python', 'javascript', 'react', 'أعراض', 'مرض', 'طبيب', 'رئيس',
  'انتخاب', 'سياس', 'عاصمة', 'وصفة', 'مطعم',
];

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsAny(text: string, terms: string[]): boolean {
  const n = normalizeForMatch(text);
  return terms.some((t) => n.includes(t.toLowerCase()));
}

/**
 * Returns true when the question is clearly outside banking / internal docs
 * and should be refused without retrieval.
 */
export function isOutOfScope(query: string, language: Lang): boolean {
  const banking =
    language === 'ar'
      ? containsAny(query, BANKING_TERMS_AR) || containsAny(query, BANKING_TERMS_EN)
      : containsAny(query, BANKING_TERMS_EN) || containsAny(query, BANKING_TERMS_AR);

  if (banking) return false;

  const outOfScope =
    language === 'ar'
      ? containsAny(query, OUT_OF_SCOPE_AR) || containsAny(query, OUT_OF_SCOPE_EN)
      : containsAny(query, OUT_OF_SCOPE_EN) || containsAny(query, OUT_OF_SCOPE_AR);

  return outOfScope;
}
