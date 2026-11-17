import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandMark } from '@/components/landing/BrandMark';
import { LoginCard, type LoginNotice } from '@/components/landing/LoginCard';
import { ChevronRightIcon, MailIcon, PhoneIcon, WhatsAppIcon } from '@/components/landing/icons';
import { getAdminUser } from '@/lib/authz';

export const metadata: Metadata = {
  title: { absolute: 'BallotBox — Vote. Decide. Together.' },
  description:
    'BallotBox is a modern online voting and polling platform for organising polls, gathering opinions and making group decisions.',
};

const gutter = 'mx-auto w-full max-w-[1800px] px-5 sm:px-8 xl:px-[6vw]';

const CONTACTS = [
  {
    label: 'Chat on WhatsApp',
    value: '+234 803 210 5862',
    href: 'https://wa.me/2348032105862',
    Icon: WhatsAppIcon,
    external: true,
  },
  {
    label: 'Call Us',
    value: '+234 803 210 5862',
    href: 'tel:+2348032105862',
    Icon: PhoneIcon,
    external: false,
  },
  {
    label: 'Email Us',
    value: 'info@sidgakstech.me',
    href: 'mailto:info@sidgakstech.me',
    Icon: MailIcon,
    external: false,
  },
] as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ expired?: string; changed?: string }> }) {
  const admin = await getAdminUser();
  if (admin) redirect('/admin');

  const { expired, changed } = await searchParams;
  const notice: LoginNotice = changed === '1' ? 'changed' : expired === '1' ? 'expired' : null;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-brand-mist font-landing text-brand-navy">
      <Image
        src="/branding/ballotbox-hero-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none select-none object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-mist/90 via-[#eef6ff]/85 to-brand-sky/90 lg:bg-gradient-to-r lg:from-brand-mist/70 lg:via-white/20 lg:to-transparent"
      />

      <header className={`landing-header relative z-10 flex items-center ${gutter}`}>
        <Link href="/" aria-label="BallotBox home" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-brand-royal">
          <BrandMark className="h-12 w-12 drop-shadow-[0_6px_10px_rgba(10,42,102,0.18)] sm:h-14 sm:w-14" />
          <span className="font-display text-[1.9rem] font-extrabold tracking-[-0.04em] sm:text-[2.4rem]">
            <span className="text-brand-navy">Ballot</span>
            <span className="text-brand-royal">Box</span>
          </span>
        </Link>
      </header>

      <main className={`landing-main relative z-10 flex flex-1 flex-col gap-9 xl:flex-row xl:items-center xl:gap-10 ${gutter}`}>
        <section className="w-full xl:max-w-[58%]">
          <h1 className="font-display font-bold tracking-[-0.035em]">
            <span className="block text-[clamp(2.6rem,4.7vw,5.4rem)] leading-[0.98] text-brand-navy">Vote. Decide.</span>
            <span className="mt-1 block text-[clamp(3rem,5.7vw,6.4rem)] font-extrabold leading-[0.94] text-brand-royal">Together.</span>
          </h1>

          <p className="mt-6 max-w-[34rem] text-[1rem] font-medium leading-[1.65] text-[#22375c] sm:text-[1.05rem]">
            BallotBox is a modern online voting and polling platform that makes it easier to organise polls, gather opinions, and make group
            decisions. Create polls, monitor participation, view results, and manage your polls — all from one convenient platform.
          </p>

          <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.95rem] font-semibold tracking-wide text-brand-navy">
            <span>Secure</span>
            <span aria-hidden="true" className="text-brand-azure">·</span>
            <span>Transparent</span>
            <span aria-hidden="true" className="text-brand-azure">·</span>
            <span>Accessible</span>
          </p>

          <p className="mt-9 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-brand-royal sm:mt-10">Get started today</p>

          <div className="mt-4 flex flex-wrap gap-3 xl:max-w-[48rem]">
            {CONTACTS.map(({ label, value, href, Icon, external }) => (
              <a
                key={label}
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="group flex min-h-[4.1rem] min-w-0 flex-1 basis-[13.5rem] items-center gap-2 rounded-full border border-brand-royal/20 bg-white/95 px-3.5 py-2.5 text-brand-navy shadow-[0_10px_30px_-22px_rgba(10,42,102,0.5)] transition-[background-color,border-color,color,box-shadow] duration-300 ease-out hover:border-brand-royal hover:bg-brand-royal hover:text-white hover:shadow-pill focus-visible:outline-brand-navy motion-reduce:transition-none"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-sky text-brand-royal transition-colors duration-300 ease-out group-hover:bg-white/15 group-hover:text-white motion-reduce:transition-none">
                  <Icon className="h-[1.15rem] w-[1.15rem]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.68rem] font-semibold leading-tight text-slate-600 transition-colors duration-300 ease-out group-hover:text-white/80 motion-reduce:transition-none">
                    {label}
                  </span>
                  <span className="mt-0.5 block whitespace-nowrap text-[0.84rem] font-bold leading-tight tracking-[-0.01em] 2xl:text-[0.9rem]">
                    {value}
                    {external && <span className="sr-only"> (opens in a new tab)</span>}
                  </span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-brand-royal/60 transition-[color,transform] duration-300 ease-out group-hover:translate-x-0.5 group-hover:text-white/80 motion-reduce:transition-none" />
              </a>
            ))}
          </div>
        </section>

        <div className="flex w-full justify-center xl:ml-auto xl:w-[420px] xl:shrink-0 xl:justify-end 2xl:w-[460px]">
          <LoginCard notice={notice} />
        </div>
      </main>

      <footer className="relative z-10 bg-brand-navy">
        <div className={`flex flex-col items-center gap-1.5 py-5 text-center text-[0.82rem] text-brand-sky sm:flex-row sm:justify-between sm:py-7 sm:text-left sm:text-sm ${gutter}`}>
          <p>
            Powered by{' '}
            <a
              href="https://sidgakstech.me"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white no-underline"
            >
              Sidgaks Tech<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <p className="text-brand-sky/80">© 2026 Sidgaks Tech. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
