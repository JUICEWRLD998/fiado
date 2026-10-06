'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** A QR code for a link, drawn in the browser. The link is shown beside it too, so nothing depends on the camera. */
export function Qr({ value, size = 240 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, which next/image cannot optimise
  return <img data-testid="qr" src={src} width={size} height={size} alt="QR code for the link below" />;
}
