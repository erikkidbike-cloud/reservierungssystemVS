// The KidBike wordmark.
//
// Drawn as SVG text rather than loaded as an image, for the same reason
// packages/documents/src/nv-template.ts does it: there is no logo file in this
// repository yet. It reproduces the real mark closely — "Kid" and "Bike" heavy
// and closed up, "e. V." lighter and spaced — and it scales, prints and
// recolours for dark mode without a second asset.
//
// When a real SVG or PNG turns up, drop it in apps/web/public/ and swap the
// body of this component for an <img>; nothing else needs to change, since
// every caller goes through here.

export function BrandMark({
  height = 26,
  title = 'KidBike e. V.',
}: {
  height?: number;
  title?: string;
}) {
  // The viewBox is sized to the drawn text so the component can be asked for a
  // height and get sensible width for free.
  return (
    <svg
      height={height}
      viewBox="0 0 168 32"
      role="img"
      aria-label={title}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <text
        x="0"
        y="24"
        fill="var(--accent)"
        style={{
          font: '700 26px/1 var(--font-sans), system-ui, sans-serif',
          letterSpacing: '-0.02em',
        }}
      >
        KidBike
      </text>
      <text
        x="112"
        y="24"
        fill="var(--accent)"
        style={{
          font: '400 21px/1 var(--font-sans), system-ui, sans-serif',
          letterSpacing: '0.01em',
        }}
      >
        e.V.
      </text>
    </svg>
  );
}
