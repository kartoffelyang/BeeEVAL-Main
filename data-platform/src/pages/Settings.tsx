import { Settings as SettingsIcon } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Settings() {
    const { language, t } = useLanguage();
    return <div className="p-8 max-w-6xl mx-auto space-y-8">
        <div><h1 className="text-2xl flex items-center gap-2"><SettingsIcon className="w-7 h-7 text-secondary" />{t('settings')}</h1>
            <p className="text-sm text-text-muted mt-2">{language === 'zh' ? '平台设置与偏好' : 'Platform settings and preferences'}</p></div>
        <div className="py-16 border-t border-ink/10 text-center text-text-muted">
            <SettingsIcon className="w-8 h-8 mx-auto mb-5" />
            <p className="text-sm">{language === 'zh' ? '设置功能尚未开放。' : 'Settings are not available yet.'}</p>
        </div>
    </div>;
}
