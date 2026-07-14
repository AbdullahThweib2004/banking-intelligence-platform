/**
 * Intent classification for the hybrid bank chat assistant.
 *
 * Decides, from the raw question text, which retrieval sources are needed:
 *   - 'policy'     — general banking/product/procedure question -> the 3
 *                    policy files (src/data/policies via rag.ts)
 *   - 'customer'   — asks about a specific customer/account -> bank_customers
 *   - 'hybrid'     — mentions both a specific customer/account AND policy
 *                    rules/conditions -> both sources
 *   - 'greeting'   — a greeting or casual conversational opener ("hello",
 *                    "مرحبا", "how are you?") -> no retrieval needed, answer
 *                    naturally
 *   - 'capability' — asks what the assistant can do / who it is -> no
 *                    retrieval needed, describe the real capabilities
 *   - 'general'    — anything else (casual chat, general knowledge, off-topic)
 *                    -> plain assistant fallback
 *
 * A real banking question always wins over an incidental greeting/capability
 * phrase in the same message (e.g. "Hi, what are the loan conditions?" is
 * still 'policy') — greeting/capability are only reported when nothing else
 * in the message needs retrieval.
 *
 * This is a lightweight, bilingual (EN/AR) keyword + pattern classifier, not
 * an LLM call — it must run before any retrieval so we know what to fetch.
 * Account numbers are matched precisely (`BOP-<digits>`) so customer lookups
 * are always exact, never a fuzzy/name-based guess.
 */

export type ChatIntent = 'policy' | 'customer' | 'hybrid' | 'greeting' | 'capability' | 'general';

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
  /**
   * True specifically when the user wants a concrete installment TERM back
   * ("best term", "how many years"), as opposed to a general qualification
   * check ("does he qualify", "can she afford it"). This decides whether
   * missing a loan amount should ask a clarifying question (a term can't be
   * computed without one) or fall back to a qualitative affordability
   * summary (still useful without a specific amount).
   */
  seeksSpecificTerm: boolean;
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

// Broad advisory trigger — any loan-affordability/eligibility-flavored
// question, whether or not it asks for a specific term.
const ADVISORY_EN = [
  'best number of years', 'best term', 'installment period', 'installment term',
  'best installment', 'loan term', 'how many years', 'afford', 'affordability',
  'eligib', 'qualify', 'qualifies', 'suitable term', 'recommended term',
  'recommend', 'debt burden',
];

const ADVISORY_AR = [
  'أفضل عدد سنوات', 'أفضل مدة', 'مدة القسط', 'مدة القرض', 'كم سنة',
  'يتحمل', 'مؤهل', 'يستحق', 'المدة المناسبة', 'المدة الموصى بها',
  'يوصى', 'عبء الدين',
];

// Narrower: the user wants a concrete installment TERM back, which cannot be
// computed without a loan amount — this is what should trigger a
// clarifying question when no amount is available anywhere, rather than
// silently substituting a qualitative affordability summary.
const TERM_SEEKING_EN = [
  'best number of years', 'best term', 'installment period', 'installment term',
  'best installment', 'loan term', 'how many years', 'suitable term',
  'recommended term', 'recommend a term', 'what term',
];

const TERM_SEEKING_AR = [
  'أفضل عدد سنوات', 'أفضل مدة', 'مدة القسط', 'مدة القرض', 'كم سنة',
  'المدة المناسبة', 'المدة الموصى بها', 'أي مدة',
];

// Greetings and casual conversational openers — answered naturally, no
// retrieval needed. Deliberately short/exact phrases so they don't misfire
// on longer sentences that happen to contain a common word.
const GREETING_EN = [
  'hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon',
  'greetings', 'how are you', "how're you", 'how are things', "what's up",
  'nice to meet you',
];

const GREETING_AR = [
  'مرحبا', 'مرحباً', 'اهلا', 'أهلا', 'أهلاً', 'هلا', 'السلام عليكم',
  'صباح الخير', 'مساء الخير', 'كيف حالك', 'كيف الحال', 'شلونك', 'إزيك',
];

// "What can you do / who are you" style questions — answered with the
// assistant's real, fixed capability list, never invented.
const CAPABILITY_EN = [
  'what can you do', 'what can i ask you', 'what can i ask', 'who are you',
  'what are you', 'help me', 'can you help', 'what services', 'how can you help',
  'what do you do',
];

const CAPABILITY_AR = [
  'ماذا يمكنك', 'ماذا تستطيع', 'من أنت', 'من انت', 'ما هي خدماتك',
  'كيف يمكنك مساعدتي', 'هل يمكنك مساعدتي', 'ساعدني', 'ماذا يمكنني أن أسألك',
  'بماذا يمكنك مساعدتي',
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
  const seeksSpecificTerm = containsAny(query, TERM_SEEKING_EN) || containsAny(query, TERM_SEEKING_AR);

  const isGreeting = containsAny(query, GREETING_EN) || containsAny(query, GREETING_AR);
  const isCapability = containsAny(query, CAPABILITY_EN) || containsAny(query, CAPABILITY_AR);

  let intent: ChatIntent;
  if (hasCustomerSignal && hasPolicySignal) intent = 'hybrid';
  else if (hasCustomerSignal) intent = 'customer';
  else if (hasPolicySignal) intent = 'policy';
  else if (isGreeting) intent = 'greeting';
  else if (isCapability) intent = 'capability';
  else intent = 'general';

  return { intent, accountNumbers, hasCustomerSignal, hasPolicySignal, isAdvisory, seeksSpecificTerm };
}
