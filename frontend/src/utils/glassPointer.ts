/**
 * Drives the interactive "shine" highlight on every `[data-glass]` surface.
 * A single delegated pointermove listener tracks where the cursor/finger is
 * relative to whichever glass surface it's currently over, and writes that
 * as `--mx`/`--my` CSS custom properties so the surface's shine
 * (see `[data-glass]::after` in index.css) follows it. Call once at startup.
 */
export function initGlassPointer(): () => void {
  let activeEl: HTMLElement | null = null;

  function handlePointerMove(e: PointerEvent) {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-glass]") ?? null;

    if (target !== activeEl) {
      activeEl?.classList.remove("glass-active");
      activeEl = target;
    }

    if (!target) return;

    const rect = target.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    target.style.setProperty("--mx", `${mx}%`);
    target.style.setProperty("--my", `${my}%`);
    target.classList.add("glass-active");
  }

  function handlePointerLeave() {
    activeEl?.classList.remove("glass-active");
    activeEl = null;
  }

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerout", handlePointerLeave, { passive: true });

  return () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerout", handlePointerLeave);
  };
}
