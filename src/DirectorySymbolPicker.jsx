import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import Flag from "./Flag.jsx";
import {
  getDirectorySymbol,
  getDirectorySymbols,
  listDirectorySymbols,
} from "./directory-symbols.js";
import "./directory-symbols.css";
const arabic = {
  "Flag or icon": "العلم أو الرمز",
  "Choose a flag or icon": "اختيار علم أو رمز",
  "Countries & territories": "الدول والأقاليم",
  Icons: "الرموز",
  Category: "الفئة",
  "All categories": "كل الفئات",
  "Search countries or codes": "ابحث باسم الدولة أو الرمز",
  "Search icons": "ابحث عن رمز",
  "Clear search": "مسح البحث",
  "No matching symbols": "لا توجد رموز مطابقة",
};
export default function DirectorySymbolPicker({
  value,
  onChange,
  t = (text) => text,
}) {
  const locale =
    typeof document === "undefined"
      ? "en"
      : document.documentElement.lang || "en";
  const tr = (text) =>
    t(text) !== text
      ? t(text)
      : locale.startsWith("ar")
        ? arabic[text] || text
        : text;
  const chosen = getDirectorySymbol(value, locale);
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState(
      typeof value === "string" && value.startsWith("icon:")
        ? "icons"
        : "countries",
    ),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [focused, setFocused] = useState(0);
  const trigger = useRef(null),
    search = useRef(null),
    results = useRef(null),
    id = useId();
  const { iconGroups } = useMemo(() => getDirectorySymbols(locale), [locale]);
  const choices = useMemo(() => {
    const result = listDirectorySymbols({
      search: query,
      category: tab === "countries" ? "countries" : category,
      locale,
      limit: 300,
    });
    return tab === "icons"
      ? result.items.filter((item) => item.type === "icon")
      : result.items;
  }, [tab, category, query, locale]);
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  useEffect(() => {
    setFocused(0);
  }, [tab, category, query]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(item) {
    onChange(item.value);
    close();
  }
  function focusChoice(index) {
    const buttons = [...results.current.querySelectorAll('[role="option"]')],
      next = Math.max(0, Math.min(index, buttons.length - 1));
    setFocused(next);
    buttons[next]?.focus();
  }
  return (
    <div
      className="directory-symbol-picker"
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <span className="symbol-field-label">{tr("Flag or icon")}</span>
      <button
        ref={trigger}
        type="button"
        className="symbol-picker-trigger"
        aria-label={tr("Choose a flag or icon")}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Flag value={value} />
        <span>{chosen.label}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div id={id} className="symbol-picker-panel">
          <div
            className="symbol-picker-tabs"
            role="tablist"
            aria-label={tr("Flag or icon")}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "countries"
                  : event.key === "End"
                    ? "icons"
                    : tab === "countries"
                      ? "icons"
                      : "countries";
              setTab(next);
              event.currentTarget
                .querySelector(`[data-symbol-tab="${next}"]`)
                ?.focus();
            }}
          >
            {[
              ["countries", "Countries & territories"],
              ["icons", "Icons"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                data-symbol-tab={key}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
              >
                {tr(label)}
              </button>
            ))}
          </div>
          <div className="symbol-search">
            <Search size={15} />
            <input
              ref={search}
              type="search"
              autoComplete="off"
              aria-label={tr(
                tab === "countries"
                  ? "Search countries or codes"
                  : "Search icons",
              )}
              placeholder={tr(
                tab === "countries"
                  ? "Search countries or codes"
                  : "Search icons",
              )}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusChoice(0);
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (choices.length === 1) choose(choices[0]);
                }
              }}
            />
            {query && (
              <button
                type="button"
                aria-label={tr("Clear search")}
                onClick={() => {
                  setQuery("");
                  search.current?.focus();
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {tab === "icons" && (
            <label className="symbol-category">
              {tr("Category")}
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">{tr("All categories")}</option>
                {iconGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            ref={results}
            className="symbol-choice-grid"
            role="listbox"
            aria-label={tr(
              tab === "countries" ? "Countries & territories" : "Icons",
            )}
            onKeyDown={(event) => {
              const index = Number(event.target.dataset.symbolIndex);
              if (!Number.isInteger(index)) return;
              const rtl = locale.startsWith("ar"),
                steps = {
                  ArrowDown: 2,
                  ArrowUp: -2,
                  ArrowRight: rtl ? -1 : 1,
                  ArrowLeft: rtl ? 1 : -1,
                };
              if (event.key in steps) {
                event.preventDefault();
                focusChoice(index + steps[event.key]);
              }
              if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                focusChoice(event.key === "Home" ? 0 : choices.length - 1);
              }
            }}
          >
            {choices.map((item, index) => (
              <button
                type="button"
                role="option"
                key={item.value}
                className="symbol-choice"
                aria-selected={chosen.value === item.value}
                aria-label={
                  item.type === "country"
                    ? `${item.label} (${item.code})`
                    : item.label
                }
                title={item.label}
                tabIndex={index === focused ? 0 : -1}
                data-symbol-index={index}
                data-symbol-value={item.value}
                onClick={() => choose(item)}
              >
                <Flag value={item.value} />
                <span>{item.label}</span>
                {chosen.value === item.value && <Check size={14} />}
              </button>
            ))}
          </div>
          {!choices.length && (
            <p className="symbol-empty" role="status">
              {tr("No matching symbols")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
