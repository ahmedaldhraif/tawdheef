import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import "./list-options.css";

/** One native top-layer menu for the less frequent list actions. */
export default function ListOptions({
  onColumns,
  onImport,
  exportUrl,
  t = (value) => value,
}) {
  const id = useId();
  const trigger = useRef(null);
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  const openState = useRef(false);
  const items = () => [...menu.current.querySelectorAll('[role="menuitem"]')];

  function positionMenu() {
    const element = menu.current;
    if (!element || !openState.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const rtl = getComputedStyle(trigger.current).direction === "rtl";
    const preferredLeft = rtl ? anchor.left : anchor.right - width;
    const left = Math.max(8, Math.min(preferredLeft, innerWidth - width - 8));
    const below = anchor.bottom + 5;
    const preferredTop =
      below + height <= innerHeight - 8 ? below : anchor.top - height - 5;
    element.style.left = `${left}px`;
    element.style.top = `${Math.max(8, Math.min(preferredTop, innerHeight - height - 8))}px`;
  }
  function closeMenu(restoreFocus = false) {
    const element = menu.current;
    if (!element) return;
    if (
      typeof element.hidePopover === "function" &&
      element.matches(":popover-open")
    )
      element.hidePopover();
    element.dataset.open = "false";
    openState.current = false;
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function openMenu(focus = "menu") {
    const element = menu.current;
    element.dataset.open = "true";
    openState.current = true;
    setOpen(true);
    if (typeof element.showPopover === "function") element.showPopover();
    positionMenu();
    if (focus === "first") items()[0]?.focus();
    else if (focus === "last") items().at(-1)?.focus();
    else element.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (
        !menu.current.contains(event.target) &&
        !trigger.current.contains(event.target)
      )
        closeMenu();
    };
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  function onMenuKey(event) {
    const controls = items();
    const current = controls.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? controls.length - 1
            : event.key === "ArrowDown"
              ? (current + 1) % controls.length
              : current <= 0
                ? controls.length - 1
                : current - 1;
      controls[index]?.focus();
    } else if (event.key === " " && document.activeElement?.tagName === "A") {
      event.preventDefault();
      document.activeElement.click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const candidates = [
        ...document.querySelectorAll(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ),
      ].filter(
        (element) =>
          !menu.current.contains(element) &&
          element.getClientRects().length &&
          element.tabIndex >= 0,
      );
      const next =
        candidates[
          candidates.indexOf(trigger.current) + (event.shiftKey ? -1 : 1)
        ];
      closeMenu();
      (next || trigger.current)?.focus();
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      const match = controls.find((element) =>
        element.textContent
          .trim()
          .toLocaleLowerCase()
          .startsWith(event.key.toLocaleLowerCase()),
      );
      if (match) {
        event.preventDefault();
        match.focus();
      }
    }
  }
  function choose(action) {
    closeMenu(true);
    action?.();
  }

  return (
    <>
      <button
        ref={trigger}
        id={`${id}-trigger`}
        type="button"
        className="list-options-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={(event) =>
          openState.current
            ? closeMenu(true)
            : openMenu(event.detail === 0 ? "first" : "menu")
        }
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowUp" ? "last" : "first");
          }
        }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        {t("List options")}
      </button>
      {createPortal(
        <div
          ref={menu}
          id={`${id}-menu`}
          popover="auto"
          role="menu"
          tabIndex={-1}
          aria-labelledby={`${id}-trigger`}
          className="list-options-menu"
          data-open={open ? "true" : "false"}
          onKeyDown={onMenuKey}
          onToggle={(event) => {
            const isOpen =
              (event.newState || event.nativeEvent?.newState) === "open";
            openState.current = isOpen;
            setOpen(isOpen);
          }}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => choose(onColumns)}
          >
            {t("Choose columns")}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => choose(onImport)}
          >
            {t("Import list")}
          </button>
          <a
            role="menuitem"
            tabIndex={-1}
            href={exportUrl}
            onClick={() => closeMenu(true)}
          >
            {t("Export CSV")}
          </a>
        </div>,
        document.body,
      )}
    </>
  );
}
