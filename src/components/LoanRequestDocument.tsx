import { BoPLogo } from '@/components/BoPLogo';
import { cn } from '@/lib/utils';

export interface LoanRequestDocumentData {
  accountNumber: string;
  customerName: string;
  nationalId: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  existingLoans: number;
  employmentType: string;
  jobRole?: string | null;
  salaryCurrency?: string | null;
  requestedAmount: number;
  /** PNG data URL, or null while the document is being previewed pre-signature. */
  signatureDataUrl?: string | null;
  /** ISO date string; when omitted, the current date is shown (pre-submission preview). */
  date?: string | null;
  /** AI/formula credit risk result, shown on the document when present. */
  riskScore?: number | null;
  riskCategory?: 'low' | 'medium' | 'high' | null;
  recommendedAction?: string | null;
}

interface LoanRequestDocumentProps {
  data: LoanRequestDocumentData;
  language: 'en' | 'ar';
  className?: string;
}

function formatMoney(amount: number, currency: string, language: 'en' | 'ar'): string {
  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

/**
 * The formal, letterhead-style loan request document — rendered identically
 * in three places: the employee's pre-signature preview, the Branch
 * Manager's review screen, and (after approval) the Risk queue's view.
 * Print-friendly (`.loan-request-document` rules in index.css) so "Print /
 * Save as PDF" from the browser produces a clean single-page document.
 */
export function LoanRequestDocument({ data, language, className }: LoanRequestDocumentProps) {
  const currency = data.salaryCurrency || 'ILS';
  const dateLabel = new Date(data.date ?? Date.now()).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const rows: Array<[string, string]> = [
    [language === 'ar' ? 'اسم العميل' : 'Customer Name', data.customerName],
    [language === 'ar' ? 'رقم الهوية الوطنية' : 'National ID', data.nationalId],
    [language === 'ar' ? 'رقم الحساب' : 'Account Number', data.accountNumber],
    [language === 'ar' ? 'نوع التوظيف' : 'Employment Type', data.employmentType],
    ...(data.jobRole ? [[language === 'ar' ? 'المسمى الوظيفي' : 'Job Role', data.jobRole] as [string, string]] : []),
    [language === 'ar' ? 'الدخل الشهري' : 'Monthly Income', formatMoney(data.monthlyIncome, currency, language)],
    [language === 'ar' ? 'المصاريف الشهرية' : 'Monthly Expenses', formatMoney(data.monthlyExpenses, currency, language)],
    [language === 'ar' ? 'القروض الحالية' : 'Existing Loans', formatMoney(data.existingLoans, currency, language)],
  ];

  return (
    <div
      className={cn(
        'loan-request-document mx-auto w-full max-w-[720px] rounded-md border border-border bg-white text-neutral-900 shadow-sm',
        className
      )}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Letterhead */}
      <div className="flex items-center justify-between gap-4 border-b-2 border-primary px-8 py-6">
        <div className="flex items-center gap-3">
          <BoPLogo className="h-12 w-12" />
          <div>
            <p className="text-lg font-bold leading-tight">
              {language === 'ar' ? 'بنك فلسطين' : 'Bank of Palestine'}
            </p>
            <p className="text-xs text-neutral-500">
              {language === 'ar' ? 'طلب تمويل رسمي' : 'Formal Loan Request'}
            </p>
          </div>
        </div>
        <p className="text-xs text-neutral-500">{dateLabel}</p>
      </div>

      <div className="space-y-6 px-8 py-6">
        <h2 className="text-center text-base font-semibold uppercase tracking-wide">
          {language === 'ar' ? 'طلب قرض' : 'Loan Request Document'}
        </h2>

        {/* Customer personal + financial information */}
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-b border-neutral-200 last:border-0">
                <td className="w-1/2 py-2 pe-4 font-medium text-neutral-600">{label}</td>
                <td className="py-2 font-semibold">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Requested amount + formal statement */}
        <div className="rounded-md border border-primary/30 bg-primary/5 px-5 py-4">
          <p className="text-xs font-medium uppercase text-primary">
            {language === 'ar' ? 'مبلغ القرض المطلوب' : 'Requested Loan Amount'}
          </p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {formatMoney(data.requestedAmount, currency, language)}
          </p>
        </div>

        {data.riskScore != null && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-5 py-4">
            <p className="text-xs font-medium uppercase text-neutral-500">
              {language === 'ar' ? 'تقييم المخاطر بالذكاء الاصطناعي' : 'AI Credit Risk Assessment'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-xl font-bold">{data.riskScore}</span>
              {data.riskCategory && (
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase',
                    data.riskCategory === 'low' && 'bg-success/10 text-success',
                    data.riskCategory === 'medium' && 'bg-warning/10 text-warning',
                    data.riskCategory === 'high' && 'bg-destructive/10 text-destructive'
                  )}
                >
                  {language === 'ar'
                    ? { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' }[data.riskCategory]
                    : data.riskCategory}
                </span>
              )}
              {data.recommendedAction && (
                <span className="text-xs text-neutral-500">
                  {language === 'ar' ? 'التوصية: ' : 'Recommendation: '}
                  {language === 'ar'
                    ? { approve: 'موافقة', manual_review: 'مراجعة يدوية', reject: 'رفض' }[data.recommendedAction] ?? data.recommendedAction
                    : data.recommendedAction.replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        )}

        <p className="text-sm leading-relaxed text-neutral-700">
          {language === 'ar'
            ? `أقر أنا الموقع أدناه، ${data.customerName}، حامل الهوية الوطنية رقم ${data.nationalId} وصاحب الحساب رقم ${data.accountNumber}، بأنني أتقدم رسمياً بطلب للحصول على قرض بمبلغ ${formatMoney(data.requestedAmount, currency, language)} من بنك فلسطين، وأن جميع البيانات المالية والشخصية الواردة أعلاه صحيحة على حد علمي.`
            : `I, the undersigned, ${data.customerName}, holder of National ID ${data.nationalId} and account number ${data.accountNumber}, hereby formally request a loan in the amount of ${formatMoney(data.requestedAmount, currency, language)} from Bank of Palestine, and confirm that the personal and financial information above is accurate to the best of my knowledge.`}
        </p>

        {/* Signature section */}
        <div className="pt-4">
          <p className="mb-2 text-xs font-medium uppercase text-neutral-500">
            {language === 'ar' ? 'توقيع العميل' : 'Customer Signature'}
          </p>
          <div className="flex h-[100px] items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50">
            {data.signatureDataUrl ? (
              <img
                src={data.signatureDataUrl}
                alt={language === 'ar' ? 'توقيع العميل' : 'Customer signature'}
                className="max-h-[90px] w-full object-contain"
              />
            ) : (
              <p className="text-xs text-neutral-400">
                {language === 'ar' ? 'بانتظار توقيع العميل' : 'Awaiting customer signature'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
