import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, GestureResponderEvent, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useAppState } from '../state/AppState';
import { useTheme } from '../ui/theme';

const TAP_RADIUS = 9;
const BETWEEN_TAPS = 30;
const MAX_TAP_MS = 220;
const TAP_GAP_MS = 275;
type Touch = { x: number; y: number; at: number };
const distance = (a: Touch, b: Touch) => Math.hypot(a.x - b.x, a.y - b.y);
function location(event: GestureResponderEvent): Touch {
  const point = event.nativeEvent.changedTouches?.[0] ?? event.nativeEvent;
  return { x: point.pageX, y: point.pageY, at: Date.now() };
}

/** The paper's main content only; its controls are outside this detector. */
export function useFeedLike(paperId: string, isCurrent: boolean) {
  const { state, setPaperLiked } = useAppState();
  const liked = state.paperLikes[paperId]?.liked === true;
  const pressed = useRef(liked);
  const feedback = useFeedHeart();
  const select = useCallback((value: boolean) => {
    if (!isCurrent || pressed.current === value) return;
    pressed.current = value;
    setPaperLiked(paperId, value);
    if (value) feedback.pop();
    else feedback.clear();
  }, [feedback.pop, feedback.clear, isCurrent, paperId, setPaperLiked]);

  useEffect(() => {
    pressed.current = liked;
  }, [paperId, liked]);
  const down = useRef<Touch | null>(null);
  const lastTap = useRef<Touch | null>(null);
  const cancelTap = () => { down.current = null; lastTap.current = null; };
  useEffect(() => {
    if (!isCurrent) {
      down.current = null;
      lastTap.current = null;
      feedback.clear();
    }
  }, [feedback.clear, isCurrent]);

  // Observe touch events without claiming the responder. The parent pager
  // still owns the swipe, and the action row never enters this tap target.
  const tapEvents = {
    onTouchStart: (event: GestureResponderEvent) => {
      if (!isCurrent || event.nativeEvent.touches.length !== 1) return cancelTap();
      down.current = location(event);
    },
    onTouchMove: (event: GestureResponderEvent) => {
      if (down.current && distance(down.current, location(event)) > TAP_RADIUS) cancelTap();
    },
    onTouchEnd: (event: GestureResponderEvent) => {
      const began = down.current;
      down.current = null;
      const released = location(event);
      if (!began || event.nativeEvent.touches.length || released.at - began.at > MAX_TAP_MS || distance(began, released) > TAP_RADIUS) {
        lastTap.current = null;
        return;
      }
      const previous = lastTap.current;
      if (previous && began.at - previous.at <= TAP_GAP_MS && distance(previous, began) <= BETWEEN_TAPS) {
        lastTap.current = null;
        select(true);
      } else {
        lastTap.current = released;
      }
    },
    onTouchCancel: cancelTap,
  };

  return { liked, tapEvents, cancelTap, toggle: () => select(!pressed.current), heart: feedback.heart };
}

function useFeedHeart() {
  const { c } = useTheme();
  const initialReducedMotion = useReducedMotion();
  const nativeReducedMotion = useRef(initialReducedMotion);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      nativeReducedMotion.current = value;
    });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) nativeReducedMotion.current = value; }).catch(() => {});
    return () => { alive = false; subscription.remove(); };
  }, []);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    opacity.set(0);
    setVisible(false);
  }, [opacity]);
  const pop = useCallback(() => {
    const quiet = Platform.OS === 'web'
      ? typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
      : nativeReducedMotion.current;
    if (quiet) return;
    if (timer.current) clearTimeout(timer.current);
    setVisible(true);
    opacity.set(0);
    scale.set(0.75);
    opacity.set(withSequence(withTiming(1, { duration: 105 }), withDelay(100, withTiming(0, { duration: 200 }))));
    scale.set(withSequence(withTiming(1.1, { duration: 140 }), withTiming(1, { duration: 170 })));
    timer.current = setTimeout(() => { timer.current = null; setVisible(false); }, 420);
  }, [opacity, scale]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const motion = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));
  const heart = visible ? (
    <View style={styles.overlay} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Animated.View testID="feed-like-heart" style={[styles.badge, { backgroundColor: c.accentSoft }, motion]}>
        <Ionicons name="heart" size={31} color={c.accent} />
      </Animated.View>
    </View>
  ) : null;
  return { clear, heart, pop };
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
});
