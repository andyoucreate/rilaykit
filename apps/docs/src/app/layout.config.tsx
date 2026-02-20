import { AycLogo } from '@/components/AycLogo';
import { RilayLogo } from '@/components/RilayLogo';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Link from 'next/link';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <RilayLogo className="h-8 w-auto" />,
    url: 'https://rilay.dev',
  },
  githubUrl: 'https://github.com/andyoucreate/rilaykit',
  links: [
    {
      type: 'icon',
      text: 'X',
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-label="Twitter">
          <title>X</title>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      url: 'https://x.com/karl_mazier',
    },
  ],
};

export function SidebarFooter() {
  return (
    <Link
      href="https://andyoucreate.com"
      target="_blank"
      className="flex items-center justify-center gap-2 px-4 pt-3 mt-2 text-fd-muted-foreground transition-colors hover:text-fd-foreground"
    >
      <span className="text-xs">crafted by</span>
      <AycLogo className="h-5" />
    </Link>
  );
}
