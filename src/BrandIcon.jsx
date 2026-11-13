import React from "react";

const BRANDS = {
  linkedin: {
    src: "/brands/linkedin-in-blue.png",
    width: 635,
    height: 540,
  },
};

/** Original brand assets. The surrounding link supplies the accessible label. */
export default function BrandIcon({ brand, size = 21, className = "" }) {
  const asset = BRANDS[brand];
  if (!asset) return null;
  const height = Math.max(21, Number(size) || 21);
  const width = (height * asset.width) / asset.height;
  return (
    <img
      src={asset.src}
      alt=""
      aria-hidden="true"
      className={`brand-mark brand-mark-${brand} ${className}`.trim()}
      width={width}
      height={height}
      draggable="false"
      style={{
        display: "inline-block",
        flexShrink: 0,
        width,
        height,
        objectFit: "contain",
        verticalAlign: "middle",
      }}
    />
  );
}
