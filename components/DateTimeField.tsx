'use client';

import { useEffect, useId, useState } from 'react';

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * datetime-local shows/accepts the BROWSER's local time; a hidden field submits
 * an unambiguous ISO-8601 instant so the server never guesses a time zone.
 */
export function DateTimeField({ name, label, defaultValue, required, disabled }: {
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [local, setLocal] = useState('');
  useEffect(() => {
    setLocal(defaultValue ? toLocalInput(new Date(defaultValue)) : '');
  }, [defaultValue]);
  const iso = local ? new Date(local).toISOString() : '';
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type="datetime-local" className="input" value={local} required={required} disabled={disabled} onChange={(e) => setLocal(e.target.value)} />
      <input type="hidden" name={name} value={iso} />
      <p className="hint">Your local time ({typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''})</p>
    </div>
  );
}
