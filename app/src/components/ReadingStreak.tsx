import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { fromDayKey } from '../logic/date';
import type { DayDot } from '../logic/progress';
import { Card, T } from '../ui/kit';
import { radius, space, useTheme } from '../ui/theme';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function ReadingStreak({ days, today, current, longest, freezes, summary }: {
  days: DayDot[];
  today: string;
  current: number;
  longest: number;
  freezes: number;
  summary: string;
}) {
  const { c } = useTheme();
  const active = days.filter((day) => day.active).length;
  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.mark, { backgroundColor: c.accentSoft }]} aria-hidden>
          <Feather name="zap" size={19} color={c.accent} />
        </View>
        <View style={styles.core}>
          <T v="heading">{current > 0 ? `${current}-day reading streak` : 'No active streak'}</T>
          <T v="caption" tone="muted">{active} of 7 days active</T>
        </View>
        <View style={styles.best}>
          <T v="label" tone="muted">Best</T>
          <T v="small" style={styles.bestValue}>{longest} {longest === 1 ? 'day' : 'days'}</T>
        </View>
      </View>

      <View style={styles.week}>
        {days.map((day) => {
          const isToday = day.day === today;
          return (
            <View key={day.day} style={styles.day} accessible accessibilityLabel={`${isToday ? 'Today' : day.day}: ${day.active ? 'active' : 'no activity'}`}>
              <View
                style={[styles.dayMark, {
                  borderColor: isToday ? c.accent : day.active ? c.accent : c.rule,
                  backgroundColor: day.active ? c.accent : isToday ? c.accentSoft : c.surfaceAlt,
                }]}
              >
                <Feather name={day.active ? 'check' : 'minus'} size={13} color={day.active ? c.accentInk : c.muted} />
              </View>
              <T v="caption" tone={isToday ? 'accent' : 'muted'} style={isToday ? styles.today : undefined}>
                {isToday ? 'Today' : DAY_LETTERS[fromDayKey(day.day).getDay()]}
              </T>
            </View>
          );
        })}
      </View>

      <View style={[styles.footer, { borderColor: c.rule }]}>
        <T v="small" tone="muted">{summary}</T>
        {freezes > 0 ? (
          <View style={styles.reserve}>
            <Feather name="shield" size={13} color={c.accent} />
            <T v="caption" tone="accent">{freezes} {freezes === 1 ? 'freeze' : 'freezes'} saved for a missed day</T>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  mark: { width: 34, height: 34, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  core: { flex: 1 },
  best: { alignItems: 'flex-end' },
  bestValue: { fontWeight: '600' },
  week: { flexDirection: 'row', marginVertical: space.m, maxWidth: 360, width: '100%', alignSelf: 'center' },
  day: { flex: 1, alignItems: 'center', gap: space.xs },
  dayMark: { width: 26, height: 26, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  today: { fontWeight: '700' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.s, gap: space.xs },
  reserve: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
