import React from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface LoanRiskInfoPopoverProps {
  language: string;
  className?: string;
}

const CALCULATION_STEPS = {
  en: [
    {
      title: '1. Collect application inputs',
      body: 'You enter monthly income, monthly expenses, existing loan balances, requested loan amount, employment type, and loan purpose.',
    },
    {
      title: '2. Derive financial indicators',
      body: 'The system calculates estimated new loan payment (5-year term, 9% annual rate), debt service ratio = (expenses + existing loans ÷ 12 + new payment) ÷ income, loan-to-income ratio, and disposable income after all obligations.',
    },
    {
      title: '3. Produce a risk score (0–100)',
      body: 'Primary path: AI reviews the structured payload and returns score, category, top factors, and recommended action. Fallback path: an additive model starts at 8 points and adds weighted impacts for debt service ratio, loan size, new payment burden, existing loans, expenses, disposable income, income level, and employment stability.',
    },
    {
      title: '4. Map score to risk level',
      body: 'Low: score below 40 · Medium: 40–69 · High: 70 or above. Recommended action: Approve (low), Manual review (medium), Reject (high or negative disposable income).',
    },
  ],
  ar: [
    {
      title: '1. جمع بيانات الطلب',
      body: 'تُدخل الدخل الشهري، المصاريف، أرصدة القروض الحالية، مبلغ القرض المطلوب، نوع التوظيف، والغرض من القرض.',
    },
    {
      title: '2. حساب المؤشرات المالية',
      body: 'يحسب النظام القسط الشهري المقدر (5 سنوات، 9% سنوياً)، ونسبة خدمة الدين = (المصاريف + القروض الحالية ÷ 12 + القسط الجديد) ÷ الدخل، ونسبة القرض إلى الدخل، والدخل المتاح بعد الالتزامات.',
    },
    {
      title: '3. إنتاج درجة المخاطر (0–100)',
      body: 'المسار الأساسي: الذكاء الاصطناعي يراجع البيانات المنظمة ويعيد الدرجة والفئة وأهم العوامل والإجراء الموصى به. المسار الاحتياطي: نموذج تراكمي يبدأ من 8 نقاط ويضيف تأثيرات موزّنة لنسبة خدمة الدين، حجم القرض، عبء القسط الجديد، القروض الحالية، المصاريف، الدخل المتاح، مستوى الدخل، واستقرار التوظيف.',
    },
    {
      title: '4. تحويل الدرجة إلى مستوى مخاطر',
      body: 'منخفض: أقل من 40 · متوسط: 40–69 · مرتفع: 70 فأكثر. الإجراء الموصى به: موافقة (منخفض)، مراجعة يدوية (متوسط)، رفض (مرتفع أو دخل متاح سالب).',
    },
  ],
} as const;

const INPUT_FACTORS = {
  en: ['Monthly income', 'Monthly expenses', 'Existing loans', 'Requested loan amount', 'Employment type', 'Loan purpose'],
  ar: ['الدخل الشهري', 'المصاريف الشهرية', 'القروض الحالية', 'مبلغ القرض المطلوب', 'نوع التوظيف', 'غرض القرض'],
} as const;

export const LoanRiskInfoPopover: React.FC<LoanRiskInfoPopoverProps> = ({ language, className }) => {
  const isAr = language === 'ar';
  const steps = isAr ? CALCULATION_STEPS.ar : CALCULATION_STEPS.en;
  const factors = isAr ? INPUT_FACTORS.ar : INPUT_FACTORS.en;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'h-10 w-10 shrink-0 rounded-md border-border/80 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5',
            className
          )}
          aria-label={isAr ? 'شرح طريقة حساب المخاطر' : 'Explain risk calculation method'}
        >
          <Info className="h-4 w-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(calc(100vw-2rem),24rem)] sm:w-[26rem] p-0 overflow-hidden"
        align="end"
        side="bottom"
        sideOffset={8}
      >
        <div className="bg-gradient-to-r from-[hsl(217,91%,48%)]/10 to-primary/5 px-4 py-3 border-b border-border/60">
          <h4 className="text-sm font-semibold text-foreground leading-snug">
            {isAr ? 'طريقة حساب مخاطر القرض' : 'How loan risk is calculated'}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {isAr
              ? 'يُطبَّق قبل إرسال الطلب — لمساعدتك على فهم التقييم'
              : 'Applied when you submit — helps you understand the assessment'}
          </p>
        </div>
        <div className="p-4 space-y-4 max-h-[min(70vh,480px)] overflow-y-auto">
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.title}>
                <p className="text-xs font-semibold text-foreground">{step.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{step.body}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground mb-1.5">
              {isAr ? 'الحقول المستخدمة في الحساب' : 'Fields used in the calculation'}
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc ps-4">
              {factors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
            {isAr
              ? 'النتيجة تدعم قرار الموظف ولا تُغني عن المراجعة البشرية النهائية.'
              : 'The result supports staff review but does not replace final human decision-making.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
