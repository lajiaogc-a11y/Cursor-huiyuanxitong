import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// TODO: unused - verify before delete (no importers in repo; ts-prune)
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-[calc(1rem+4rem+env(safe-area-inset-bottom,0px))] sm:bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-4 max-w-xs animate-in slide-in-from-bottom-4">
      <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-4">
        <Download className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">{t('安装FastGC应用', 'Install FastGC App')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('安装到桌面，获得更快的访问体验', 'Install to desktop for faster access')}</p>
          <Button size="sm" className="mt-2" onClick={handleInstall}>
            {t('立即安装', 'Install Now')}
          </Button>
        </div>
      </div>
    </div>
  );
}
