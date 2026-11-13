import React from 'react';
import { Check } from 'lucide-react';
import './company-progress.css';

export const PROGRESS_LABELS = {
  account_created: 'Account created',
  profile_created: 'Profile created',
  cv_uploaded: 'CV uploaded',
  cv_sent: 'CV sent',
  talent_pool_joined: 'Talent pool joined',
  applied: 'Applied',
};

export default function CompanyProgress({ company, open, t = value => value }) {
  const achieved = Object.entries(PROGRESS_LABELS).filter(([event]) => company.progress?.[event] > 0);
  if (!achieved.length) return <span className="muted" title={t('No recorded progress yet')}>—</span>;
  return <button className="company-progress" onClick={open} aria-label={`${t('View progress for')} ${company.name}`} aria-description={achieved.map(([event, label]) => `${t(label)}${company.progress[event] > 1 ? `: ${company.progress[event]}` : ''}`).join(', ')}>
    {achieved.map(([event, label]) => <span key={event}><Check size={12} aria-hidden="true" />{t(label)}{company.progress[event] > 1 && <span className="progress-count">{company.progress[event]}</span>}</span>)}
  </button>;
}
