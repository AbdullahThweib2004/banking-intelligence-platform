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
  /** Paragraphs rendered after the bullet list (for a caveat/disclaimer following a list). */
  paragraphsAfterBullets?: string[];
}

const EXPLANATION_CONTENT: Record<'en' | 'ar', ExplanationSection[]> = {
  en: [
    {
      title: 'Overview',
      paragraphs: [
        'This assessment is modeled on the Bank of Palestine loan-calculator business rules: a debt burden ratio cap, an age-at-maturity cap, and a standard annuity/EMI installment formula, applied per loan product (Personal, Personal Housing, Mortgage Program).',
        'A deterministic engine built into the application ALWAYS computes the installment, eligibility, and risk score first — this is the source of truth and cannot fail (no network call, no AI). AI is then optionally asked to write a plain-language explanation of that already-final result — it never computes or changes a number.',
        'If AI is disabled, unreachable, or times out, the same deterministic explanation is shown instead, so staff always get a complete result.',
        'Loan restriction flags on a customer profile block submission entirely — restricted customers are not scored.',
      ],
    },
    {
      title: 'Step 1 — Input fields',
      paragraphs: ['The following values are read from the assessment form:'],
      bullets: [
        'Loan type — Personal, Personal Housing, or Mortgage Program (drives which rate model applies)',
        'Loan currency and salary currency (ILS, USD, or JOD)',
        'Monthly salary (I)',
        'Monthly obligations — existing monthly loan/credit payments, used for the debt burden ratio',
        'Requested loan amount (P)',
        'Loan term in years (n years -> n x 12 months)',
        'Client age',
        'Employment type (employed, self-employed, business, or unknown) — a minor scoring factor',
        'Restriction status — if the customer is loan-restricted, assessment is blocked before scoring',
      ],
    },
    {
      title: 'Step 2 — Interest rate resolution',
      paragraphs: ['The effective annual rate depends on the loan product:'],
      bullets: [
        'Personal — a fixed annual rate within a configured band for the loan currency.',
        'Personal Housing / Mortgage Program — an index-based rate (reference index + bank margin), clamped to a configured floor/cap.',
      ],
      paragraphsAfterBullets: [
        'IMPORTANT: the index numbers (standing in for SOFR / JODIBOR / Prime) and the fixed-rate bands are configured constants maintained in code (src/lib/loanProducts.ts), not a live market feed — there is no live rate integration in this system. Every rate shown is labeled "(configured)" for this reason.',
      ],
    },
    {
      title: 'Step 3 — Loan payment (EMI / annuity formula)',
      paragraphs: [
        'The standard declining-balance annuity formula, using the resolved annual rate and the chosen term:',
      ],
      formulas: [
        'r  =  annual rate / 12   (monthly rate)',
        'n  =  loan term in years x 12   (number of months)',
        'M  =  P x [ r(1+r)^n ] / [ (1+r)^n - 1 ]   (monthly installment)',
        'Total repaid  =  M x n',
        'Total interest  =  Total repaid - P',
      ],
    },
    {
      title: 'Step 4 — Eligibility rules (hard pass/fail gates)',
      paragraphs: [
        'These two rules are checked regardless of the risk score. Failing either one makes the application NOT ELIGIBLE, and rejection is recommended even if the score alone looks favorable.',
      ],
      formulas: [
        'Debt burden ratio (DBR)  =  (monthly obligations + M) / monthly salary  <=  50%',
        'Age at maturity  =  client age + loan term (years)  <=  70',
      ],
    },
    {
      title: 'Step 5 — Deterministic risk percentage',
      paragraphs: [
        'A transparent, weighted model — never a black box. Each factor contributes points; the total is clamped to 0-100. Category bands: Low < 40, Medium 40-69, High >= 70 — an ineligible application is always shown as High risk regardless of this raw total.',
      ],
      formulas: [
        'Base  =  5',
        'DBR component        =  (DBR / 50%) x 40         (dominant factor — also a hard eligibility gate)',
        'Age component         =  min(30, (age at maturity / 70) x 20)',
        'Term component        =  min(15, (term years / 30) x 15)',
        'Loan-to-income comp.  =  min(20, (loan / annual salary / 5) x 15)',
        'Obligations pressure  =  min(10, (obligations / salary / 30%) x 10)',
        'Employment adjustment =  employed 0, business +2, self-employed +3, unknown +2',
        'Score  =  clamp(Base + all components above, 0, 100)',
      ],
    },
    {
      title: 'Step 6 — Recommended action & AI explanation',
      paragraphs: [
        'Recommended action: Approve if eligible and Low risk. Manual review if eligible and Medium risk. Reject if High risk OR not eligible (the eligibility gate overrides the score).',
        'When AI is enabled and reachable, it is given the final score, category, eligibility, DBR, age-at-maturity, installment, and top contributing factors, and asked only to write a short explanation of them in plain language — it cannot change any of these numbers. If AI is disabled, fails, or times out, a deterministic explanation is generated directly from the same numbers instead, so the result is never blank.',
      ],
    },
    {
      title: 'Important note',
      paragraphs: [
        'The result view labels whether the shown explanation is "Formula + AI explanation" (hybrid) or "Formula engine (no AI)" so staff always know which path produced the text. This explanation supports staff review — it does not replace final human decision-making.',
      ],
    },
  ],
  ar: [
    {
      title: 'نظرة عامة',
      paragraphs: [
        'يعتمد هذا التقييم على قواعد حاسبة القروض الخاصة ببنك فلسطين: حد أقصى لنسبة عبء الدين، وحد أقصى للعمر عند الاستحقاق، ومعادلة القسط الشهري القياسية (Annuity/EMI)، مطبّقة حسب نوع القرض (شخصي، إسكان شخصي، برنامج رهن عقاري).',
        'يقوم محرك حسابي داخل التطبيق دائماً بحساب القسط والأهلية ودرجة المخاطر أولاً — وهو المصدر الموثوق ولا يمكن أن يفشل (لا يعتمد على شبكة أو AI). بعد ذلك، يُطلب من AI اختيارياً كتابة شرح واضح للنتيجة النهائية فقط — ولا يقوم أبداً بحساب أو تغيير أي رقم.',
        'إذا كان AI معطّلاً أو غير متاح أو استغرق وقتاً طويلاً، يُعرض نفس الشرح الحسابي بدلاً منه، بحيث يحصل الموظف دائماً على نتيجة كاملة.',
        'علامات تقييد القرض على ملف العميل تمنع الإرسال — لا يُحسب تقييم للعملاء المقيّدين.',
      ],
    },
    {
      title: 'الخطوة 1 — حقول الإدخال',
      paragraphs: ['تُقرأ القيم التالية من نموذج التقييم:'],
      bullets: [
        'نوع القرض — شخصي، إسكان شخصي، أو برنامج رهن عقاري (يحدد نموذج المعدل المطبّق)',
        'عملة القرض وعملة الراتب (شيكل، دولار، أو دينار)',
        'الراتب الشهري (I)',
        'الالتزامات الشهرية الحالية — تُستخدم لحساب نسبة عبء الدين',
        'مبلغ القرض المطلوب (P)',
        'مدة القرض بالسنوات (n سنة يعني n×12 شهراً)',
        'عمر العميل',
        'نوع التوظيف (موظف، عمل حر، تجاري، أو غير معروف) — عامل ثانوي في الدرجة',
        'حالة القيود — إذا كان العميل مقيّداً، يُوقف التقييم قبل الحساب',
      ],
    },
    {
      title: 'الخطوة 2 — تحديد معدل الفائدة',
      paragraphs: ['يعتمد المعدل السنوي الفعّال على نوع القرض:'],
      bullets: [
        'شخصي — معدل سنوي ثابت ضمن نطاق معلن حسب عملة القرض.',
        'إسكان شخصي / برنامج رهن عقاري — معدل مرتبط بمؤشر (مؤشر مرجعي + هامش البنك)، محصور بحد أدنى وأقصى معلنين.',
      ],
      paragraphsAfterBullets: [
        'مهم: أرقام المؤشر (التي تمثل SOFR / JODIBOR / Prime) والنطاقات الثابتة هي قيم مُعدّة يدوياً في الكود (src/lib/loanProducts.ts)، وليست تغذية سوقية حية — لا يوجد أي ربط حي بمؤشرات الفائدة في هذا النظام. كل معدل معروض مُعلَّم بعبارة "(مُعدّ يدوياً)" لهذا السبب.',
      ],
    },
    {
      title: 'الخطوة 3 — القسط الشهري (معادلة Annuity/EMI)',
      paragraphs: ['معادلة الاستهلاك المتناقص القياسية، باستخدام المعدل السنوي المحدد والمدة المختارة:'],
      formulas: [
        'r  =  المعدل السنوي ÷ 12   (المعدل الشهري)',
        'n  =  مدة القرض بالسنوات × 12   (عدد الأشهر)',
        'M  =  P × [ r(1+r)ⁿ ] ÷ [ (1+r)ⁿ − 1 ]   (القسط الشهري)',
        'إجمالي المسدد  =  M × n',
        'إجمالي الفوائد  =  إجمالي المسدد − P',
      ],
    },
    {
      title: 'الخطوة 4 — قواعد الأهلية (حدود صارمة)',
      paragraphs: [
        'يتم فحص هذين الشرطين بغض النظر عن درجة المخاطر. تجاوز أي منهما يجعل الطلب غير مؤهل، ويوصى بالرفض حتى لو بدت الدرجة وحدها جيدة.',
      ],
      formulas: [
        'نسبة عبء الدين (DBR)  =  (الالتزامات الشهرية + M) ÷ الراتب الشهري  ≤  50%',
        'العمر عند الاستحقاق  =  عمر العميل + مدة القرض (سنوات)  ≤  70',
      ],
    },
    {
      title: 'الخطوة 5 — نسبة المخاطر المحسوبة',
      paragraphs: [
        'نموذج مرجّح وشفاف تماماً — ليس صندوقاً أسود. كل عامل يساهم بنقاط، ويُحدّ المجموع بين 0 و100. فئات المخاطر: منخفضة < 40، متوسطة 40–69، مرتفعة ≥ 70 — الطلب غير المؤهل يُعرض دائماً كمخاطر مرتفعة بغض النظر عن هذا المجموع الخام.',
      ],
      formulas: [
        'القاعدة  =  5',
        'أثر نسبة عبء الدين  =  (DBR ÷ 50%) × 40   (العامل الأهم — وأيضاً شرط أهلية صارم)',
        'أثر العمر  =  min(30, (العمر عند الاستحقاق ÷ 70) × 20)',
        'أثر المدة  =  min(15, (مدة السنوات ÷ 30) × 15)',
        'أثر نسبة القرض للدخل  =  min(20, (القرض ÷ الراتب السنوي ÷ 5) × 15)',
        'أثر ضغط الالتزامات  =  min(10, (الالتزامات ÷ الراتب ÷ 30%) × 10)',
        'أثر التوظيف  =  موظف 0 · تجاري +2 · عمل حر +3 · غير معروف +2',
        'الدرجة  =  clamp(القاعدة + كل الآثار أعلاه, 0, 100)',
      ],
    },
    {
      title: 'الخطوة 6 — الإجراء الموصى به وشرح AI',
      paragraphs: [
        'الإجراء الموصى به: موافقة إذا كان مؤهلاً ومخاطر منخفضة · مراجعة يدوية إذا كان مؤهلاً ومخاطر متوسطة · رفض إذا كانت المخاطر مرتفعة أو غير مؤهل (شرط الأهلية يتجاوز الدرجة).',
        'عند تفعيل AI وتوفره، يُعطى الدرجة والفئة والأهلية ونسبة عبء الدين والعمر عند الاستحقاق والقسط وأهم العوامل النهائية، ويُطلب منه فقط كتابة شرح موجز بلغة واضحة — لا يمكنه تغيير أي من هذه الأرقام. إذا كان AI معطّلاً أو فشل أو استغرق وقتاً طويلاً، يُولَّد شرح حسابي مباشرة من نفس الأرقام بدلاً منه، بحيث لا تكون النتيجة فارغة أبداً.',
      ],
    },
    {
      title: 'ملاحظة مهمة',
      paragraphs: [
        'تُظهر شاشة النتيجة ما إذا كان الشرح المعروض "محرك حسابي + شرح بالذكاء الاصطناعي" (مختلط) أو "محرك حسابي (بدون AI)"، بحيث يعرف الموظف دائماً أي مسار أنتج النص. هذا الشرح يدعم قرار الموظف ولا يُغني عن المراجعة البشرية.',
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
                ? 'شرح تفصيلي لقواعد حاسبة القروض والمعادلات المستخدمة لإنتاج القسط الشهري، الأهلية، درجة المخاطر، والإجراء الموصى به.'
                : 'Detailed explanation of the loan-calculator rules and equations used to produce the installment, eligibility, risk percentage, and recommended action.'}
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
              {section.paragraphsAfterBullets?.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="text-sm text-muted-foreground leading-relaxed italic">
                  {paragraph}
                </p>
              ))}
              {section.formulas && <FormulaBlock lines={section.formulas} />}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
