import React from 'react';
import { cn } from '@/lib/utils';
import type {
  CreditScoreResult,
  DerivedFeatures,
  RecommendedAction,
  ResultSource,
  SavedRiskExplanation,
  SavedTopFactor,
} from '@/lib/creditScoring';
import { LOAN_PRODUCTS } from '@/lib/loanProducts';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface CreditScoreExplanationProps {
  result: CreditScoreResult;
  language: string;
  className?: string;
}

export interface SavedRiskExplanationViewProps {
  explanation: SavedRiskExplanation;
  language: string;
  className?: string;
}

const categoryStyles = {
  low: 'text-success bg-success/10 border-success/20',
  medium: 'text-warning bg-warning/10 border-warning/20',
  high: 'text-destructive bg-destructive/10 border-destructive/20',
};

function formatAssessedAt(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleString(language === 'ar' ? 'ar' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatMoney(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return '—';
  const value = n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return currency ? `${currency} ${value}` : value;
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

interface NormalizedFactor {
  key: string;
  label: string;
  detail: string;
  increasesRisk: boolean;
  magnitude: string;
}

/** Normalize either a deterministic FeatureContribution or an AI top factor. */
function normalizeFactor(factor: SavedTopFactor, index: number, isAr: boolean): NormalizedFactor {
  if ('labelEn' in factor) {
    const increasesRisk = factor.impact > 0;
    return {
      key: factor.key ?? `f-${index}`,
      label: isAr ? factor.labelAr : factor.labelEn,
      detail: factor.displayValue,
      increasesRisk,
      magnitude: `${factor.impact > 0 ? '+' : ''}${factor.impact.toFixed(1)}`,
    };
  }

  const increasesRisk = !/decreas/i.test(factor.direction);
  return {
    key: `${factor.label}-${index}`,
    label: factor.label,
    detail: factor.value,
    increasesRisk,
    magnitude: factor.impact,
  };
}

function TopFactorsList({
  factors,
  language,
}: {
  factors: SavedTopFactor[];
  language: string;
}) {
  const isAr = language === 'ar';

  if (!factors || factors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {isAr ? 'لا توجد عوامل مسجلة.' : 'No factors recorded.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {factors.map((factor, index) => {
        const f = normalizeFactor(factor, index, isAr);
        return (
          <div
            key={f.key}
            className="flex items-start gap-2 rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm"
          >
            {f.increasesRisk ? (
              <TrendingUp className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            ) : (
              <TrendingDown className="h-4 w-4 text-success shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">{f.label}</p>
              {f.detail ? (
                <p className="text-xs text-muted-foreground mt-0.5">{f.detail}</p>
              ) : null}
            </div>
            <span
              className={cn(
                'font-mono text-xs shrink-0 capitalize',
                f.increasesRisk ? 'text-destructive' : 'text-success'
              )}
            >
              {f.magnitude}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Loan-calculator result fields: type, currency, rate, installment, interest, DBR, age-at-maturity. */
function LoanCalculatorPanel({
  features,
  language,
}: {
  features: DerivedFeatures;
  language: string;
}) {
  const isAr = language === 'ar';
  const product = LOAN_PRODUCTS[features.loan_type];
  const eligible = features.eligibility_status === 'eligible';

  const rows: [string, string][] = [
    [isAr ? 'نوع القرض' : 'Loan Type', isAr ? product.labelAr : product.labelEn],
    [isAr ? 'العملة' : 'Currency', features.loan_currency],
    [isAr ? 'المعدل السنوي المستخدم' : 'Annual Rate Used', formatPct(features.annual_interest_rate_used)],
    [isAr ? 'مدة القرض' : 'Loan Term', `${features.loan_term_years} ${isAr ? 'سنة' : 'yrs'}`],
    [isAr ? 'القسط الشهري' : 'Monthly Installment', formatMoney(features.monthly_installment, features.loan_currency)],
    [isAr ? 'إجمالي الفوائد' : 'Total Interest', formatMoney(features.total_interest, features.loan_currency)],
    [isAr ? 'إجمالي المسدد' : 'Total Repaid', formatMoney(features.total_repaid, features.loan_currency)],
    [isAr ? 'نسبة عبء الدين (DBR)' : 'Debt Burden Ratio (DBR)', `${formatPct(features.debt_burden_ratio)} / 50%`],
    [
      isAr ? 'العمر عند الاستحقاق' : 'Age at Maturity',
      features.age_at_maturity == null
        ? isAr ? 'غير محدد' : 'not provided'
        : `${features.age_at_maturity} / 70`,
    ],
  ];

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
          eligible
            ? 'border-success/30 bg-success/10 text-success'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        )}
      >
        {eligible ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span>
          {eligible
            ? isAr ? 'مؤهل وفق قواعد نسبة عبء الدين والعمر عند الاستحقاق' : 'Eligible under the DBR and age-at-maturity rules'
            : isAr ? 'غير مؤهل — تم تجاوز حد نسبة عبء الدين أو العمر عند الاستحقاق' : 'Not eligible — the DBR or age-at-maturity cap was breached'}
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded bg-background p-3 border border-border/60">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="font-medium text-foreground text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DerivedFeaturesPanel({
  features,
  language,
}: {
  features: DerivedFeatures;
  language: string;
}) {
  const isAr = language === 'ar';

  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-sm text-foreground mb-2">
        {isAr ? 'مؤشرات إضافية (تراثية)' : 'Additional legacy indicators'}
      </summary>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded bg-background p-3 border border-border/60">
        {[
          [isAr ? 'الدخل الشهري' : 'Monthly income', features.monthly_income],
          [isAr ? 'المصاريف الشهرية' : 'Monthly expenses', features.monthly_expenses],
          [isAr ? 'الالتزامات الشهرية' : 'Monthly obligations', features.monthly_obligations],
          [isAr ? 'الدخل المتاح' : 'Disposable income', features.disposable_income],
          [isAr ? 'نوع التوظيف' : 'Employment', features.employment_type],
          [isAr ? 'الغرض من القرض' : 'Loan purpose', features.loan_purpose],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function ScoreHeader({
  score,
  category,
  language,
}: {
  score: number;
  category: 'low' | 'medium' | 'high';
  language: string;
}) {
  const isAr = language === 'ar';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {isAr ? 'نسبة المخاطر المحسوبة' : 'Computed risk percentage'}
          </p>
          <p className="text-3xl font-bold">{score}%</p>
        </div>
        <Badge variant="outline" className={cn('capitalize', categoryStyles[category])}>
          {isAr
            ? category === 'low'
              ? 'منخفض'
              : category === 'medium'
                ? 'متوسط'
                : 'مرتفع'
            : `${category} risk`}
        </Badge>
      </div>
      <Progress value={score} className="h-2" />
    </>
  );
}

export const CreditScoreExplanation: React.FC<CreditScoreExplanationProps> = ({
  result,
  language,
  className,
}) => {
  const isAr = language === 'ar';
  const topFactors = result.contributions.filter((c) => Math.abs(c.impact) >= 0.5).slice(0, 6);

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-4 space-y-4', className)}>
      <ScoreHeader score={result.score} category={result.category} language={language} />
      <LoanCalculatorPanel features={result.features} language={language} />
      <div>
        <p className="text-sm font-semibold mb-2">
          {isAr ? 'أهم العوامل المؤثرة في الدرجة' : 'Top factors affecting the score'}
        </p>
        <TopFactorsList factors={topFactors} language={language} />
      </div>
      <DerivedFeaturesPanel features={result.features} language={language} />
    </div>
  );
};

const actionStyles: Record<RecommendedAction, string> = {
  approve: 'text-success bg-success/10 border-success/20',
  manual_review: 'text-warning bg-warning/10 border-warning/20',
  reject: 'text-destructive bg-destructive/10 border-destructive/20',
};

function actionLabel(action: RecommendedAction, isAr: boolean): string {
  if (isAr) {
    return action === 'approve' ? 'الموافقة' : action === 'reject' ? 'الرفض' : 'مراجعة يدوية';
  }
  return action === 'approve' ? 'Approve' : action === 'reject' ? 'Reject' : 'Manual review';
}

/**
 * result_source can be one of 4 values: the two legacy ones ('ai' — AI
 * computed everything, pre-refactor; 'algorithm' — the old math-only
 * fallback) predate this refactor and are shown as "Legacy AI" / "Legacy
 * algorithm" so old saved assessments remain legible. New assessments use
 * 'formula' (deterministic engine only) or 'hybrid' (deterministic engine +
 * an AI-authored narrative on top).
 */
function sourceBadge(source: ResultSource | null | undefined, isAr: boolean): { label: string; icon: React.ReactNode } | null {
  if (!source) return null;
  switch (source) {
    case 'hybrid':
      return {
        label: isAr ? 'محرك حسابي + شرح بالذكاء الاصطناعي' : 'Formula + AI explanation',
        icon: <Sparkles className="h-3 w-3" />,
      };
    case 'formula':
      return { label: isAr ? 'محرك حسابي (بدون AI)' : 'Formula engine (no AI)', icon: null };
    case 'ai':
      return { label: isAr ? 'تقييم AI (قديم)' : 'Legacy AI assessment', icon: null };
    case 'algorithm':
    default:
      return { label: isAr ? 'خوارزمية قديمة' : 'Legacy algorithm', icon: null };
  }
}

export const SavedRiskExplanationView: React.FC<SavedRiskExplanationViewProps> = ({
  explanation,
  language,
  className,
}) => {
  const isAr = language === 'ar';
  const summary =
    explanation.risk_explanation_summary ||
    (isAr ? 'لا يوجد ملخص محفوظ.' : 'No summary saved.');
  const action = explanation.recommended_action ?? null;
  const confidence =
    typeof explanation.risk_confidence === 'number'
      ? `${Math.round(explanation.risk_confidence * 100)}%`
      : null;
  const badge = sourceBadge(explanation.result_source, isAr);
  // Only present when this assessment predates the bank-calculator refactor
  // (loan_type etc. are null) — legacy assessments still render sensibly.
  const hasLoanCalculatorFields = explanation.risk_derived_features?.loan_type != null;

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-4 space-y-4', className)}>
      <ScoreHeader
        score={explanation.risk_score}
        category={explanation.risk_category}
        language={language}
      />

      {(action || confidence || badge) && (
        <div className="flex flex-wrap items-center gap-2">
          {action && (
            <Badge variant="outline" className={cn('capitalize', actionStyles[action])}>
              {isAr ? 'الإجراء الموصى به: ' : 'Recommended: '}
              {actionLabel(action, isAr)}
            </Badge>
          )}
          {confidence && (
            <Badge variant="outline">
              {isAr ? 'الثقة: ' : 'Confidence: '}
              {confidence}
            </Badge>
          )}
          {badge && (
            <Badge variant="secondary" className="gap-1">
              {badge.icon}
              {badge.label}
            </Badge>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {isAr ? 'تاريخ التقييم:' : 'Assessed at:'}{' '}
        <span className="font-medium text-foreground">
          {formatAssessedAt(explanation.assessed_at, language)}
        </span>
      </p>

      {hasLoanCalculatorFields && (
        <LoanCalculatorPanel features={explanation.risk_derived_features} language={language} />
      )}

      <div>
        <p className="text-sm font-semibold mb-1">
          {explanation.ai_explanation
            ? isAr ? 'شرح الذكاء الاصطناعي' : 'AI explanation'
            : isAr ? 'ملخص التقييم' : 'Assessment summary'}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
        {!explanation.ai_explanation && (
          <p className="text-xs text-muted-foreground/70 mt-1 italic">
            {isAr
              ? 'شرح تلقائي (ناتج مباشرة عن الأرقام المحسوبة) — لم يتوفر شرح بالذكاء الاصطناعي لهذا التقييم.'
              : 'Deterministic explanation (generated directly from the computed numbers) — no AI narrative was available for this assessment.'}
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">
          {isAr ? 'أهم العوامل المؤثرة' : 'Top factors affecting the score'}
        </p>
        <TopFactorsList factors={explanation.risk_top_factors} language={language} />
      </div>

      <DerivedFeaturesPanel
        features={explanation.risk_derived_features}
        language={language}
      />
    </div>
  );
};
