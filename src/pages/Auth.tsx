import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Globe, Loader2, AlertCircle } from 'lucide-react';
import { BoPLogo } from '@/components/BoPLogo';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const Auth: React.FC = () => {
  const { signIn, user, isLoading: authLoading } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate input
    try {
      loginSchema.parse({ email, password });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }

    setIsLoading(true);
    
    const { error } = await signIn(email, password);
    
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError(language === 'ar' ? 'بيانات الدخول غير صحيحة' : 'Invalid email or password');
      } else {
        setError(error.message);
      }
      setIsLoading(false);
      return;
    }

    navigate('/dashboard');
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 sidebar-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAzMHYySDI0di0yaDEyem0wLTR2Mkg0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <BoPLogo variant="white" className="w-24 h-24 mb-8" />
          
          <h1 className="text-4xl font-bold text-white mb-4 text-center">
            {language === 'ar' ? 'بنك فلسطين' : 'Bank of Palestine'}
          </h1>
          
          <p className="text-xl text-white/80 text-center max-w-md">
            {t('dashboard.title')}
          </p>
          
          <div className="mt-12 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-white">AI</div>
              <div className="text-sm text-white/70 mt-1">
                {language === 'ar' ? 'ذكاء اصطناعي' : 'Powered'}
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">24/7</div>
              <div className="text-sm text-white/70 mt-1">
                {language === 'ar' ? 'متاح دائماً' : 'Available'}
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">100%</div>
              <div className="text-sm text-white/70 mt-1">
                {language === 'ar' ? 'آمن' : 'Secure'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
        <div className="absolute top-4 right-4">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            className="gap-2"
          >
            <Globe className="h-4 w-4" />
            {language === 'en' ? 'العربية' : 'English'}
          </Button>
        </div>

        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <BoPLogo className="w-16 h-16 mb-4" />
            <h1 className="text-2xl font-bold gradient-text">
              {language === 'ar' ? 'بنك فلسطين' : 'Bank of Palestine'}
            </h1>
          </div>

          <Card className="border-border/50 shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold">
                {t('auth.login')}
              </CardTitle>
              <CardDescription>
                {language === 'ar' 
                  ? 'أدخل بيانات الدخول للوصول إلى لوحة التحكم' 
                  : 'Enter your credentials to access the dashboard'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@bankofpalestine.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="h-11"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-11"
                  />
                </div>
                
                <Button
                  type="submit"
                  className="w-full h-11 gradient-bg hover:opacity-90 transition-opacity"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    t('auth.login')
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {language === 'ar' 
              ? 'تواصل مع قسم تقنية المعلومات للحصول على بيانات الدخول' 
              : 'Contact IT department for login credentials'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
