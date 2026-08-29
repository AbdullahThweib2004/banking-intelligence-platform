import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageCircleQuestion } from 'lucide-react';

/**
 * Six suggested questions — three Arabic, three English, in equivalent pairs.
 *
 * Each pair deliberately exercises a DIFFERENT grounded retrieval path, so the
 * suggestions demonstrate what the assistant can actually evidence:
 *   1. policy retrieval  -> loan-policy.md "Required Documents"
 *   2. policy retrieval  -> loan-policy.md "Loan Approval Workflow"
 *   3. customer lookup + deterministic affordability calculation
 *
 * The previous set was three policy questions in both languages, two of which
 * had no grounding at all: the corpus never mentioned home/housing loans, and
 * had no approval-workflow section. Both gaps are now closed — the wording
 * here matches sections that genuinely exist.
 *
 * BOP-100001 is seeded demo data (supabase/migrations/20260621100000_bank_customers.sql).
 * The eligibility answer is NEVER hardcoded: the account number triggers an
 * exact-account lookup and the deterministic engine computes the result from
 * the real retrieved record.
 */
export const SUGGESTED_QUESTIONS_AR = [
  'ما هي المستندات المطلوبة للحصول على قرض شخصي؟',
  'ما هي مراحل الموافقة على طلب القرض؟',
  'هل يستطيع العميل BOP-100001 الحصول على قرض بقيمة 20,000 شيكل لمدة 5 سنوات؟',
] as const;

export const SUGGESTED_QUESTIONS_EN = [
  'What documents are required for a personal loan?',
  'What are the loan approval stages?',
  'Can customer BOP-100001 afford a loan of 20,000 ILS over 5 years?',
] as const;

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
  disabled?: boolean;
  className?: string;
}

export const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({
  onSelect,
  disabled = false,
  className,
}) => {
  return (
    <div className={cn('w-full max-w-2xl mx-auto mt-6', className)}>
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground mb-4">
        <MessageCircleQuestion className="h-4 w-4" />
        <span>Suggested questions · أسئلة مقترحة</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">العربية</p>
          {SUGGESTED_QUESTIONS_AR.map((question) => (
            <Button
              key={question}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onSelect(question)}
              dir="rtl"
              data-testid="suggested-question"
              data-lang="ar"
              className="h-auto py-2.5 px-3 text-right justify-start whitespace-normal text-sm font-normal"
            >
              {question}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">English</p>
          {SUGGESTED_QUESTIONS_EN.map((question) => (
            <Button
              key={question}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onSelect(question)}
              data-testid="suggested-question"
              data-lang="en"
              className="h-auto py-2.5 px-3 text-left justify-start whitespace-normal text-sm font-normal"
            >
              {question}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
