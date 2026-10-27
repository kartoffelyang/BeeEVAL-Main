import {useTrialAccess, TRIAL_DOMAIN, TRIAL_DOMAINS} from "../contexts/TrialContext";
import React, {
  Children,
  isValidElement,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import clsx from "clsx";
import { useLanguage } from "../contexts/LanguageContext";
import "./light-select.css";

type Option = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};
function text(node: React.ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      isValidElement(n) ? text((n.props as any).children) : String(n),
    )
    .join("");
}
function optionsFrom(children: React.ReactNode, group?: string): Option[] {
  return Children.toArray(children).flatMap((n) => {
    if (!isValidElement(n)) return [];
    const p = n.props as any;
    if (n.type === "option")
      return [
        {
          value: String(p.value ?? text(p.children)),
          label: p.label || text(p.children),
          disabled: !!p.disabled,
          group,
        },
      ];
    return optionsFrom(p.children, n.type === "optgroup" ? p.label : group).map(
      (o) => ({ ...o, disabled: o.disabled || !!p.disabled }),
    );
  });
}
/** One styled, searchable selector for every existing native-select contract. */
export default function LightSelect({
  children,
  value,
  defaultValue,
  onChange,
  className,
  style,
  disabled,
  multiple,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const {trial,guardDomain}=useTrialAccess();
  const { language } = useLanguage();
  const zh = language === "zh";
  const id = useId();
  const native = useRef<HTMLSelectElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    [internal, setInternal] = useState(defaultValue);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 240,
    maxHeight: 320,
    transform: "none",
  });
  const options = useMemo(() => optionsFrom(children), [children]);
  const selected = String(value ?? internal ?? options[0]?.value ?? "");
  const selectedLabel =
    options.find((o) => o.value === selected)?.label ||
    selected ||
    props["aria-label"] ||
    (zh ? "请选择" : "Select");
  const filtered = options.filter((o) =>
    o.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const enabled = filtered
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  const choose = (o: Option) => {
    if (o.disabled || disabled) return;
    if(trial && options.some(x=>x.value===TRIAL_DOMAIN) && (o.value==="" || TRIAL_DOMAINS.includes(o.value)) && !guardDomain(o.value)){close(true);return;}
    const el = native.current;
    if (el) {
      el.value = o.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (value === undefined) setInternal(o.value);
    close(true);
  };
  const show = () => {
    if (disabled) return;
    setQuery("");
    const idx = options.findIndex((o) => o.value === selected && !o.disabled);
    setActive(idx >= 0 ? idx : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };
  const move = (step: number) => {
    const index = enabled.indexOf(active);
    setActive(enabled[(index + step + enabled.length) % enabled.length] ?? -1);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab" && open) {
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open ? move(e.key === "ArrowDown" ? 1 : -1) : show();
    } else if (open && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      setActive(e.key === "Home" ? enabled[0] : enabled[enabled.length - 1]);
    } else if (
      open &&
      (e.key === "Enter" || (e.key === " " && e.target !== search.current))
    ) {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (!open && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      show();
    }
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight,
        vw = window.innerWidth,
        w = Math.min(Math.max(r.width, 240), vw - 24);
      const below = vh - r.bottom - 16,
        above = r.top - 16;
      const height = Math.max(120, Math.min(360, Math.max(below, above)));
      const down = below >= Math.min(240, height) || below >= above;
      setPosition({
        left: Math.max(12, Math.min(r.left, vw - w - 12)),
        top: down ? r.bottom + 7 : r.top - 7,
        transform: down ? "none" : "translateY(-100%)",
        width: w,
        maxHeight: down ? Math.min(360, below) : height,
      });
    };
    place();
    const outside = (e: PointerEvent) => {
      if (
        !trigger.current?.contains(e.target as Node) &&
        !panel.current?.contains(e.target as Node)
      )
        close();
    };
    const scroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) place();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    if (options.length > 7) search.current?.focus();
    else
      (
        panel.current?.querySelector('[role="listbox"]') as HTMLElement
      )?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, options.length]);
  useLayoutEffect(() => {
    if (open)
      panel.current
        ?.querySelector(`[data-option-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  useLayoutEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  if (multiple)
    return (
      <select
        {...props}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        className={className}
        style={style}
        disabled={disabled}
        multiple
      >
        {children}
      </select>
    );
  return (
    <div className="be-select" style={style}>
      <select
        {...props}
        ref={native}
        value={value === undefined ? internal : value}
        onChange={onChange}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="be-select-native"
        onInvalid={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
      >
        {children}
      </select>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={props["aria-label"] || selectedLabel}
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-haspopup="listbox"
        aria-required={props.required}
        disabled={disabled}
        className={clsx("be-select-trigger", className, open && "is-open")}
        onClick={() => (open ? close() : show())}
        onKeyDown={keys}
      >
        <span>{selectedLabel}</span>
        <CaretDownIcon width={15} height={15} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="be-select-panel"
            style={position}
            onKeyDown={keys}
            tabIndex={-1}
          >
            {options.length > 7 && (
              <div className="be-select-search">
                <MagnifyingGlassIcon width={14} height={14} />
                <input
                  ref={search}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={`${id}-list`}
                  aria-activedescendant={
                    filtered[active] ? `${id}-option-${active}` : undefined
                  }
                  aria-label={zh ? "搜索选项" : "Search options"}
                  placeholder={zh ? "搜索选项…" : "Search options…"}
                  value={query}
                  onChange={(e) => {
                    const q = e.target.value;
                    setQuery(q);
                    setActive(
                      options
                        .filter((o) =>
                          o.label
                            .toLocaleLowerCase()
                            .includes(q.toLocaleLowerCase()),
                        )
                        .findIndex((o) => !o.disabled),
                    );
                  }}
                />
              </div>
            )}
            <div
              role="listbox"
              tabIndex={-1}
              id={`${id}-list`}
              aria-label={props["aria-label"] || selectedLabel}
              aria-activedescendant={
                filtered[active] ? `${id}-option-${active}` : undefined
              }
              className="be-select-options"
            >
              {filtered.length ? (
                filtered.map((o, i) => (
                  <React.Fragment key={`${o.value}-${i}`}>
                    {o.group && o.group !== filtered[i - 1]?.group && (
                      <div className="be-select-group">{o.group}</div>
                    )}
                    <div
                      role="option"
                      id={`${id}-option-${i}`}
                      aria-selected={o.value === selected}
                      aria-disabled={o.disabled}
                      data-option-index={i}
                      className={clsx(
                        "be-select-option",
                        i === active && "is-active",
                        o.value === selected && "is-selected",
                        o.disabled && "is-disabled",
                      )}
                      onPointerMove={() => !o.disabled && setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                    >
                      <span>{o.label}</span>
                      {o.value === selected && (
                        <CheckIcon width={15} height={15} />
                      )}
                    </div>
                  </React.Fragment>
                ))
              ) : (
                <div className="be-select-empty">
                  {zh ? "没有匹配选项" : "No matching options"}
                </div>
              )}
            </div>
          </div>,
          trigger.current?.closest("dialog") || document.body,
        )}
    </div>
  );
}
