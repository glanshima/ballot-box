import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">Ballot Box</h1>
      <p className="text-slate-700">
        Voting links are personal and arrive by email from your election organiser. Open the link you were sent to cast your vote.
      </p>
      <p>
        <Link href="/admin" className="text-indigo-800 underline">Organiser sign-in</Link>
      </p>
    </main>
  );
}
