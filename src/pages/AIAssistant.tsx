import React, { useRef, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HelpTarget } from '@/components/help';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Bot,
  Send,
  User,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Plus,
  BookOpen,
  History,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAIChat } from '@/contexts/AIChatContext';
import { SuggestedQuestions } from '@/components/SuggestedQuestions';
import { PageOnboardingTour } from '@/components/onboarding/PageOnboardingTour';

const isArabicText = (text: string) => /[\u0600-\u06FF]/.test(text);

function formatHistoryDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleString(language === 'ar' ? 'ar' : 'en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16);
  }
}

interface HistoryListProps {
  history: { id: string; title: string; updated_at: string }[];
  historyLoading: boolean;
  activeConversationId: string | null;
  isLoading: boolean;
  conversationLoading: boolean;
  language: string;
  onSelect: (id: string) => void;
}

function HistoryList({
  history,
  historyLoading,
  activeConversationId,
  isLoading,
  conversationLoading,
  language,
  onSelect,
}: HistoryListProps) {
  if (historyLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-10 px-2">
        <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          {language === 'ar' ? 'لا توجد محادثات سابقة' : 'No previous conversations'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {history.map((item) => {
        const active = activeConversationId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            disabled={isLoading || conversationLoading}
            className={cn(
              'w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors',
              active
                ? 'bg-primary/10 border border-primary/30 text-foreground'
                : 'hover:bg-muted/80 text-foreground border border-transparent'
            )}
          >
            <p
              className="font-medium line-clamp-2 leading-snug"
              dir={isArabicText(item.title) ? 'rtl' : 'ltr'}
            >
              {item.title}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatHistoryDate(item.updated_at, language)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export const AIAssistant: React.FC = () => {
  const { t, language } = useLanguage();
  const {
    messages,
    input,
    isLoading,
    conversationLoading,
    history,
    historyLoading,
    activeConversationId,
    sendError,
    setInput,
    sendMessage,
    startNewChat,
    selectConversation,
  } = useAIChat();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleSelectConversation = async (id: string) => {
    await selectConversation(id);
    setHistoryOpen(false);
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || conversationLoading) return;
    await sendMessage(input);
  };

  const handleSuggestedQuestion = async (question: string) => {
    if (isLoading || conversationLoading) return;
    await sendMessage(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    void handleSend();
  };

  const handleFeedback = (_messageId: string, _positive: boolean) => {
    toast.success(
      language === 'ar' ? 'شكراً على ملاحظاتك!' : 'Thank you for your feedback!'
    );
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success(language === 'ar' ? 'تم النسخ!' : 'Copied!');
  };

  return (
    <DashboardLayout>
      <PageOnboardingTour tourId="ai-assistant" />
      <div className="h-[calc(100vh-12rem)] flex flex-col animate-fade-in">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('ai.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar'
                ? 'اسأل عن سياسات البنك والإجراءات والمنتجات والإرشادات الداخلية فقط'
                : 'Ask about bank policies, procedures, products, and internal guidelines only'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0 md:hidden">
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <History className="h-4 w-4" />
                  {language === 'ar' ? 'السجل' : 'History'}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 flex flex-col">
                <SheetHeader>
                  <SheetTitle>{language === 'ar' ? 'السجل' : 'History'}</SheetTitle>
                </SheetHeader>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 justify-start mt-4"
                  onClick={() => {
                    startNewChat();
                    setHistoryOpen(false);
                  }}
                  disabled={isLoading || conversationLoading}
                >
                  <Plus className="h-4 w-4" />
                  {language === 'ar' ? 'محادثة جديدة' : 'New chat'}
                </Button>
                <ScrollArea className="flex-1 mt-4 -mx-2 px-2">
                  <HistoryList
                    history={history}
                    historyLoading={historyLoading}
                    activeConversationId={activeConversationId}
                    isLoading={isLoading}
                    conversationLoading={conversationLoading}
                    language={language}
                    onSelect={handleSelectConversation}
                  />
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={startNewChat}
              disabled={isLoading || conversationLoading}
            >
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'جديد' : 'New'}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* History sidebar */}
          <HelpTarget
            id="ai-history"
            category={language === 'ar' ? 'المساعد الذكي' : 'AI Assistant'}
            title={language === 'ar' ? 'سجل محادثات المساعد' : 'AI Conversation History'}
            description={language === 'ar'
              ? 'يعرض جميع محادثاتك السابقة مع مساعد المعرفة الذكي. يمكنك استرجاع الجلسات السابقة أو بدء محادثة جديدة كلياً.'
              : 'Displays all your past chat conversations with the AI Knowledge Assistant. You can retrieve previous sessions or start a fresh thread.'}
            actions={language === 'ar'
              ? [
                  'اضغط على "محادثة جديدة" لبدء جلسة نظيفة.',
                  'اختر أي محادثة في القائمة لإعادة تحميل الاستفسارات والإجابات السابقة.'
                ]
              : [
                  'Click "New Chat" to start a clean session.',
                  'Select any conversation in the list to reload past queries and responses.'
                ]}
            className="hidden md:flex shrink-0"
          >
            <Card className="w-72 lg:w-80 flex-col min-h-0 h-full">
              <CardHeader className="pb-3 space-y-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {language === 'ar' ? 'السجل' : 'History'}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 justify-start"
                  onClick={startNewChat}
                  disabled={isLoading || conversationLoading}
                >
                  <Plus className="h-4 w-4" />
                  {language === 'ar' ? 'محادثة جديدة' : 'New chat'}
                </Button>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-0 pt-0">
                <ScrollArea className="h-full px-4 pb-4">
                  <HistoryList
                    history={history}
                    historyLoading={historyLoading}
                    activeConversationId={activeConversationId}
                    isLoading={isLoading}
                    conversationLoading={conversationLoading}
                    language={language}
                    onSelect={handleSelectConversation}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          </HelpTarget>

          {/* Main chat */}
          <HelpTarget
            id="ai-chat"
            category={language === 'ar' ? 'المساعد الذكي' : 'AI Assistant'}
            title={language === 'ar' ? 'لوحة محادثة المساعد الذكي' : 'Interactive AI Chat Console'}
            description={language === 'ar'
              ? 'واجهة ذكاء اصطناعي للاستعلام عن سياسات وقوانين وتعميمات بنك فلسطين الداخلية. يقرأ المحرك المستندات، ويستخرج الأجزاء المعنية، ويعرض المصادر المعتمدة.'
              : 'An AI interface to query internal Bank of Palestine policies, rules, and circulars. The engine reads documents, extracts sections, and shows source citations.'}
            actions={language === 'ar'
              ? [
                  'اضغط على الأسئلة المقترحة للاستعلام الفوري عن سياسات البنك.',
                  'اكتب أسئلتك الخاصة في حقل الإدخال بالأسفل.',
                  'راجع المصادر المذكورة أسفل إجابة المساعد للتحقق من دقة المعلومات.'
                ]
              : [
                  'Click suggested questions to query bank policies instantly.',
                  'Type custom compliance questions in the input field.',
                  'Review source citations below the assistant\'s answer for validation.'
                ]}
            className="flex-1 min-h-0"
          >
            <Card className="flex flex-col min-h-0 h-full" data-tour-target="ai-chat">
              <CardContent className="flex-1 flex flex-col p-0 min-h-0">
                <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                  {conversationLoading ? (
                    <div className="flex items-center justify-center h-full py-16 text-muted-foreground text-sm">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      {language === 'ar' ? 'جارٍ تحميل المحادثة...' : 'Loading conversation...'}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-10 px-4">
                      <div className="p-4 rounded-full bg-primary/10 mb-4">
                        <Bot className="h-12 w-12 text-primary" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">
                        {language === 'ar' ? 'مرحباً! كيف يمكنني مساعدتك؟' : 'Hello! How can I help you?'}
                      </h3>
                      <p className="text-muted-foreground max-w-md text-sm">
                        {language === 'ar'
                          ? 'اختر سؤالاً مقترحاً أو اكتب سؤالك أدناه.'
                          : 'Pick a suggested question or type your own below.'}
                      </p>
                      <SuggestedQuestions
                        onSelect={(q) => void handleSuggestedQuestion(q)}
                        disabled={isLoading || conversationLoading}
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn('flex gap-3', message.role === 'user' && 'flex-row-reverse')}
                        >
                          <div
                            className={cn(
                              'p-2 rounded-full flex-shrink-0',
                              message.role === 'user' ? 'bg-primary' : 'bg-muted'
                            )}
                          >
                            {message.role === 'user' ? (
                              <User className="h-5 w-5 text-primary-foreground" />
                            ) : (
                              <Bot className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>

                          <div
                            className={cn(
                              'flex-1 max-w-[85%]',
                              message.role === 'user' && 'text-right'
                            )}
                          >
                            <div
                              className={cn(
                                'rounded-2xl p-4',
                                message.role === 'user'
                                  ? 'bg-primary text-primary-foreground rounded-tr-md'
                                  : 'bg-muted rounded-tl-md'
                              )}
                            >
                              <p
                                className={cn(
                                  'whitespace-pre-wrap',
                                  isArabicText(message.content) ? 'text-right' : 'text-left'
                                )}
                                dir={isArabicText(message.content) ? 'rtl' : 'ltr'}
                              >
                                {message.content}
                              </p>
                            </div>

                            {message.role === 'assistant' && (
                              <div className="mt-2 space-y-2">
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

                <div className="p-4 border-t">
                  {sendError && (
                    <p className="text-sm text-destructive mb-2 text-center" role="alert">
                      {sendError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('ai.placeholder')}
                      className="flex-1"
                      disabled={isLoading || conversationLoading}
                    />
                    <Button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!input.trim() || isLoading || conversationLoading}
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
          </HelpTarget>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AIAssistant;
