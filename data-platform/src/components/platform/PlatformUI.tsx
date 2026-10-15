import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X, Search, AlertCircle } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

export function PlatformHeader({
  index,
  eyebrow,
  title,
  description,
  action,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="pf-header">
      <div>
        <div className="pf-eyebrow">
          <span>{index}</span> {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="pf-header-action">{action}</div>}
    </header>
  );
}
export function PlatformTabs({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const { language } = useLanguage();
  return (
    <nav
      className="pf-tabs"
      aria-label={language === "zh" ? "页面视图" : "Page views"}
    >
      {items.map((i) => (
        <button
          key={i.key}
          aria-pressed={value === i.key}
          className={value === i.key ? "is-active" : ""}
          onClick={() => onChange(i.key)}
        >
          {i.label}
          {i.count != null && <span>{i.count}</span>}
        </button>
      ))}
    </nav>
  );
}
export function PlatformSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
}) {
  const { language } = useLanguage();
  return (
    <label className="pf-search">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          aria-label={language === "zh" ? "清除搜索" : "Clear search"}
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
export function PlatformEmpty({
  title,
  description,
  action,
  error = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={"pf-empty " + (error ? "is-error" : "")}
      role={error ? "alert" : "status"}
    >
      <div className="pf-empty-mark">
        {error ? <AlertCircle size={24} /> : <span>—</span>}
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function PlatformSkeleton() {
  const { language } = useLanguage();
  return (
    <div
      className="pf-skeleton"
      aria-busy="true"
      aria-label={language === "zh" ? "正在加载" : "Loading"}
    >
      <div />
      <div />
      <div />
    </div>
  );
}
export function PlatformDrawer({
  centered = false,
  title,
  eyebrow,
  children,
  onClose,
  footer,
}: {
  centered?: boolean;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { language } = useLanguage();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={centered ? "pf-drawer pf-evidence-modal" : "pf-drawer"}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pf-drawer-inner">
        <header>
          <div>
            {eyebrow && <span className="pf-eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button
            className="pf-icon-button"
            aria-label={language === "zh" ? "关闭详情" : "Close details"}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="pf-drawer-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
}
export function PlatformAction({
  children,
  onClick,
  disabled = false,
  secondary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      className={secondary ? "pf-button secondary" : "pf-button"}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
      <ArrowRight size={15} />
    </button>
  );
}
