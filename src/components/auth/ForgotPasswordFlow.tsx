import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { requestResetCode, verifyResetCode } from '@/lib/demoPasswordReset';

interface ForgotPasswordFlowProps {
  /** Called once verifyResetCode() has established a real session — same as a normal login success. */
  onSignedIn: () => void;
  onBackToLogin: () => void;
}

type Step = 'email' | 'code';

/**
 * PROTOTYPE ONLY. Verification codes are delivered to one fixed demo
 * inbox, never to the account's own email — see
 * src/lib/demoPasswordReset.ts and supabase/functions/demo-password-reset
 * for the full design/limitations. Never remove the demo notice below
 * without also removing the underlying single-inbox behavior.
 */
export const ForgotPasswordFlow: React.FC<ForgotPasswordFlowProps> = ({ onSignedIn, onBackToLogin }) => {
  const { language } = useLanguage();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await requestResetCode(email.trim());
    setIsLoading(false);
    setInfo(
      language === 'ar'
        ? 'إذا كان هذا الحساب موجودًا، فقد تم إرسال رمز التحقق.'
        : (result.message ?? 'If that account exists, a verification code has been sent.')
    );
    setStep('code');
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await verifyResetCode(email.trim(), code.trim());
    setIsLoading(false);

    if (!result.ok) {
      setError(
        language === 'ar' ? 'رمز غير صحيح أو منتهي الصلاحية.' : (result.error ?? 'Invalid or expired code.')
      );
      return;
    }
    onSignedIn();
  };

  return (
    <>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">
          {language === 'ar' ? 'استعادة الدخول' : 'Forgot password'}
        </CardTitle>
        <CardDescription>
          {step === 'email'
            ? language === 'ar'
              ? 'أدخل البريد الإلكتروني لحسابك المصرفي'
              : 'Enter your bank account email'
            : language === 'ar'
              ? 'أدخل رمز التحقق المكوّن من 6 أرقام'
              : 'Enter the 6-digit verification code'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {language === 'ar'
              ? 'نموذج أولي فقط: تُرسل رموز التحقق مؤقتًا إلى صندوق بريد ثابت مخصص للعرض التوضيحي، وليس إلى بريدك الفعلي.'
              : 'Prototype only: verification codes are temporarily sent to a fixed demo inbox, not your real email.'}
          </AlertDescription>
        </Alert>

        {step === 'email' ? (
          <form onSubmit={handleRequestCode} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="reset-email">{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="name@bankofpalestine.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 gradient-bg hover:opacity-90 transition-opacity" disabled={isLoading || !email.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {language === 'ar' ? 'جارٍ الإرسال...' : 'Sending...'}
                </>
              ) : language === 'ar' ? (
                'إرسال رمز التحقق'
              ) : (
                'Send verification code'
              )}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onBackToLogin} disabled={isLoading}>
              {language === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to login'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            {info && (
              <Alert>
                <AlertDescription>{info}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="reset-code">{language === 'ar' ? 'رمز التحقق' : 'Verification code'}</Label>
              <Input
                id="reset-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={isLoading}
                required
                className="h-11 text-center text-lg tracking-[0.5em]"
              />
            </div>
            <Button type="submit" className="w-full h-11 gradient-bg hover:opacity-90 transition-opacity" disabled={isLoading || code.trim().length !== 6}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {language === 'ar' ? 'جارٍ التحقق...' : 'Verifying...'}
                </>
              ) : language === 'ar' ? (
                'تحقق وتسجيل الدخول'
              ) : (
                'Verify and sign in'
              )}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('email')} disabled={isLoading}>
              {language === 'ar' ? 'إعادة الإرسال' : 'Request a new code'}
            </Button>
          </form>
        )}
      </CardContent>
    </>
  );
};
