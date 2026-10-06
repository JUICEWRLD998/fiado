import { ImageResponse } from 'next/og';

export const alt = 'Fiado: your shop’s credit book, kept by the network. A purchase over the limit is refused by the Stellar network.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// An image cannot read CSS variables, so these are the measured palette from design/measure.mjs, converted to sRGB.
const C = { paper: '#f0f9fb', raised: '#f7fdfe', rule: '#a5d2ed', ink: '#0c1f45', ink2: '#3b4d6e', accent: '#093da1', margin: '#c2181d' };

/** The brand display face, fetched as a static font for the renderer. If it cannot be fetched the card still renders. */
async function displayFont(): Promise<ArrayBuffer | undefined> {
  try {
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@750', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.24' } })).text();
    const url = /src: url\((.+?)\) format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}

export default async function OpengraphImage() {
  const font = await displayFont();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: C.paper, position: 'relative', fontFamily: font ? 'Bricolage' : 'sans-serif' }}>
        {/* the margin */}
        <div style={{ position: 'absolute', left: 96, top: 0, bottom: 0, width: 4, background: C.margin }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 140, paddingRight: 80, width: '100%' }}>
          <div style={{ fontSize: 30, color: C.ink2, marginBottom: 28, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 6, height: 34, background: C.margin, marginRight: 14 }} />
            Fiado
          </div>
          <div style={{ fontSize: 76, lineHeight: 1.04, color: C.ink, letterSpacing: -2, maxWidth: 900, display: 'flex' }}>Your shop’s credit book, kept by the network.</div>

          {/* the moment, at the frame where the stamp has landed */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 56 }}>
            <div style={{ display: 'flex', position: 'relative', width: 620, height: 16 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: 190, height: 16, background: C.ink, borderRadius: 3 }} />
              <div style={{ position: 'absolute', left: 190, top: 0, width: 306, height: 16, background: C.accent, opacity: 0.85 }} />
              <div style={{ position: 'absolute', left: 496, top: -9, width: 6, height: 34, background: C.margin }} />
              <div style={{ position: 'absolute', left: 502, top: 0, width: 110, height: 16, border: `3px dashed ${C.margin}`, opacity: 0.6 }} />
            </div>
            <div
              style={{
                display: 'flex',
                marginLeft: 40,
                padding: '2px 22px 6px',
                border: `6px solid ${C.margin}`,
                borderRadius: 10,
                color: C.margin,
                fontSize: 52,
                transform: 'rotate(-3deg)',
              }}
            >
              Refused
            </div>
          </div>
          <div style={{ fontSize: 28, color: C.ink2, marginTop: 28, display: 'flex' }}>A purchase over the limit is refused by the network itself.</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: 'Bricolage', data: font, style: 'normal', weight: 700 }] : undefined },
  );
}
