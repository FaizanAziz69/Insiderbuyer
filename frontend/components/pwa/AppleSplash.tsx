/**
 * iOS launch images for the installed app.
 *
 * Android builds its splash from the manifest; iOS does not, and without these
 * a cold launch flashes white before the app paints — the clearest tell that
 * an "app" is really a bookmark. Each entry must match a device's exact pixel
 * size and orientation, which is why this is a table rather than one
 * responsive image.
 *
 * Server-rendered into <head>: iOS reads these at "Add to Home Screen" time,
 * so they cannot be injected later by script.
 */
const TWO_X: Array<[number, number]> = [
  [1536, 2048], [1668, 2224], [1668, 2388], [2048, 2732],
  [828, 1792], [750, 1334], [640, 1136],
];
const THREE_X: Array<[number, number]> = [
  [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532], [1125, 2436],
  [1242, 2688], [1242, 2208],
];

export function AppleSplash() {
  return (
    <>
      {TWO_X.map(([w, h]) => (
        <link
          key={`2x-${w}x${h}`}
          rel="apple-touch-startup-image"
          href={`/pwa/splash/splash-${w}x${h}.png`}
          media={`(device-width: ${w / 2}px) and (device-height: ${h / 2}px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)`}
        />
      ))}
      {THREE_X.map(([w, h]) => (
        <link
          key={`3x-${w}x${h}`}
          rel="apple-touch-startup-image"
          href={`/pwa/splash/splash-${w}x${h}.png`}
          media={`(device-width: ${Math.round(w / 3)}px) and (device-height: ${Math.round(h / 3)}px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)`}
        />
      ))}
    </>
  );
}
