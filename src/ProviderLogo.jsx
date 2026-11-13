import React from 'react';

export const PROVIDER_LOGOS = Object.freeze({
  'icloud-mail': { src: '/brands/apple-mail.jpg', label: 'iCloud Mail' },
  gmail: { src: '/brands/gmail.png', label: 'Gmail' },
  outlook: { src: '/brands/outlook.svg', label: 'Outlook' },
  'google-calendar': { src: '/brands/google-calendar.png', label: 'Google Calendar' },
  'apple-calendar': { src: '/brands/apple-calendar.png', label: 'Apple Calendar' },
  chatgpt: { src: '/brands/chatgpt.svg', label: 'ChatGPT' },
  codex: { src: '/brands/chatgpt.svg', label: 'Codex' },
  claude: { src: '/brands/claude.svg', label: 'Claude' },
  'claude-code': { src: '/brands/claude-code.png', label: 'Claude Code' },
  tabbio: { src: '/brands/tabbio.svg', label: 'Tabbio' },
});

const ALIASES = Object.freeze({
  google: 'gmail', 'google-cli': 'gmail', 'google-workspace': 'gmail',
  microsoft: 'outlook', 'outlook-mcp': 'outlook', 'microsoft-calendar': 'outlook', 'outlook-calendar': 'outlook',
  google_calendar: 'google-calendar', 'gmail-calendar': 'google-calendar',
  icloud: 'apple-calendar', apple: 'apple-calendar', apple_calendar: 'apple-calendar', 'icloud-calendar': 'apple-calendar',
  openai: 'chatgpt', 'openai-codex': 'codex', claude_code: 'claude-code', claudecode: 'claude-code',
  'tabbio-cli': 'tabbio',
});

/** Unchanged provider-owned originals; see THIRD-PARTY-NOTICES.md for provenance. */
export default function ProviderLogo({ provider, size = 24, className = '', decorative = false, alt, style }) {
  const key = ALIASES[provider] || provider;
  const asset = PROVIDER_LOGOS[key];
  if (!asset) return null;
  const dimension = Math.min(128, Math.max(16, Number(size) || 24));
  return (
    <img
      src={asset.src}
      alt={decorative ? '' : alt ?? asset.label}
      aria-hidden={decorative ? true : undefined}
      className={`provider-logo provider-logo-${key} ${className}`.trim()}
      width={dimension}
      height={dimension}
      draggable="false"
      style={{ display: 'inline-block', width: dimension, height: dimension, flexShrink: 0, objectFit: 'contain', verticalAlign: 'middle', colorScheme: 'light', ...style }}
    />
  );
}
