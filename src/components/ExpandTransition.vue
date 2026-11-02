<script setup lang="ts">
import { onBeforeUnmount } from "vue";

type Frame = Record<string, string>;
type RunningTransition = {
  animation: Animation;
  overflow: string;
  minHeight: string;
  pointerEvents: string;
};

const properties = [
  "height", "opacity", "paddingTop", "paddingBottom", "marginTop", "marginBottom",
  "borderTopWidth", "borderBottomWidth",
] as const;
const running = new Map<HTMLElement, RunningTransition>();
const interrupted = new WeakMap<HTMLElement, Frame>();

function frame(element: HTMLElement): Frame {
  const computed = getComputedStyle(element);
  return Object.fromEntries(properties.map(property => [property, computed[property]]));
}

function stop(element: HTMLElement, preserveFrame = false) {
  const current = running.get(element);
  if (!current) return;
  if (preserveFrame) interrupted.set(element, frame(element));
  current.animation.onfinish = null;
  current.animation.cancel();
  element.style.overflow = current.overflow;
  element.style.minHeight = current.minHeight;
  element.style.pointerEvents = current.pointerEvents;
  running.delete(element);
}

function transition(element: Element, done: () => void, entering: boolean) {
  if (!(element instanceof HTMLElement)) { done(); return; }
  stop(element, true);
  const previousFrame = interrupted.get(element);
  interrupted.delete(element);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !element.animate) {
    done();
    return;
  }

  const expanded = frame(element);
  const collapsed: Frame = Object.fromEntries(properties.map(property => [property, "0"]));
  const from = previousFrame ?? (entering ? collapsed : expanded);
  const to = entering ? expanded : collapsed;
  const overflow = element.style.overflow;
  const minHeight = element.style.minHeight;
  const pointerEvents = element.style.pointerEvents;
  element.style.overflow = "hidden";
  element.style.minHeight = "0";
  if (!entering) element.style.pointerEvents = "none";
  const animation = element.animate([from, to], {
    duration: 180,
    easing: "cubic-bezier(.2,.7,.2,1)",
    fill: "both",
  });
  running.set(element, { animation, overflow, minHeight, pointerEvents });
  animation.onfinish = () => {
    stop(element);
    done();
  };
}

function cancel(element: Element) {
  if (element instanceof HTMLElement) stop(element, true);
}

onBeforeUnmount(() => {
  for (const element of running.keys()) stop(element);
});
</script>

<template>
  <Transition
    :css="false"
    @enter="(element, done) => transition(element, done, true)"
    @leave="(element, done) => transition(element, done, false)"
    @enter-cancelled="cancel"
    @leave-cancelled="cancel"
  >
    <slot />
  </Transition>
</template>
