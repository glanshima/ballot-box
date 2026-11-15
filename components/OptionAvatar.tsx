import Image from 'next/image';

const SIZES = { sm: 'h-12 w-12', md: 'h-16 w-16', lg: 'h-24 w-24' } as const;

/**
 * Every option gets the SAME square crop (object-cover) so no candidate gets
 * visual prominence. Initials placeholder when there is no image.
 */
export function OptionAvatar({ label, imageUrl, size = 'md' }: { label: string; imageUrl?: string | null; size?: keyof typeof SIZES }) {
  const initials = label.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl bg-slate-200 ${SIZES[size]}`}>
      {imageUrl ? (
        <Image src={imageUrl} alt={label} fill sizes="96px" className="object-cover" />
      ) : (
        <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-700">{initials}</span>
      )}
    </div>
  );
}
