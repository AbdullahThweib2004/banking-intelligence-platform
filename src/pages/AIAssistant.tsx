import React, { useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { answerQuestion, getAllChunks } from '@/lib/rag';
import { useAIChat, type ChatMessage } from '@/contexts/AIChatContext';

// A mixed English/Arabic set so users can try both languages directly.
const suggestedQuestions = [
  'What documents are required for a bank loan?',
  'ما هي المستندات المطلوبة للتقديم على قرض؟',
  'What is the minimum deposit for a savings account?',
  'ما هو الحد الأدنى للإيداع لفتح حساب توفير؟',
  'When should a complaint be escalated?',
  'متى يجب تصعيد شكوى العميل؟',
];

const isArabicText = (text: string) => /[\u0600-\u06FF]/.test(text);

export const AIAssistant: React.FC = () => {
  const { t, language } = useLanguage();
  const {
    messages,
    input,
    isLoading,
    setInput,
    appendMessage,
    setIsLoading,
    clearConversation,
  } = useAIChat();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allChunks = getAllChunks();
  const indexedSectionsCount = allChunks.length;
  const indexedDocsCount = new Set(allChunks.map((c) => c.fileName)).size;

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    const query = input;
    const historySnapshot = messages;
    appendMessage(userMessage);
    setInput('');
    setIsLoading(true);

    try {
      const result = await answerQuestion(query, {
        history: historySnapshot.map((m) => ({
          role: m.role,
          content: m.content,
          hadSources: Boolean(m.sources?.length),
        })),
      });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.answer,
        timestamp: new Date(),
        sources: result.found ? result.citations : undefined,
      };

      appendMessage(assistantMessage);
    } finally {
      setIsLoading(false);
    }
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

  const questions = suggestedQuestions;

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-12rem)] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('ai.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar'
                ? 'اسأل عن سياسات البنك والإجراءات والمنتجات والإرشادات الداخلية فقط'
                : 'Ask about bank policies, procedures, products, and internal guidelines only'}
            </p>
          </div>
          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={clearConversation}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
              {language === 'ar' ? 'محادثة جديدة' : 'New chat'}
            </Button>
          )}
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
                        : "I answer from the bank's internal knowledge base — policies, procedures, and guidelines only"}
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
                          <span className="line-clamp-2" dir={isArabicText(question) ? 'rtl' : 'ltr'}>
                            {question}
                          </span>
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
                            <p
                              className={cn(
                                "whitespace-pre-wrap",
                                isArabicText(message.content) ? "text-right" : "text-left"
                              )}
                              dir={isArabicText(message.content) ? 'rtl' : 'ltr'}
                            >
                              {message.content}
                            </p>
                          </div>
                          
                          {message.role === 'assistant' && (
                            <div className="mt-2 space-y-2">
                              {/* Sources */}
                              {message.sources && message.sources.length > 0 && (
                                <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                                    <BookOpen className="h-3.5 w-3.5" />
                                    {language === 'ar' ? 'المصادر' : 'Sources'}
                                  </div>
                                  <div className="space-y-1">
                                    {message.sources.map((source, index) => (
                                      <div key={index} className="flex items-center gap-1.5 text-xs">
                                        <span className="font-mono text-foreground">{source.fileName}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span
                                          className="text-muted-foreground"
                                          dir={isArabicText(source.sectionTitle) ? 'rtl' : 'ltr'}
                                        >
                                          {source.sectionTitle}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
                    ? 'يجيب المساعد من قاعدة المعرفة المصرفية الداخلية فقط. تحقق دائماً من المعلومات المهمة.'
                    : 'Answers come from the internal bank knowledge base only. Always verify important information.'}
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
                    <span className="line-clamp-2" dir={isArabicText(question) ? 'rtl' : 'ltr'}>
                      {question}
                    </span>
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
                    {language === 'ar' ? 'الوضع' : 'Mode'}
                  </span>
                  <Badge variant="outline">
                    {language === 'ar' ? 'قاعدة معرفة السياسات' : 'Policy Knowledge Base'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'المستندات المفهرسة' : 'Indexed Docs'}
                  </span>
                  <span className="font-medium">{indexedDocsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {language === 'ar' ? 'الأقسام' : 'Sections'}
                  </span>
                  <span className="font-medium">{indexedSectionsCount}</span>
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
