import { AycLogo } from '@/components/AycLogo';
import { RilayLogo } from '@/components/RilayLogo';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Link from 'next/link';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <RilayLogo className="h-8 w-auto" />,
  },
  githubUrl: 'https://github.com/andyoucreate/rilaykit',
  // see https://fumadocs.dev/docs/ui/navigation/links
  links: [
    {
      type: 'custom',
      children: (
        <div className="absolute bottom-0 left-0 mx-auto w-full flex">
          <Link
            href="https://andyoucreate.com"
            target="_blank"
            className="mx-auto flex items-center gap-2 mb-4"
          >
            <span className="text-sm tracking-wide">
              crafted with <span className="text-xs">💛</span> by
            </span>
            <AycLogo className="h-6" />
          </Link>
        </div>
      ),
    },
  ],
};
