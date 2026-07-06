import React from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface LoanRiskInfoPopoverProps {
  language: string;
  className?: string;
  /** Optional current risk category shown inside the modal. */
  riskCategory?: 'low' | 'medium' | 'high';
}

interface ExplanationSection {
  title: string;
  paragraphs: string[];
  formulas?: string[];
  bullets?: string[];
}

const EXPLANATION_CONTENT: Record<'en' | 'ar', ExplanationSection[]> = {
  en: [
    {
      title: 'Overview',
      paragraphs: [
        'When you submit a new credit assessment, the system first builds a structured financial profile from the form fields you enter (or load from the customer record). That profile is sent to the AI credit assessment service, which returns the risk score (0–100), category, top factors, and recommended action.',
        'If the AI service is unavailable, the same derived indicators are scored by a transparent additive fallback model implemented in the application. Both paths use identical derived features so staff always see consistent financial ratios.',
        'Loan restriction flags on a customer profile block submission entirely — restricted customers are not scored.',
      ],
    },
    {
      title: 'Step 1 — Input fields',
      paragraphs: ['The following values are read from the assessment form:'],
      bullets: [
        'Monthly income (I)',
        'Monthly expenses (E)',
        'Existing loans — total outstanding balance (L)',
        'Requested loan amount (P)',
        'Employment type (employed, self-employed, business, or unknown)',
        'Loan purpose (informational; included in the AI payload)',
        'Restriction status — if the customer is loan-restricted, assessment is blocked before scoring',
      ],
    },
    {
      title: 'Step 2 — Derived financial indicators',
      paragraphs: [
        'Before scoring, the system computes these ratios and payment estimates. Constants used for the new-loan payment: loan term = 60 months, annual interest rate = 9% (0.09).',
      ],
      formulas: [
        'Existing monthly obligation  =  L ÷ 12',
        'Monthly rate  r  =  0.09 ÷ 12',
        'Amortization factor  =  (1 + r)^60',
        'Estimated new loan payment  M  =  (P × r × factor) ÷ (factor − 1)   [if P > 0; else M = 0]',
        'Total monthly debt service  T  =  E + (L ÷ 12) + M',
        'Debt service ratio (DSR)  =  T ÷ I   [if I > 0; else DSR = 1]',
        'Loan-to-annual-income ratio  =  P ÷ (I × 12)',
        'Loan-to-monthly-income ratio  =  P ÷ I',
        'Disposable income  =  I − T',
      ],
    },
    {
      title: 'Step 3 — AI assessment (primary path)',
      paragraphs: [
        'The AI receives both raw inputs and all derived indicators above. It returns a JSON result containing: score (integer 0–100), category (low / medium / high), confidence (0–1), summary text, top 3–6 qualitative factors, and recommended_action (approve / manual_review / reject).',
        'AI category rules mirror the fallback model: Low if score < 40, Medium if 40–69, High if score ≥ 70. Higher debt service ratio, higher loan-to-income ratio, negative disposable income, and unstable employment increase the score in the AI model guidance.',
      ],
    },
    {
      title: 'Step 4 — Fallback additive score (when AI is unavailable)',
      paragraphs: [
        'Each indicator contributes a number of risk points. Positive points increase risk; negative points reduce it. The raw score is the sum of a base value plus all contributions, then clamped to 0–100.',
      ],
      formulas: [
        'Base score  =  8',
        'DSR impact  =  min(38, max(0, (DSR − 0.30) × 65))',
        'Loan amount impact  =  min(22, max(0, (P÷I − 2) × 4.5))',
        'New payment impact  =  min(18, max(0, (M÷I − 0.15) × 55))',
        'Existing loans impact  =  min(12, max(0, (L÷12 ÷ I) × 45))',
        'Expenses impact  =  min(10, max(0, (E÷I − 0.35) × 22))',
        'If disposable income < 0:',
        '    Disposable impact  =  min(20, 12 + |disposable| ÷ 100)',
        'Else:',
        '    Disposable ratio  =  disposable ÷ I',
        '    Disposable impact  =  min(12, max(0, (0.12 − disposable ratio) × 40))',
        'If I < 2,000:  Income impact  =  min(8, (2,000 − I) ÷ 250)',
        'If I ≥ 2,000:  Income impact  =  max(−5, min(0, (I − 6,000) ÷ −800))   [strong income reduces risk]',
        'Employment impact:  employed = 0 pts · business = 4 pts · self-employed = 6 pts · unknown = 5 pts',
        'Raw score  =  8 + sum of all impacts above',
        'Final score  =  round(clamp(Raw score, 0, 100))',
      ],
    },
    {
      title: 'Step 5 — Risk category & recommended action',
      paragraphs: ['The final score maps to a category and a suggested next step:'],
      formulas: [
        'Low risk:     score < 40   →  Recommended: Approve',
        'Medium risk:  40 ≤ score < 70   →  Recommended: Manual review',
        'High risk:    score ≥ 70   →  Recommended: Reject',
        'Negative disposable income strongly pushes toward reject / high risk in both AI and fallback paths.',
      ],
    },
    {
      title: 'Important note',
      paragraphs: [
        'The score and category shown after submission reflect the engine that ran (AI or fallback). Top factors in the result view list the largest positive and negative contributors. This explanation supports staff review — it does not replace final human decision-making.',
      ],
    },
  ],
  ar: [
    {
      title: 'نظرة عامة',
      paragraphs: [
        'عند إرسال تقييم ائتماني جديد، يبني النظام أولاً ملفاً مالياً منظماً من حقول النموذج (أو من سجل العميل). يُرسَل هذا الملف إلى خدمة تقييم الذكاء الاصطناعي التي تعيد درجة المخاطر (0–100)، والفئة، وأهم العوامل، والإجراء الموصى به.',
        'إذا تعذّر AI، تُقيَّم نفس المؤشرات المشتقة بنموذج تراكمي شفاف مبرمج في التطبيق. كلا المسارين يستخدمان مؤشرات مشتقة متطابقة.',
        'علامات تقييد القرض على ملف العميل تمنع الإرسال — لا يُحسب تقييم للعملاء المقيّدين.',
      ],
    },
    {
      title: 'الخطوة 1 — حقول الإدخال',
      paragraphs: ['تُقرأ القيم التالية من نموذج التقييم:'],
      bullets: [
        'الدخل الشهري (I)',
        'المصاريف الشهرية (E)',
        'القروض الحالية — إجمالي الرصيد (L)',
        'مبلغ القرض المطلوب (P)',
        'نوع التوظيف (موظف، عمل حر، تجاري، أو غير معروف)',
        'غرض القرض (معلوماتي؛ يُضمّ إلى حمولة AI)',
        'حالة القيود — إذا كان العميل مقيّداً، يُوقف التقييم قبل الحساب',
      ],
    },
    {
      title: 'الخطوة 2 — المؤشرات المالية المشتقة',
      paragraphs: [
        'قبل التقييم، يحسب النظام النسب التالية. ثوابت القسط الجديد: مدة القرض = 60 شهراً، معدل الفائدة السنوي = 9% (0.09).',
      ],
      formulas: [
        'الالتزام الشهري للقروض الحالية  =  L ÷ 12',
        'المعدل الشهري  r  =  0.09 ÷ 12',
        'عامل الاستهلاك  =  (1 + r)^60',
        'القسط الشهري المقدر  M  =  (P × r × factor) ÷ (factor − 1)   [إذا P > 0]',
        'إجمالي خدمة الدين الشهرية  T  =  E + (L ÷ 12) + M',
        'نسبة خدمة الدين (DSR)  =  T ÷ I   [إذا I > 0؛ وإلا DSR = 1]',
        'نسبة القرض إلى الدخل السنوي  =  P ÷ (I × 12)',
        'نسبة القرض إلى الدخل الشهري  =  P ÷ I',
        'الدخل المتاح  =  I − T',
      ],
    },
    {
      title: 'الخطوة 3 — تقييم AI (المسار الأساسي)',
      paragraphs: [
        'يتلقى AI المدخلات الخام وجميع المؤشرات أعلاه. يعيد JSON يتضمن: الدرجة (0–100)، الفئة (منخفض/متوسط/مرتفع)، الثقة (0–1)، ملخصاً، 3–6 عوامل، وrecommended_action.',
        'قواعد الفئة: منخفض إذا الدرجة < 40، متوسط 40–69، مرتفع ≥ 70. ارتفاع DSR ونسبة القرض إلى الدخل والدخل المتاح السالب يزيد المخاطر.',
      ],
    },
    {
      title: 'الخطوة 4 — النموذج التراكمي الاحتياطي',
      paragraphs: [
        'كل مؤشر يساهم بعدد من نقاط المخاطر. النقاط الموجبة ترفع المخاطر والسالبة تخفّضها. المجموع الخام = قاعدة + كل المساهمات، ثم يُحدَّد بين 0 و100.',
      ],
      formulas: [
        'الدرجة الأساسية  =  8',
        'أثر DSR  =  min(38, max(0, (DSR − 0.30) × 65))',
        'أثر مبلغ القرض  =  min(22, max(0, (P÷I − 2) × 4.5))',
        'أثر القسط الجديد  =  min(18, max(0, (M÷I − 0.15) × 55))',
        'أثر القروض الحالية  =  min(12, max(0, (L÷12 ÷ I) × 45))',
        'أثر المصاريف  =  min(10, max(0, (E÷I − 0.35) × 22))',
        'إذا الدخل المتاح < 0:',
        '    أثر الدخل المتاح  =  min(20, 12 + |disposable| ÷ 100)',
        'وإلا:',
        '    نسبة الدخل المتاح  =  disposable ÷ I',
        '    أثر الدخل المتاح  =  min(12, max(0, (0.12 − النسبة) × 40))',
        'إذا I < 2,000:  أثر الدخل  =  min(8, (2,000 − I) ÷ 250)',
        'إذا I ≥ 2,000:  أثر الدخل  =  max(−5, min(0, (I − 6,000) ÷ −800))',
        'أثر التوظيف:  موظف = 0 · تجاري = 4 · عمل حر = 6 · غير معروف = 5',
        'المجموع الخام  =  8 + مجموع كل الآثار',
        'الدرجة النهائية  =  round(clamp(المجموع, 0, 100))',
      ],
    },
    {
      title: 'الخطوة 5 — الفئة والإجراء الموصى به',
      paragraphs: ['تُحوَّل الدرجة النهائية إلى فئة وخطوة مقترحة:'],
      formulas: [
        'مخاطر منخفضة:     الدرجة < 40   →  موافقة',
        'مخاطر متوسطة:  40 ≤ الدرجة < 70   →  مراجعة يدوية',
        'مخاطر مرتفعة:    الدرجة ≥ 70   →  رفض',
        'الدخل المتاح السالب يدفع بقوة نحو الرفض / المخاطر المرتفعة.',
      ],
    },
    {
      title: 'ملاحظة مهمة',
      paragraphs: [
        'الدرجة والفئة المعروضة بعد الإرسال تعكس المحرك الذي عمل (AI أو احتياطي). العوامل الأبرز في النتيجة تسرد أكبر المساهمات. هذا الشرح يدعم قرار الموظف ولا يُغني عن المراجعة البشرية.',
      ],
    },
  ],
};

