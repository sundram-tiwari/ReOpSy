import { View } from 'react-native';
import { useNav } from '../navigation/types';
import { config } from '../config';
import { IconButton, Screen, SectionTitle, T } from '../ui/kit';
import { space } from '../ui/theme';

const RULES: [string, string][] = [
  ['Be respectful', 'Critique the work, not the person. No harassment, hate or personal attacks.'],
  ['Be specific and cite', 'Point to sections, figures, numbers or other papers. Link sources for claims.'],
  ['No plagiarism', 'Do not post other people’s text, figures or full papers. Link to them instead.'],
  ['No spam or self-promotion loops', 'Share your own work when it is relevant to the discussion, not everywhere.'],
  ['No medical advice', 'Discussions about health research are about the research. They are not advice for anyone’s treatment.'],
  ['Mark uncertainty', 'Say when something is a preprint, a hunch, or outside your field.'],
  ['Respect privacy', 'Do not share personal data about others, including unpublished data or reviews you hold in confidence.'],
];

export function GuidelinesScreen() {
  const nav = useNav();
  return (
    <Screen title="Community guidelines" left={<IconButton icon="arrow-left" label="Back" onPress={() => nav.goBack()} />}>
      <T tone="muted">ReOpSy is a place to read and discuss research carefully. These rules apply to profiles, comments, circles and recommendations.</T>
      <View style={{ gap: space.l, marginTop: space.l }}>
        {RULES.map(([title, body], i) => (
          <View key={title}>
            <T v="heading">{`${i + 1}. ${title}`}</T>
            <T tone="muted">{body}</T>
          </View>
        ))}
      </View>
      <SectionTitle>Reporting and enforcement</SectionTitle>
      <T tone="muted">
        Use Report on any post, comment, profile or circle. Moderators review reports and remove content that breaks these rules. Repeated or serious violations lead to account removal. You can block anyone; you will no longer see their content.
      </T>
      <SectionTitle>Grievance officer</SectionTitle>
      <T tone="muted">
        For complaints under India's IT Rules, 2021, write to {config.grievanceEmail}. We acknowledge complaints within 24 hours and resolve them within 15 days.
      </T>
      <T v="small" tone="faint" style={{ marginTop: space.m }} selectable>
        Copyright takedown requests: {config.takedownEmail}
      </T>
    </Screen>
  );
}
