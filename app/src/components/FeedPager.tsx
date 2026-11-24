import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { FeedDirection, swipePage } from '../logic/feedPager';

const SPRING = { stiffness: 270, damping: 30, mass: 0.75, overshootClamping: true };
const WHEEL_GAP = 180;

interface FeedPagerProps {
  paperIds: string[];
  index: number;
  active: boolean;
  onChange: (index: number) => void;
  render: (index: number, height: number, isCurrent: boolean) => ReactNode;
}

/** A bounded track, driven directly by the finger, with no scroll container. */
export function FeedPager({ paperIds, index, active, onChange, render }: FeedPagerProps) {
  const host = useRef<View>(null);
  const [height, setHeight] = useState(0);
  const position = useSharedValue(0);
  const locked = useSharedValue(false);
  const dragging = useSharedValue(false);
  const reduceMotion = useReducedMotion();
  const count = paperIds.length;
  const layoutKey = paperIds.join('\u0000');
  const origin = -index * height;

  // Rotating/resizing or removing a triaged card re-anchors the track.
  useLayoutEffect(() => {
    cancelAnimation(position);
    position.set(origin);
    dragging.set(false);
    locked.set(false);
  }, [layoutKey, index, origin, active, dragging, locked, position]);

  const onLayout = (event: LayoutChangeEvent) => {
    const viewport = event.nativeEvent.layout.height;
    setHeight((previous) => (Math.abs(previous - viewport) > 0.5 ? viewport : previous));
  };

  const turn = useCallback(
    (direction: FeedDirection) => {
      const target = index + direction;
      if (!active || height <= 0 || target < 0 || target >= count || locked.get() || dragging.get()) return;
      if (reduceMotion) {
        locked.set(true);
        onChange(target);
        return;
      }
      locked.set(true);
      position.set(
        withSpring(-target * height, SPRING, (finished) => {
          if (finished) runOnJS(onChange)(target);
        }),
      );
    },
    [active, count, dragging, height, index, locked, onChange, position, reduceMotion],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    const node = host.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    let lastWheel = 0;
    let wheelTravel = 0;
    let wheeled = false;
    // Preserve one trackpad gesture across page rerenders and its inertia tail.
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = e.timeStamp;
      if (now - lastWheel > WHEEL_GAP) {
        wheeled = false;
        wheelTravel = 0;
      }
      lastWheel = now;
      if (wheeled) return;
      wheelTravel += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientHeight : 1);
      if (Math.abs(wheelTravel) >= 34) {
        wheeled = true;
        turnRef.current(wheelTravel > 0 ? 1 : -1);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (target && target !== document.body && target !== document.documentElement && !node.contains(target)) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        turnRef.current(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        turnRef.current(-1);
      }
    };
    node.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('keydown', key);
    return () => {
      node.removeEventListener('wheel', wheel);
      document.removeEventListener('keydown', key);
    };
  }, [active]);

  const turnRef = useRef(turn);
  useLayoutEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  const pan = Gesture.Pan()
    .enabled(active && count > 1 && height > 0)
    .maxPointers(1)
    .activeOffsetY([-9, 9])
    .failOffsetX([-22, 22])
    .onStart(() => {
      if (!locked.get()) dragging.set(true);
    })
    .onUpdate((event) => {
      if (!dragging.get() || reduceMotion) return;
      const movement = event.translationY;
      const atEdge = (index === 0 && movement > 0) || (index === count - 1 && movement < 0);
      const offset = atEdge ? Math.sign(movement) * Math.min(height * 0.075, Math.abs(movement) * 0.19) : movement;
      position.set(origin + Math.max(-height, Math.min(height, offset)));
    })
    .onFinalize((event, success) => {
      if (!dragging.get()) return;
      dragging.set(false);
      const target = success ? swipePage(index, count, height, event.translationY, event.velocityY) : index;
      if (reduceMotion) {
        if (target !== index) {
          locked.set(true);
          runOnJS(onChange)(target);
        }
        return;
      }
      locked.set(true);
      position.set(
        withSpring(
          -target * height,
          { ...SPRING, velocity: success ? Math.max(-2000, Math.min(2000, event.velocityY)) : 0 },
          (finished) => {
            if (!finished) return;
            if (target !== index) runOnJS(onChange)(target);
            else locked.set(false);
          },
        ),
      );
    });

  const track = useAnimatedStyle(() => ({ transform: [{ translateY: position.get() }] }));
  const start = Math.max(0, index - 1);
  const end = Math.min(count, index + 2);
  return (
    <View ref={host} onLayout={onLayout} style={styles.viewport} testID="feed-viewport">
      <GestureDetector gesture={pan} touchAction="pan-x" enableContextMenu>
        <View style={styles.gestureSurface} collapsable={false}>
          <Animated.View style={[styles.track, track]}>
            {(height > 0 ? paperIds.slice(start, end) : []).map((id, offset) => {
              const page = start + offset;
              const visible = page === index;
              const webAccessibility = Platform.OS === 'web' ? ({ 'aria-hidden': !visible } as const) : {};
              return (
                <View
                  key={id}
                  testID={visible ? 'feed-active-page' : undefined}
                  accessibilityElementsHidden={!visible}
                  importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
                  pointerEvents={visible ? 'auto' : 'none'}
                  {...webAccessibility}
                  style={[styles.page, { height, top: page * height }]}
                >
                  {render(page, height, visible)}
                </View>
              );
            })}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const webContain = Platform.OS === 'web' ? ({ overscrollBehaviorY: 'none' } as ViewStyle) : {};
const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden', ...webContain },
  gestureSurface: { flex: 1, minHeight: 0 },
  track: { flex: 1, overflow: 'visible' },
  page: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
});
