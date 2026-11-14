import React from 'react';
import { Linkedin } from 'lucide-react';

/** The link supplies the name. Use a complete vector glyph, never a cropped bitmap. */
export default function BrandIcon({ brand, size = 14, className = '' }) {
  if (brand !== 'linkedin') return null;
  const dimension = Math.max(12, Number(size) || 14);
  return <Linkedin size={dimension} aria-hidden="true" focusable="false"
    className={`brand-mark brand-mark-linkedin ${className}`.trim()}
    style={{ width: dimension, height: dimension, flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }} />;
}
