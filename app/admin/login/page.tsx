import { redirect } from 'next/navigation';

/** The landing page at `/` is the only administrator login entry point. */
export default async function LegacyLoginRedirect({ searchParams }: { searchParams: Promise<{ changed?: string; expired?: string }> }) {
  const { changed, expired } = await searchParams;
  const params = new URLSearchParams();
  if (changed === '1') params.set('changed', '1');
  else if (expired === '1') params.set('expired', '1');
  const query = params.toString();
  redirect(query ? `/?${query}` : '/');
}
