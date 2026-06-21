import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageCircleQuestion } from 'lucide-react';

export const SUGGESTED_QUESTIONS_AR = [
  'ما هي المستندات المطلوبة للحصول على قرض سكني؟',
  'ما هي خطوات الموافقة على القرض؟',
  'ما هي متطلبات الدخل للحصول على قرض تجاري؟',
] as const;

export const SUGGESTED_QUESTIONS_EN = [
  'What documents are required for a home loan?',
  'What is the loan approval process?',
  'What income requirements are needed for a business loan?',
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
