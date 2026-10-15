import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PlayCircle } from 'lucide-react';

/**
 * 公共组件：把 LLM 输出的纯 Markdown 渲染成富文本，
 * 并把指向视频文件（mp4/mov/m4v/webm/mkv）的链接拦截成「点击弹窗播放」。
 *
 * onPlay 接收原始 href（通常是 NAS 全路径或 http(s) 链接），
 * 由调用方决定怎么播放（VideoPlayerModal 内部会自动判断走 NAS 流还是本地流）。
 *
 * 同一份组件被 Dr.bee Lab 和 Ask AI 悬浮面板共用，行为/样式保持一致。
 */
export const MarkdownAnswer: React.FC<{
    text: string;
    onPlay: (path: string, title: string) => void;
    onDetail?: (path: string, title: string) => void;
}> = ({ text, onPlay, onDetail }) => {
    return (
        <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:font-bold prose-headings:text-text-primary prose-strong:text-text-primary text-text-secondary leading-relaxed">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ href, children, ...props }) => {
                        const isVideo = !!href && /\.(mp4|mov|m4v|webm|mkv)(\?|$)/i.test(href);
                        if (isVideo && href) {
                            const label = (Array.isArray(children) ? children.join('') : String(children || '')) || href;
                            return (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (onDetail) onDetail(href, label);
                                        else onPlay(href, label);
                                    }}
                                    className="inline-flex items-center gap-1 text-primary hover:text-primary-light font-medium bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded transition-colors text-sm align-middle no-underline"
                                >
                                    <PlayCircle className="w-3.5 h-3.5" />
                                    {label}
                                </button>
                            );
                        }
                        return (
                            <a href={href} {...props} target="_blank" rel="noopener noreferrer">
                                {children}
                            </a>
                        );
                    },
                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-3">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-3">{children}</ol>,
                    code: ({ children }) => <code className="bg-surface-overlay px-1.5 py-0.5 rounded text-xs font-mono text-primary-light">{children}</code>,
                    blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/30 pl-4 my-3 text-text-muted italic">{children}</blockquote>,
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-3">
                            <table className="min-w-full text-xs border-collapse border border-ink/[0.08]">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-surface-overlay">{children}</thead>,
                    th: ({ children }) => <th className="border border-ink/[0.08] px-3 py-1.5 text-left font-semibold text-text-secondary">{children}</th>,
                    td: ({ children }) => <td className="border border-ink/[0.08] px-3 py-1.5 text-text-secondary">{children}</td>,
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownAnswer;
