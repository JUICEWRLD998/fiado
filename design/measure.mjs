// Measures the Fiado palette: WCAG contrast for every text pair, CIE Lab dE76 between role hues
// ("are these two colours different?" is a dE question, never a contrast-ratio question), and the
// chroma of each role against the surfaces. Pure maths, no dependencies.
//
//   node design/measure.mjs            prints markdown tables
//   node design/measure.mjs --json     prints the same numbers as JSON
//
// The palette below is the single source of truth: src/ui/tokens.css must carry exactly these values.

export const PALETTE = {
  light: {
    paper: [97.6, 0.010, 215], // the book page
    raised: [99.0, 0.006, 215], // a loose slip on top of the book
    sunk: [94.5, 0.014, 215], // the counter under the book
    rule: [84, 0.060, 235], // ruling-blue hairline
    ruleStrong: [62, 0.100, 240],
    ink: [25, 0.075, 262], // biro blue-black
    ink2: [42, 0.060, 262],
    accent: [40, 0.170, 262], // the one call-to-action colour: biro blue
    accentInk: [98, 0.010, 215],
    margin: [52, 0.200, 27], // margin red: refusal, overdue
    tally: [46, 0.100, 155], // tally green: paid, recorded
    highlight: [91, 0.160, 100], // highlighter yellow: a note, a pending state (fill only)
  },
  dark: {
    paper: [21, 0.020, 255],
    raised: [25.5, 0.022, 255],
    sunk: [17.5, 0.018, 255],
    rule: [34, 0.040, 250],
    ruleStrong: [52, 0.070, 245],
    ink: [93, 0.014, 230],
    ink2: [76, 0.020, 235],
    accent: [78, 0.120, 245],
    accentInk: [20, 0.030, 255],
    margin: [72, 0.170, 25],
    tally: [75, 0.130, 155],
    highlight: [34, 0.060, 100],
  },
};

const rad = (d) => (d * Math.PI) / 180;

/** OKLCH -> linear sRGB, with an out-of-gamut flag. L is 0-100. */
export function toLinear([L, C, h]) {
  const l0 = L / 100;
  const a = C * Math.cos(rad(h));
  const b = C * Math.sin(rad(h));
  const l_ = l0 + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l0 - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l0 - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return { rgb: rgb.map((v) => Math.min(1, Math.max(0, v))), inGamut: rgb.every((v) => v >= -0.0005 && v <= 1.0005) };
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function contrast(fg, bg) {
  const a = luminance(toLinear(fg).rgb) + 0.05;
  const b = luminance(toLinear(bg).rgb) + 0.05;
  return a > b ? a / b : b / a;
}

/** Linear sRGB -> CIE Lab (D65). */
export function lab(color) {
  const [r, g, b] = toLinear(color).rgb;
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const deltaE = (p, q) => Math.hypot(...lab(p).map((v, i) => v - lab(q)[i]));
export const labChroma = (p) => Math.hypot(lab(p)[1], lab(p)[2]);

const fmt = (n, d = 2) => n.toFixed(d);

export function report() {
  const out = { gamut: [], contrast: [], deltaE: [], chroma: [] };
  for (const [theme, p] of Object.entries(PALETTE)) {
    for (const [name, c] of Object.entries(p)) if (!toLinear(c).inGamut) out.gamut.push(`${theme}.${name} oklch(${c[0]}% ${c[1]} ${c[2]}) is outside sRGB and is clamped`);

    const text = [
      ['ink', 'paper', 4.5], ['ink', 'raised', 4.5], ['ink', 'sunk', 4.5],
      ['ink2', 'paper', 4.5], ['ink2', 'raised', 4.5], ['ink2', 'sunk', 4.5],
      ['accentInk', 'accent', 4.5],
      ['accent', 'paper', 4.5], ['accent', 'raised', 4.5], // link / ghost-button text
      ['margin', 'paper', 4.5], ['margin', 'raised', 4.5], ['margin', 'sunk', 4.5], // refusal text
      ['tally', 'paper', 4.5], ['tally', 'raised', 4.5], // "recorded" text
      ['ink', 'highlight', 4.5], // text on a highlighter note
      ['ruleStrong', 'paper', 3],
    ];
    for (const [fg, bg, need] of text) {
      const v = contrast(p[fg], p[bg]);
      out.contrast.push({ theme, pair: `${fg} on ${bg}`, ratio: v, need, pass: v >= need });
    }

    const roles = ['accent', 'margin', 'tally', 'highlight', 'ink'];
    for (let i = 0; i < roles.length; i++)
      for (let j = i + 1; j < roles.length; j++) {
        const de = deltaE(p[roles[i]], p[roles[j]]);
        out.deltaE.push({ theme, pair: `${roles[i]} vs ${roles[j]}`, de, pass: de >= 20 });
      }

    const surfaceMax = Math.max(...['paper', 'raised', 'sunk'].map((s) => labChroma(p[s])));
    for (const r of ['accent', 'margin', 'tally']) {
      out.chroma.push({ theme, role: r, chroma: labChroma(p[r]), surfaceMax, ratio: labChroma(p[r]) / surfaceMax, pass: labChroma(p[r]) / surfaceMax >= 4 });
    }
  }
  return out;
}

/** Planted controls: the instrument must reproduce known answers, or its numbers are withheld. */
function controls() {
  const white = [100, 0, 0], black = [0, 0, 0];
  const checks = [
    ['black on white is 21:1', Math.abs(contrast(black, white) - 21) < 0.05],
    ['a colour against itself is 1:1', Math.abs(contrast(PALETTE.light.ink, PALETTE.light.ink) - 1) < 1e-9],
    ['black vs white is dE 100', Math.abs(deltaE(black, white) - 100) < 0.5],
    ['an impossible chroma is flagged out of gamut', toLinear([60, 0.4, 150]).inGamut === false],
  ];
  const bad = checks.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) throw new Error(`instrument control failed: ${bad.join('; ')}`);
}

if (process.argv[1]?.endsWith('measure.mjs')) {
  controls();
  const r = report();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('### Gamut\n' + (r.gamut.length ? r.gamut.map((g) => `- ${g}`).join('\n') : 'every colour is inside sRGB'));
    console.log('\n### Contrast (WCAG ratio)\n| Theme | Pair | Ratio | Needs | |\n|---|---|---|---|---|');
    for (const c of r.contrast) console.log(`| ${c.theme} | ${c.pair} | ${fmt(c.ratio)}:1 | ${c.need}:1 | ${c.pass ? 'pass' : 'FAIL'} |`);
    console.log('\n### Role hues apart (CIE dE76, must be at least 20)\n| Theme | Pair | dE76 | |\n|---|---|---|---|');
    for (const d of r.deltaE) console.log(`| ${d.theme} | ${d.pair} | ${fmt(d.de, 1)} | ${d.pass ? 'pass' : 'FAIL'} |`);
    console.log('\n### Accent chroma against surfaces (Lab chroma, at least 4x)\n| Theme | Role | Chroma | Loudest surface | Ratio | |\n|---|---|---|---|---|---|');
    for (const c of r.chroma) console.log(`| ${c.theme} | ${c.role} | ${fmt(c.chroma, 1)} | ${fmt(c.surfaceMax, 1)} | ${fmt(c.ratio, 1)}x | ${c.pass ? 'pass' : 'FAIL'} |`);
  }
}