function formatCategoryLabel(
  category: 'low' | 'medium' | 'high' | undefined,
  language: string
): string | null {
  if (!category) return null;
  const isAr = language === 'ar';
  if (isAr) {
    return category === 'low' ? 'منخفضة' : category === 'medium' ? 'متوسطة' : 'مرتفعة';
  }
  return category === 'low' ? 'Low' : category === 'medium' ? 'Medium' : 'High';
}

function FormulaBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-border/60 bg-muted/60 px-3 py-3 text-xs sm:text-sm leading-relaxed font-mono text-foreground whitespace-pre-wrap">
      {lines.join('\n')}
    </pre>
  );
}

export const LoanRiskInfoPopover: React.FC<LoanRiskInfoPopoverProps> = ({
  language,
  className,
  riskCategory,
}) => {
  const isAr = language === 'ar';
  const sections = isAr ? EXPLANATION_CONTENT.ar : EXPLANATION_CONTENT.en;
  const categoryLabel = formatCategoryLabel(riskCategory, language);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'relative h-11 w-11 shrink-0 rounded-full',
            'border-2 border-[hsl(217,91%,55%)] bg-[hsl(217,91%,48%)] text-white',
            'shadow-md shadow-[hsl(217,91%,48%)]/40',
            'ring-4 ring-[hsl(217,91%,55%)]/25',
            'hover:bg-[hsl(217,91%,42%)] hover:border-[hsl(217,91%,48%)] hover:scale-105 hover:shadow-lg hover:shadow-[hsl(217,91%,48%)]/50',
            'focus-visible:ring-[hsl(217,91%,55%)]/50 transition-all duration-200',
            className
          )}
          aria-label={isAr ? 'شرح طريقة حساب المخاطر' : 'Explain risk calculation method'}
        >
          <Info className="h-5 w-5 stroke-[2.5]" aria-hidden />
        </Button>
      </DialogTrigger>

      <DialogContent
        overlayClassName="bg-slate-950/70 backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md"
        className={cn(
          'flex flex-col max-w-3xl w-[calc(100%-2rem)] max-h-[min(92vh,800px)] overflow-hidden p-0 gap-0',
          'border-[hsl(217,70%,88%)] shadow-2xl shadow-slate-900/25 sm:rounded-2xl'
        )}
      >
        <div className="bg-gradient-to-r from-[hsl(217,91%,48%)]/15 via-primary/5 to-transparent px-6 py-5 border-b border-border/60 shrink-0">
          <DialogHeader className="space-y-2 text-start pe-8">
            <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight">
              {isAr ? 'طريقة حساب مخاطر القرض' : 'How loan risk is calculated'}
            </DialogTitle>
            <DialogDescription className="text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'شرح تفصيلي للمعادلات والمؤشرات المستخدمة لإنتاج درجة المخاطر والفئة والإجراء الموصى به.'
                : 'Detailed explanation of the equations and indicators used to produce the risk score, category, and recommended action.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
          {categoryLabel && (
            <p className="text-sm font-semibold text-[hsl(217,91%,42%)] bg-[hsl(217,91%,48%)]/10 border border-[hsl(217,91%,48%)]/20 rounded-lg px-4 py-2.5">
              {isAr
                ? `النتيجة الحالية: مخاطر ${categoryLabel}.`
                : `Current result: ${categoryLabel} risk.`}
            </p>
          )}

          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-lg border border-border/60 bg-background/80 px-4 py-4 space-y-2"
            >
              <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="text-sm text-muted-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="text-sm text-muted-foreground space-y-1.5 list-disc ps-5 leading-relaxed">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.formulas && <FormulaBlock lines={section.formulas} />}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
