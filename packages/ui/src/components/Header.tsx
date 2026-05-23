import { Wordmark, type Brand } from "./Wordmark";

export type HeaderNavLink = { label: string; href: string };

export type HeaderProps = {
  brand: Brand;
  navLinks: HeaderNavLink[];
  sisterBrand?: HeaderNavLink;
  cta: HeaderNavLink;
  ctaTone?: "primary" | "neutral";
};

export function Header({
  brand,
  navLinks,
  sisterBrand,
  cta,
  ctaTone = "primary"
}: HeaderProps) {
  const ctaClass =
    ctaTone === "neutral"
      ? "btn btn-sm whitespace-nowrap rounded-md border-0 bg-neutral px-4 text-sm text-neutral-content hover:bg-neutral/90"
      : "btn btn-primary btn-sm rounded-md px-4 text-sm";

  return (
    <header className="bg-base-100/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-5 lg:px-16">
        <Wordmark brand={brand} href="/" />
        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <a
              className="text-sm font-medium text-neutral/90 hover:text-primary"
              href={link.href}
              key={link.label}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {sisterBrand && (
            <a
              className="hidden whitespace-nowrap text-sm font-medium text-neutral/90 hover:text-primary lg:inline"
              href={sisterBrand.href}
            >
              {sisterBrand.label}
            </a>
          )}
          <a className={ctaClass} href={cta.href}>
            {cta.label}
          </a>
        </div>
      </div>
    </header>
  );
}
