import React from "react";
import "./tawdheef-brand.css";

/** Canonical Arabic Grid geometry. The surrounding UI supplies its label. */
export function TawdheefMark({ size = 40, busy = false }) {
  return (
    <svg
      className={`tawdheef-mark${busy ? " is-busy" : ""}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10 40.4H26V59.6H74V40.4H90V75.6H10Z" />
      <rect className="tawdheef-dot tawdheef-dot-a" x="31.333333" y="24.4" width="16" height="16" />
      <rect className="tawdheef-dot tawdheef-dot-b" x="52.666667" y="24.4" width="16" height="16" />
    </svg>
  );
}

export default function TawdheefBrand({ language = "en" }) {
  return (
    <span className="tawdheef-brand" dir="ltr">
      <TawdheefMark />
      <img
        className={`tawdheef-wordmark${language === "ar" ? " tawdheef-wordmark-ar" : ""}`}
        src={`/brand/wordmark-${language === "ar" ? "arabic" : "latin"}-ink.svg`}
        alt=""
        height="21"
      />
    </span>
  );
}
