import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { LoanRequestDocument } from '@/components/LoanRequestDocument';
import { SavedRiskExplanationView } from '@/components/CreditScoreExplanation';
import type { ApprovalRequest } from '@/lib/approvalRequests';

interface ApprovalCaseFileProps {
  approval: ApprovalRequest;
  language: 'en' | 'ar';
  /** Shown when the current viewer's stage-specific approve is blocked (e.g. Audit missing prior-stage data). */
  blockedMessage?: string | null;
}

/**
 * The complete case file for a loan request: the signed document, every
 * prior stage's decision (who/when), and the Risk-stage rule-engine + AI
 * result — one shared view reused by both the Manager/Risk Approvals page
 * and Audit's own separate dashboard, so the two never drift on what a
 * "full case file" actually contains.
 */
export function ApprovalCaseFile({ approval, language, blockedMessage }: ApprovalCaseFileProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <FileText className="h-4 w-4" />
          {language === 'ar' ? 'طباعة / حفظ كـ PDF' : 'Print / Save as PDF'}
        </Button>
      </div>

      <LoanRequestDocument
        language={language}
        data={{
          accountNumber: approval.accountNumber ?? '',
          customerName: approval.customerName,
          nationalId: approval.nationalId ?? '',
          monthlyIncome: approval.monthlyIncome ?? 0,
          monthlyExpenses: approval.monthlyExpenses ?? 0,
          existingLoans: approval.existingLoans ?? 0,
          employmentType: approval.employmentType ?? '',
          salaryCurrency: approval.salaryCurrency,
          requestedAmount: approval.amount ?? 0,
          signatureDataUrl: approval.signatureDataUrl,
          date: approval.requestDate,
          riskScore: approval.riskScore ?? null,
          riskCategory: approval.riskCategory ?? null,
          recommendedAction: approval.savedRiskExplanation?.recommended_action ?? null,
        }}
      />

      {/* Approval History — full traceability across every stage. */}
      <div className="rounded-lg border border-border p-3 text-sm space-y-1.5">
        <p className="text-xs font-medium uppercase text-muted-foreground mb-1">
          {language === 'ar' ? 'سجل الموافقات' : 'Approval History'}
        </p>
        <p>
          <span className="text-muted-foreground">
            {language === 'ar' ? 'المدير: ' : 'Branch Manager: '}
          </span>
          {approval.managerDecisionByName && approval.managerDecisionAt
            ? `${approval.managerDecisionByName} — ${new Date(approval.managerDecisionAt).toLocaleString()}`
            : (language === 'ar' ? 'لم يُتخذ قرار بعد' : 'No decision yet')}
        </p>
        <p>
          <span className="text-muted-foreground">
            {language === 'ar' ? 'دائرة المخاطر: ' : 'Risk: '}
          </span>
          {approval.riskDecisionByName && approval.riskDecisionAt
            ? `${approval.riskDecisionByName} — ${new Date(approval.riskDecisionAt).toLocaleString()}`
            : (language === 'ar' ? 'لم يُتخذ قرار بعد' : 'No decision yet')}
        </p>
        <p>
          <span className="text-muted-foreground">
            {language === 'ar' ? 'التدقيق: ' : 'Audit: '}
          </span>
          {approval.auditDecisionByName && approval.auditDecisionAt
            ? `${approval.auditDecisionByName} — ${new Date(approval.auditDecisionAt).toLocaleString()}`
            : (language === 'ar' ? 'لم يُتخذ قرار بعد' : 'No decision yet')}
        </p>
      </div>

      {/* Risk-stage rule engine (DBR/age-at-maturity) + AI insights — same
          authoritative view used at the Risk stage. */}
      {approval.savedRiskExplanation && (
        <SavedRiskExplanationView explanation={approval.savedRiskExplanation} language={language} />
      )}

      {blockedMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {blockedMessage}
        </div>
      )}
    </div>
  );
}
