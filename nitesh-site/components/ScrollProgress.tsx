// Pure-CSS scroll progress bar (scroll-driven animation, no JS).
// Falls back to invisible (scaleX 0) where unsupported — purely decorative.
export default function ScrollProgress() {
  return <div className="scroll-progress" aria-hidden="true" />;
}
