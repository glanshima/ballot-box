import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12.04 2.5a9.4 9.4 0 0 0-8.1 14.2L2.5 21.5l4.94-1.4a9.4 9.4 0 0 0 4.6 1.2 9.4 9.4 0 1 0 0-18.8Z" />
      <path d="M8.4 7.6c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.2-.3.3-.1.6.3.5.7 1 1.2 1.5.6.6 1.2 1 1.7 1.2.3.1.4 0 .6-.1l.6-.7c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.4.3 0 .2 0 .9-.4 1.4-.4.5-1.2.9-1.9.9-.6 0-1.6-.1-3.1-.9-1.9-1-3.1-2.9-3.2-3-.1-.2-1-1.4-1-2.7 0-1.2.6-1.9.9-2.2Z" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.7 3.5h2.6l1.4 3.4-1.8 1.5a13.4 13.4 0 0 0 6.7 6.7l1.5-1.8 3.4 1.4v2.6a2.2 2.2 0 0 1-2.4 2.2A17 17 0 0 1 4.5 5.9a2.2 2.2 0 0 1 2.2-2.4Z" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
      <path d="m4.2 7.5 7.8 5.6 7.8-5.6" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.2" r="3.5" />
      <path d="M5 20c.6-3.4 3.4-5.4 7-5.4s6.4 2 7 5.4" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4.6" y="10.2" width="14.8" height="10.3" rx="2.4" />
      <path d="M8.2 10.2V7.8a3.8 3.8 0 0 1 7.6 0v2.4" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4.5 20 20" />
      <path d="M9.6 6.1a9.9 9.9 0 0 1 2.4-.3c6 0 9.5 6.2 9.5 6.2a16.6 16.6 0 0 1-2.7 3.5" />
      <path d="M6.2 8.2A16.4 16.4 0 0 0 2.5 12S6 18.2 12 18.2c1.2 0 2.3-.2 3.3-.7" />
      <path d="M9.7 9.8a3.2 3.2 0 0 0 4.5 4.5" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.2 5 6v5.2c0 4 2.9 7.3 7 9.6 4.1-2.3 7-5.6 7-9.6V6l-7-2.8Z" />
      <path d="m9.2 11.8 2 2 3.6-3.8" />
    </svg>
  );
}
