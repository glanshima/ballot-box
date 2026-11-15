'use client';

import { useEffect, useState } from 'react';

/** Renders an instant in the viewer's own time zone (server renders UTC, then swaps after mount). */
export function LocalTime({ iso }: { iso: string | null | undefined }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (iso) setText(new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
  }, [iso]);
  if (!iso) return <>-</>;
  return <time dateTime={iso} suppressHydrationWarning>{text ?? `${iso.slice(0, 16).replace('T', ' ')} UTC`}</time>;
}
