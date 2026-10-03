declare const process: { env: Record<string, string | undefined> };

const env = (key: string): string | undefined => {
  const v = process.env?.[key];
  return v && v.trim() ? v.trim() : undefined;
};

export interface TopicConfig {
  slug: string;
  label: string;
  icon: string;
  blurb: string;
  /** Regex source; a paper must match it (title + summary) to appear in this topic. */
  terms: string;
}

export const config = {
  deckSize: 10,
  dailyGoals: [5, 10, 15],
  topics: [
    {
      slug: 'ai-mental-health',
      label: 'AI in Mental Health',
      icon: 'heart',
      blurb: 'AI applied to mental health, psychiatry, and therapy',
      terms: 'mental|depress|anxiety|psychiatr|therap|counsel|suicid|well-?being|\\bstress\\b|PTSD|schizo|bipolar|ruminat',
    },
    {
      slug: 'autism-diagnosis',
      label: 'Autism Diagnosis (AI/ML/DL)',
      icon: 'activity',
      blurb: 'AI, ML, and DL models for autism diagnosis and screening',
      terms: 'autis|\\bASD\\b',
    },
    {
      slug: 'blockchain',
      label: 'Blockchain',
      icon: 'link',
      blurb: 'Decentralized ledgers, smart contracts, and consensus protocols',
      terms: 'blockchain|smart contract|ledger|cross-chain|consensus protocol|cryptocurrenc|DeFi|Ethereum|Bitcoin',
    },
    {
      slug: 'quantum-communication',
      label: 'Quantum Communication',
      icon: 'radio',
      blurb: 'Quantum cryptography, QKD, and quantum networks',
      terms: 'quantum (key|communication|network|internet|repeater|channel|teleport)|QKD|entanglement distribution',
    },
    {
      slug: 'surveillance-anomaly-detection',
      label: 'Multi-camera Surveillance & Anomaly Detection',
      icon: 'video',
      blurb: 'Multi-camera tracking, vision surveillance, and anomaly detection',
      terms: 'surveillance|multi-camera|multi-view|CCTV|video anomaly|anomal(y|ous) (event|behaviou?r)|re-identification|tracking',
    },
  ] as TopicConfig[],

  /** Hosted web build; serves /overleaf.html for the Android "Open in Overleaf" hand-off. */
  webAppUrl: env('EXPO_PUBLIC_WEB_APP_URL') || 'https://reopsy-frontend.onrender.com',
  legalBaseUrl: env('EXPO_PUBLIC_LEGAL_BASE_URL') || 'https://example.com/legal/',
  /** Grievance officer contact (IT Rules 2021, Rule 3(2)). Set before launch. */
  grievanceEmail: env('EXPO_PUBLIC_GRIEVANCE_EMAIL') || 'grievance@example.com',
  takedownEmail: env('EXPO_PUBLIC_TAKEDOWN_EMAIL') || 'legal@example.com',
  /** Shown in the app's copyright notice. Set to the registered author's full name. */
  copyrightHolder: env('EXPO_PUBLIC_COPYRIGHT_HOLDER') || 'the ReOpSy author',
};

export function topicLabel(slug: string): string {
  return config.topics.find((t) => t.slug === slug)?.label || slug;
}

export function topicTerms(): Record<string, string> {
  return Object.fromEntries(config.topics.map((t) => [t.slug, t.terms]));
}
