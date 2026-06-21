import React from 'react';
import { cn } from '@/lib/utils';
import type { CreditScoreResult } from '@/lib/creditScoring';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface CreditScoreExplanationProps {
  result: CreditScoreResult;
  language: string;
  className?: string;
}

const categoryStyles = {
  low: 'text-success bg-success/10 border-success/20',
  medium: 'text-warning bg-warning/10 border-warning/20',
  high: 'text-destructive bg-destructive/10 border-destructive/20',
};

export const CreditScoreExplanation: React.FC<CreditScoreExplanationProps> = ({
  result,
  language,
  className,
}) => {
  const isAr = language === 'ar';
  const topFactors = result.contributions.filter((c) => Math.abs(c.impact) >= 0.5).slice(0, 6);

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-4 space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {isAr ? 'نتيجة تقييم المخاطر' : 'Risk assessment result'}
          </p>
          <p className="text-3xl font-bold">{result.score}</p>
        </div>
        <Badge variant="outline" className={cn('capitalize', categoryStyles[result.category])}>
          {isAr
            ? result.category === 'low'
              ? 'منخفض'
              : result.category === 'medium'
                ? 'متوسط'
                : 'مرتفع'
            : `${result.category} risk`}
        </Badge>
      </div>

      <Progress value={result.score} className="h-2" />

      <div>
        <p className="text-sm font-semibold mb-2">
          {isAr ? 'أهم العوامل المؤثرة (SHAP)' : 'Top factors affecting the score (SHAP-style)'}
        </p>
        <div className="space-y-2">
          {topFactors.map((factor) => {
            const increasesRisk = factor.impact > 0;
            return (
              <div
                key={factor.key}
                className="flex items-start gap-2 rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm"
              >
                {increasesRisk ? (
                  <TrendingUp className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-success shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-snug">
                    {isAr ? factor.labelAr : factor.labelEn}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{factor.displayValue}</p>
                </div>
                <span
                  className={cn(
                    'font-mono text-xs shrink-0',
                    increasesRisk ? 'text-destructive' : 'text-success'
                  )}
                >
                  {increasesRisk ? '+' : ''}
                  {factor.impact.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">
          {isAr ? 'جميع الميزات المشتقة' : 'All derived features'}
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-background p-2 text-[11px] leading-relaxed">
          {JSON.stringify(result.features, null, 2)}
        </pre>
      </details>
    </div>
  );
};
