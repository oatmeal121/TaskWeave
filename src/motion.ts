import type { ObjectDirective } from "vue";

const pageAnimations = new WeakMap<HTMLElement, Animation[]>();

function cancelPageAnimations(element: HTMLElement) {
  pageAnimations.get(element)?.forEach((animation) => animation.cancel());
  pageAnimations.delete(element);
}

// Animate existing page surfaces without remounting the Gantt chart or forms.
// Keeping fixed overlays out also preserves their viewport positioning and stacking.
export const vPageMotion: ObjectDirective<HTMLElement, string> = {
  updated(element, { value, oldValue }) {
    if (value === oldValue) return;
    cancelPageAnimations(element);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const style = getComputedStyle(element);
    // Production CSS may shorten 180ms to .18s.
    const cssDuration = style.getPropertyValue("--motion-normal").trim();
    const duration = parseFloat(cssDuration) * (cssDuration.endsWith("ms") ? 1 : 1_000);
    const animations = Array.from(element.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .filter((child) => !child.classList.contains("update-banner")
        && !["fixed", "absolute"].includes(getComputedStyle(child).position))
      .map((child) => child.animate([{ opacity: 0.45 }, { opacity: 1 }], {
        duration: Number.isFinite(duration) ? duration : 180,
        easing: style.getPropertyValue("--motion-ease").trim() || "ease-out",
      }));
    pageAnimations.set(element, animations);
  },
  beforeUnmount: cancelPageAnimations,
};
