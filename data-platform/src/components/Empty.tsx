import { useTranslation } from 'react-i18next';

export default function Empty() {
    const { i18n } = useTranslation();
    return <div className="flex h-full min-h-40 items-center justify-center text-sm text-text-muted" role="status">
        {i18n.language.startsWith('zh') ? '暂无数据' : 'No data available'}
    </div>;
}
