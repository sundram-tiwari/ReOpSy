export const config = {
  deckSize: 10,
  topics: [
    { slug: 'ai-mental-health', label: 'AI in Mental Health', icon: 'heart', blurb: 'AI applied to mental health, psychiatry, and therapy' },
    { slug: 'autism-diagnosis', label: 'Autism Diagnosis using AI/ML/DL', icon: 'activity', blurb: 'AI, ML, and DL models for autism diagnosis and screening' },
    { slug: 'blockchain', label: 'Blockchain', icon: 'link', blurb: 'Decentralized ledgers, smart contracts, and consensus protocols' },
    { slug: 'quantum-communication', label: 'Quantum Communication', icon: 'radio', blurb: 'Quantum cryptography, QKD, and quantum networks' },
    { slug: 'surveillance-anomaly-detection', label: 'Multi-camera Surveillance & Anomaly Detection', icon: 'video', blurb: 'Multi-camera tracking, vision surveillance, and anomaly detection' },
  ],
  // @ts-ignore
  legalBaseUrl: process.env.EXPO_PUBLIC_LEGAL_BASE_URL || 'https://example.com/legal/',
  takedownEmail: 'legal@example.com',
};
