import React from 'react';
import { cn } from '@/lib/utils';
import type {
  CreditScoreResult,
  DerivedFeatures,
  RecommendedAction,
  SavedRiskExplanation,
  SavedTopFactor,
} from '@/lib/creditScoring';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';

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

interface NormalizedFactor {
  key: string;
  label: string;
  detail: string;
  increasesRisk: boolean;
  magnitude: string;
}

/** Normalize either a legacy math FeatureContribution or an AI top factor. */
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

function DerivedFeaturesPanel({
  features,
  language,
}: {
  features: DerivedFeatures;
  language: string;
}) {
  const isAr = language === 'ar';

  return (
    <details className="text-xs text-muted-foreground" open>
      <summary className="cursor-pointer font-medium text-sm text-foreground mb-2">
        {isAr ? 'المؤشرات المالية المشتقة' : 'Derived financial indicators'}
      </summary>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded bg-background p-3 border border-border/60">
        {[
          [isAr ? 'الدخل الشهري' : 'Monthly income', features.monthly_income],
          [isAr ? 'المصاريف الشهرية' : 'Monthly expenses', features.monthly_expenses],
          [isAr ? 'القروض الحالية' : 'Existing loans', features.existing_loans],
          [isAr ? 'مبلغ القرض المطلوب' : 'Requested loan', features.requested_loan_amount],
          [isAr ? 'قسط القرض الجديد (تقديري)' : 'Est. new loan payment', features.estimated_new_loan_payment],
          [isAr ? 'نسبة خدمة الدين' : 'Debt service ratio', `${(features.debt_service_ratio * 100).toFixed(1)}%`],
          [isAr ? 'الدخل المتاح' : 'Disposable income', features.disposable_income],
          [isAr ? 'نوع التوظيف' : 'Employment', features.employment_type],
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
            {isAr ? 'نتيجة تقييم المخاطر' : 'Risk assessment result'}
          </p>
          <p className="text-3xl font-bold">{score}</p>
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
      <div>
        <p className="text-sm font-semibold mb-2">
          {isAr ? 'أهم العوامل المؤثرة (SHAP)' : 'Top factors affecting the score (SHAP-style)'}
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
  const isAi = explanation.result_source === 'ai';

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-4 space-y-4', className)}>
      <ScoreHeader
        score={explanation.risk_score}
        category={explanation.risk_category}
        language={language}
      />

      {(action || confidence || explanation.result_source) && (
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
          {explanation.result_source && (
            <Badge variant="secondary">
              {isAi
                ? isAr
                  ? 'تقييم بالذكاء الاصطناعي'
                  : 'AI assessment'
                : isAr
                  ? 'نموذج حسابي'
                  : 'Algorithm'}
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

      <div>
        <p className="text-sm font-semibold mb-1">
          {isAr ? 'ملخص التقييم' : 'Assessment summary'}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
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
