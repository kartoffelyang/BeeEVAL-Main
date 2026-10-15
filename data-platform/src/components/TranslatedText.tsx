import React from 'react';
import { useTranslatedContent } from '../hooks/useTranslatedContent';

interface Props {
  text: string | undefined | null;
  preTranslated?: string | undefined | null;
  className?: string;
}

const TranslatedText: React.FC<Props> = ({ text, preTranslated, className }) => {
  const { content, loading } = useTranslatedContent(text, preTranslated);

  if (loading) {
    return (
      <span className={className}>
        <span className="inline-block w-3 h-3 border-2 border-ink/20 border-t-blue-400 rounded-full animate-spin mr-2 align-middle" />
        <span className="opacity-50">{content}</span>
      </span>
    );
  }

  return <span className={className}>{content}</span>;
};

export default TranslatedText;
