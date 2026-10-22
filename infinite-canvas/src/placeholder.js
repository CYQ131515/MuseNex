/* ============================================================================
 * placeholder.js — offline, deterministic media placeholders.
 * Used for the demo document and for simulated "generation" results so the
 * canvas never depends on external image hosts.
 * ========================================================================= */

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) h = Math.imul(h ^ String(str).charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

/**
 * Cinematic-looking generated frame: gradient sky, city silhouette, neon
 * signs, rain streaks and a film-grain overlay. Pure SVG data URI.
 */
export function generatedImage(label = 'frame', kind = 'image', opts = {}) {
  const seed = hash(label);
  const ratio = opts.ratio && opts.ratio !== 'smart' ? opts.ratio : '16:9';
  const [rw, rh] = String(ratio).split(':').map(Number);
  const width = Math.round(640 * (rw / rh >= 1 ? 1 : rw / rh));
  const height = Math.round(640 * (rw / rh >= 1 ? rh / rw : 1));
  const hue = Math.round(200 + seed * 120) % 360;
  const accent = `hsl(${(hue + 300) % 360} 90% 62%)`;
  const accent2 = `hsl(${(hue + 40) % 360} 85% 58%)`;
  const sky = `hsl(${hue} 65% 14%)`;
  const sky2 = `hsl(${(hue + 30) % 360} 55% 32%)`;

  const buildings = [];
  let x = 0;
  let i = 0;
  while (x < 640) {
    const w = 26 + Math.round(((seed * 97 * (i + 3)) % 1) * 54);
    const h = 90 + Math.round((((seed * 53 * (i + 2)) % 1) * 190));
    buildings.push(`<rect x="${x}" y="${400 - h}" width="${w}" height="${h}" fill="rgba(6,10,20,${0.55 + (i % 3) * 0.12})"/>`);
    // windows
    for (let wy = 400 - h + 14; wy < 380; wy += 18) {
      for (let wx = x + 6; wx < x + w - 6; wx += 12) {
        if ((wx * 7 + wy * 3 + i) % 5 < 2) continue;
        buildings.push(`<rect x="${wx}" y="${wy}" width="4" height="6" fill="rgba(255,214,140,${0.25 + ((wx + wy) % 5) / 10})"/>`);
      }
    }
    x += w + 4;
    i++;
  }

  const rain = [];
  for (let r = 0; r < 46; r++) {
    const rx = (hash(label + r) * 640) | 0;
    const ry = (hash(label + 'y' + r) * 400) | 0;
    const len = 8 + ((hash(label + 'l' + r) * 22) | 0);
    rain.push(`<line x1="${rx}" y1="${ry}" x2="${rx - 5}" y2="${ry + len}" stroke="rgba(210,235,255,0.28)" stroke-width="1"/>`);
  }

  const strip = kind === 'video' ? `
    <rect x="0" y="352" width="640" height="48" fill="rgba(0,0,0,0.35)"/>
    <g fill="rgba(255,255,255,0.55)">
      <rect x="20" y="368" width="10" height="16" rx="2"/><rect x="38" y="368" width="10" height="16" rx="2" opacity="0.55"/>
      <rect x="56" y="368" width="10" height="16" rx="2" opacity="0.4"/><rect x="74" y="368" width="10" height="16" rx="2" opacity="0.3"/>
    </g>` : '';

  const W = width;
  const H = height;
  const sx = W / 640;
  const sy = H / 400;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 640 400" preserveAspectRatio="none">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${sky2}"/><stop offset="0.55" stop-color="${sky}"/><stop offset="1" stop-color="#05070c"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.72" cy="0.28" r="0.55">
        <stop offset="0" stop-color="${accent2}" stop-opacity="0.55"/><stop offset="1" stop-color="${accent2}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="0.2" cy="0.7" r="0.5">
        <stop offset="0" stop-color="${accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="10"/></filter>
      <linearGradient id="refl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.10"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/>
      </linearGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer>
      </filter>
    </defs>
    <rect width="640" height="400" fill="url(#sky)"/>
    <rect width="640" height="400" fill="url(#glow)"/>
    <rect width="640" height="400" fill="url(#glow2)"/>
    <ellipse cx="470" cy="120" rx="150" ry="70" fill="${accent2}" opacity="0.22" filter="url(#blur)"/>
    ${buildings.join('')}
    <rect y="300" width="640" height="100" fill="url(#refl)"/>
    <path d="M0 300 C 160 292, 320 306, 640 296 L640 400 L0 400 Z" fill="rgba(8,14,24,0.55)"/>
    ${rain.join('')}
    ${strip}
    <rect width="640" height="400" filter="url(#grain)" opacity="0.55"/>
    <text x="24" y="382" fill="rgba(255,255,255,0.55)" font-family="Inter,PingFang SC,sans-serif" font-size="13" letter-spacing="1">${escapeXML(
      String(label).slice(0, 34),
    )}</text>
    ${opts.resolution ? `<text x="616" y="382" text-anchor="end" fill="rgba(255,255,255,0.4)" font-family="Inter,PingFang SC,sans-serif" font-size="11">${escapeXML(String(opts.resolution))} · ${ratio}</text>` : ''}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXML(str) {
  return String(str).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}
