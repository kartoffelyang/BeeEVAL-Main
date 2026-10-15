import LightSelect from "./LightSelect";
import clsx from "clsx";
import { useLanguage } from "../contexts/LanguageContext";

export interface SelectOption {
  value: string;
  label: string;
}
interface FancySelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minWidth?: number;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Native keyboard and mobile picker behavior, styled with the shared light tokens. */
export default function FancySelect({
  value,
  options,
  onChange,
  placeholder,
  className,
  minWidth = 140,
  disabled,
  ariaLabel,
}: FancySelectProps) {
  const { language } = useLanguage();
  return (
    <div
      className={clsx("relative max-w-full", className)}
      style={{ minWidth: `min(${minWidth}px, 100%)` }}
    >
      <LightSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={
          ariaLabel ||
          placeholder ||
          (language === "zh" ? "选择选项" : "Select an option")
        }
        className="w-full min-w-0 appearance-none rounded-lg border border-ink/15 bg-surface-raised py-2 pl-3 pr-9 text-sm text-text-secondary hover:border-ink/25 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {!options.some((o) => o.value === value) && (
          <option value="" disabled>
            {placeholder || (language === "zh" ? "请选择" : "Select")}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </LightSelect>
    </div>
  );
}
