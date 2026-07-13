/**
 * Intent classification for the hybrid bank chat assistant.
 *
 * Decides, from the raw question text, which retrieval sources are needed:
 *   - 'policy'   — general banking/product/procedure question -> the 3
 *                  policy files (src/data/policies via rag.ts)
 *   - 'customer' — asks about a specific customer/account -> bank_customers
 *   - 'hybrid'   — mentions both a specific customer/account AND policy
 *                  rules/conditions -> both sources
 *   - 'general'  — casual chat or anything else -> plain assistant fallback
 *
 * This is a lightweight, bilingual (EN/AR) keyword + pattern classifier, not
 * an LLM call — it must run before any retrieval so we know what to fetch.
 * Account numbers are matched precisely (`BOP-<digits>`) so customer lookups
 * are always exact, never a fuzzy/name-based guess.
 */

export type ChatIntent = 'policy' | 'customer' | 'hybrid' | 'general';

export interface IntentResult {
  intent: ChatIntent;
  /** Deduped, upper-cased account numbers found in the query, in order of appearance. */
  accountNumbers: string[];
  /** True if the question is about a specific customer/account (with or without a number). */
  hasCustomerSignal: boolean;
  /** True if the question is about general policy/conditions/rules. */
  hasPolicySignal: boolean;
  /** True if the question looks like a loan affordability/term/eligibility advisory ask. */
  isAdvisory: boolean;
}

const ACCOUNT_NUMBER_RE = /\bBOP-\d+\b/gi;

const CUSTOMER_SIGNAL_EN = [
  'account number', 'account no', 'this customer', 'the customer', 'customer with',
  'his salary', 'her salary', 'their salary', 'monthly salary', 'monthly income',
  'obligations', 'existing loans', 'existing loan', 'eligible', 'eligibility',
  'qualify', 'qualifies', 'afford', 'affordability', 'installment', 'installments',
  'status of', 'does he', 'does she', 'is he', 'is she', 'can he', 'can she',
];

const CUSTOMER_SIGNAL_AR = [
  'رقم الحساب', 'هذا العميل', 'العميل', 'عميل رقم', 'راتبه', 'راتبها',
  'الراتب الشهري', 'الدخل الشهري', 'الالتزامات', 'القروض الحالية',
  'مؤهل', 'يستحق', 'يتحمل', 'قسط', 'أقساط', 'حالة العميل', 'هل يمكنه',
  'هل يمكنها', 'هل يستطيع', 'هل تستطيع',
];

const POLICY_SIGNAL_EN = [
  'policy', 'policies', 'condition', 'conditions', 'requirement', 'requirements',
  'documents required', 'documents needed', 'what documents', 'procedure',
  'process', 'rules', 'terms', 'eligibility criteria', 'how to open', 'guideline',
  'according to', 'bank policy', 'allowed limit',
];

const POLICY_SIGNAL_AR = [
  'سياسة', 'سياسات', 'شرط', 'شروط', 'متطلبات', 'مستندات مطلوبة',
  'إجراء', 'إجراءات', 'قواعد', 'معايير', 'كيفية فتح', 'إرشادات',
  'وفقا لسياسة', 'حسب سياسة', 'الحد المسموح',
];

const ADVISORY_EN = [
  'best number of years', 'best term', 'installment period', 'loan term',
  'how many years', 'afford', 'affordability', 'eligib', 'qualify', 'qualifies',
  'suitable term', 'recommended term', 'recommend', 'debt burden',
];

const ADVISORY_AR = [
  'أفضل عدد سنوات', 'أفضل مدة', 'مدة القسط', 'مدة القرض', 'كم سنة',
  'يتحمل', 'مؤهل', 'يستحق', 'المدة المناسبة', 'المدة الموصى بها',
  'يوصى', 'عبء الدين',
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsAny(text: string, terms: string[]): boolean {
  const n = normalize(text);
  return terms.some((t) => n.includes(t.toLowerCase()));
}

export function extractAccountNumbers(query: string): string[] {
  const matches = query.match(ACCOUNT_NUMBER_RE) ?? [];
  return Array.from(new Set(matches.map((m) => m.toUpperCase())));
}

export function classifyIntent(query: string): IntentResult {
  const accountNumbers = extractAccountNumbers(query);

  const hasCustomerSignal =
    accountNumbers.length > 0 ||
    containsAny(query, CUSTOMER_SIGNAL_EN) ||
    containsAny(query, CUSTOMER_SIGNAL_AR);

  const hasPolicySignal = containsAny(query, POLICY_SIGNAL_EN) || containsAny(query, POLICY_SIGNAL_AR);

  const isAdvisory = containsAny(query, ADVISORY_EN) || containsAny(query, ADVISORY_AR);

  let intent: ChatIntent;
  if (hasCustomerSignal && hasPolicySignal) intent = 'hybrid';
  else if (hasCustomerSignal) intent = 'customer';
  else if (hasPolicySignal) intent = 'policy';
  else intent = 'general';

  return { intent, accountNumbers, hasCustomerSignal, hasPolicySignal, isAdvisory };
}
