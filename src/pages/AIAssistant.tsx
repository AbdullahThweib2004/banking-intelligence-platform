import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  Send,
  User,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Copy,
  RefreshCw,
  BookOpen,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: string[];
  confidence?: number;
}

const suggestedQuestions = {
  en: [
    'What are the loan eligibility requirements?',
    'How do I process a mortgage application?',
    'What documents are required for business loans?',
    'Explain the credit risk assessment process',
  ],
  ar: [
    'ما هي متطلبات أهلية القرض؟',
    'كيف أقوم بمعالجة طلب رهن عقاري؟',
    'ما المستندات المطلوبة للقروض التجارية؟',
    'اشرح عملية تقييم مخاطر الائتمان',
  ],
};

export const AIAssistant: React.FC = () => {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate AI response (replace with actual API call to OpenRouter)
    setTimeout(() => {
      const responses = {
        en: {
          default: `Based on our banking policies and procedures, I can help you with that query. 

Here's what I found:

**Key Points:**
1. All loan applications must include proper identification documents
2. Income verification is required for amounts above ₪50,000
3. The standard processing time is 3-5 business days

**Related Policies:**
- Credit Policy Manual, Section 4.2
- Risk Assessment Guidelines, Chapter 7

Would you like me to provide more specific information about any of these points?`,
          sources: ['Credit Policy Manual v3.2', 'Risk Assessment Guidelines 2024', 'Internal Procedures Handbook'],
        },
        ar: {
          default: `بناءً على سياسات وإجراءات البنك، يمكنني مساعدتك في هذا الاستفسار.

إليك ما وجدته:

**النقاط الرئيسية:**
1. يجب أن تتضمن جميع طلبات القروض وثائق تعريف صحيحة
2. مطلوب التحقق من الدخل للمبالغ التي تزيد عن ₪50,000
3. وقت المعالجة القياسي هو 3-5 أيام عمل

**السياسات ذات الصلة:**
- دليل سياسة الائتمان، القسم 4.2
- إرشادات تقييم المخاطر، الفصل 7

هل تريد مني تقديم معلومات أكثر تحديدًا حول أي من هذه النقاط؟`,
          sources: ['دليل سياسة الائتمان 3.2', 'إرشادات تقييم المخاطر 2024', 'دليل الإجراءات الداخلية'],
        },
      };

      const response = language === 'ar' ? responses.ar : responses.en;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.default,
        timestamp: new Date(),
        sources: response.sources,
        confidence: 94,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleQuestionClick = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  const handleFeedback = (messageId: string, positive: boolean) => {
    toast.success(
      language === 'ar'
        ? 'شكراً على ملاحظاتك!'
        : 'Thank you for your feedback!'
    );
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success(language === 'ar' ? 'تم النسخ!' : 'Copied!');
  };

  const questions = language === 'ar' ? suggestedQuestions.ar : suggestedQuestions.en;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-12rem)] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-foreground">{t('ai.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar'
              ? 'استفسر عن السياسات والإجراءات المصرفية'
              : 'Ask about banking policies and procedures'}
          </p>
        </div>

        <div className="flex-1 flex gap-6 min-h-0">
          {/* Chat Area */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="flex-1 flex flex-col p-0 min-h-0">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <div className="p-4 rounded-full bg-primary/10 mb-4">
                      <Bot className="h-12 w-12 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">
                      {language === 'ar' ? 'مرحباً! كيف يمكنني مساعدتك؟' : 'Hello! How can I help you?'}
                    </h3>
                    <p className="text-muted-foreground max-w-md mb-6">
                      {language === 'ar'
                        ? 'أنا مساعدك الذكي للإجابة على أسئلتك حول السياسات والإجراءات المصرفية'
                        : "I'm your AI assistant for answering questions about banking policies and procedures"}
                    </p>
                    
                    {/* Suggested Questions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
                      {questions.map((question, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          className="justify-start text-left h-auto py-3 px-4 hover:bg-primary/5 hover:border-primary/30"
                          onClick={() => handleQuestionClick(question)}
                        >
                          <HelpCircle className="h-4 w-4 mr-2 flex-shrink-0 text-primary" />
                          <span className="line-clamp-2">{question}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          message.role === 'user' && "flex-row-reverse"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-full flex-shrink-0",
                          message.role === 'user' ? "bg-primary" : "bg-muted"
                        )}>
                          {message.role === 'user' ? (
                            <User className="h-5 w-5 text-primary-foreground" />
                          ) : (
                            <Bot className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        
                        <div className={cn(
                          "flex-1 max-w-[80%]",
                          message.role === 'user' && "text-right"
                        )}>
                          <div className={cn(
                            "rounded-2xl p-4",
                            message.role === 'user'
                              ? "bg-primary text-primary-foreground rounded-tr-md"
                              : "bg-muted rounded-tl-md"
                          )}>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                          
                          {message.role === 'assistant' && (
                            <div className="mt-2 space-y-2">
                              {/* Sources */}
                              {message.sources && (
                                <div className="flex flex-wrap gap-2">
                                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                                  {message.sources.map((source, index) => (
                                    <Badge 
                                      key={index} 
                                      variant="outline" 
                                      className="text-xs"
                                    >
                                      {source}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
                              {/* Confidence & Actions */}
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                {message.confidence && (
                                  <span className="flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" />
                                    {language === 'ar' ? 'الثقة:' : 'Confidence:'} {message.confidence}%
                                  </span>
                                )}
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleFeedback(message.id, true)}
                                  >
                                    <ThumbsUp className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleFeedback(message.id, false)}
                                  >
                                    <ThumbsDown className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleCopy(message.content)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {isLoading && (
                      <div className="flex gap-3">
                        <div className="p-2 rounded-full bg-muted">
                          <Bot className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="bg-muted rounded-2xl rounded-tl-md p-4">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-muted-foreground">{t('ai.thinking')}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Input Area */}
              <div className="p-4 border-t">
                <div className="flex gap-3">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={t('ai.placeholder')}
                    className="flex-1"
                    disabled={isLoading}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="gradient-bg"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {language === 'ar'
                    ? 'قد تحتوي الإجابات على أخطاء. تحقق دائماً من المعلومات المهمة.'
                    : 'Responses may contain errors. Always verify important information.'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="hidden lg:block w-80 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {language === 'ar' ? 'أسئلة مقترحة' : 'Suggested Questions'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {questions.map((question, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    className="w-full justify-start text-left h-auto py-2 px-3 text-sm"
                    onClick={() => handleQuestionClick(question)}
                  >
                    <HelpCircle className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
                    <span className="line-clamp-2">{question}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {language === 'ar' ? 'معلومات المساعد' : 'Assistant Info'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'النموذج' : 'Model'}
                  </span>
                  <Badge variant="outline">GPT-4</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'المستندات المفهرسة' : 'Indexed Docs'}
                  </span>
                  <span className="font-medium">247</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'آخر تحديث' : 'Last Updated'}
                  </span>
                  <span className="font-medium">2024-01-15</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AIAssistant;
