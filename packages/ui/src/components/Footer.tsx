import { Wordmark, type Brand } from "./Wordmark";

export type FooterLink = { label: string; href: string };

export type FooterColumn = {
  title: string;
  links: FooterLink[];
};

export type FooterProps = {
  brand: Brand;
  tagline: string;
  domain: string;
  copyright: string;
  /** Footer renders best with exactly 4 columns. */
  columns: FooterColumn[];
};

export function Footer({ brand, tagline, domain, copyright, columns }: FooterProps) {
  return (
    <footer className="bg-shell-deep text-neutral-content">
      <div className="mx-auto w-full max-w-[1440px] px-6 py-14 lg:px-16 lg:py-16">
        <div className="grid gap-12 border-b border-neutral-content/10 pb-12 lg:grid-cols-[320px_1fr_1fr_1fr_1fr]">
          <div className="flex max-w-[320px] flex-col gap-3.5">
            <Wordmark brand={brand} variant="light" />
            <p className="text-sm leading-6 text-neutral-content/55">{tagline}</p>
          </div>
          {columns.map((column) => (
            <div className="flex flex-col gap-3.5" key={column.title}>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-content/50">
                {column.title}
              </span>
              {column.links.map((link) => (
                <a
                  className="text-sm text-neutral-content/80 hover:text-base-100"
                  href={link.href}
                  key={link.label}
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 text-xs text-neutral-content/45">
          <span>{copyright}</span>
          <span>{domain}</span>
        </div>
      </div>
    </footer>
  );
}
