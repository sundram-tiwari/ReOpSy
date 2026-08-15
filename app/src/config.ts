export const config = {
  deckSize: 10,
  topics: [
    { slug: 'ml', label: 'Machine Learning', icon: 'cpu', emoji: '🤖', blurb: 'Learning theory, optimisation, architectures' },
    { slug: 'dl', label: 'Deep Learning', icon: 'layers', emoji: '🧠', blurb: 'Neural networks, architectures' },
    { slug: 'nlp', label: 'Language & NLP', icon: 'type', emoji: '📝', blurb: 'Language models, parsing, translation' },
    { slug: 'cv', label: 'Computer Vision', icon: 'eye', emoji: '👁️', blurb: 'Recognition, generation, 3D, video' },
    { slug: 'ai-health', label: 'AI in Mental Health', icon: 'heart', emoji: '🧘', blurb: 'AI applied to mental health and therapy' },
    { slug: 'llm', label: 'Large Language Models', icon: 'message-square', emoji: '💬', blurb: 'Transformers, fine-tuning, prompting' },
    { slug: 'robotics', label: 'Robotics & Control', icon: 'settings', emoji: '🦾', blurb: 'Kinematics, reinforcement learning' },
    { slug: 'cybersecurity', label: 'Cybersecurity & AI', icon: 'lock', emoji: '🔒', blurb: 'Threat detection, privacy' },
    { slug: 'data-science', label: 'Data Science', icon: 'bar-chart-2', emoji: '📊', blurb: 'Statistics, analytics, data mining' },
    { slug: 'bio', label: 'Computational Biology', icon: 'activity', emoji: '🧬', blurb: 'Genomics, protein structure, bioinformatics' },
  ],
  // @ts-ignore
  legalBaseUrl: process.env.EXPO_PUBLIC_LEGAL_BASE_URL || 'https://example.com/legal/',
  takedownEmail: 'legal@example.com',
};
