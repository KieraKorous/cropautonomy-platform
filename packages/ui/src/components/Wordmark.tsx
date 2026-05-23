import type { ReactNode } from "react";

export type Brand = "cropautonomy" | "gaiabots";

export type WordmarkVariant = "default" | "light";

type WordmarkProps = {
  brand: Brand;
  variant?: WordmarkVariant;
  href?: string;
  className?: string;
};

const labels: Record<Brand, string> = {
  cropautonomy: "CropAutonomy",
  gaiabots: "GAIAbots"
};

export function Wordmark({ brand, variant = "default", href, className = "" }: WordmarkProps) {
  const textColor = variant === "light" ? "text-base-100" : "text-neutral";
  const content: ReactNode = (
    <>
      <BrandGlyph brand={brand} variant={variant} />
      <span className={`whitespace-nowrap text-lg font-semibold tracking-tight ${textColor}`}>
        {labels[brand]}
      </span>
    </>
  );
  const wrapperClass = `inline-flex items-center gap-2.5 ${className}`;

  if (href) {
    return (
      <a aria-label={labels[brand]} className={wrapperClass} href={href}>
        {content}
      </a>
    );
  }
  return <span className={wrapperClass}>{content}</span>;
}

function BrandGlyph({ brand, variant }: { brand: Brand; variant: WordmarkVariant }) {
  if (brand === "cropautonomy") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-content">
        <CropAutonomyGlyph />
      </span>
    );
  }
  const wrap =
    variant === "light"
      ? "bg-base-100 text-accent"
      : "bg-neutral text-accent";
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-md ${wrap}`}>
      <GaiabotsGlyph />
    </span>
  );
}

function CropAutonomyGlyph() {
  return (
    <svg
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M12 22V11" />
      <path
        d="M12 11C7.5 11 5 8 5 4c4 0 7 3 7 7z"
        fill="currentColor"
        fillOpacity="0.22"
      />
      <path
        d="M12 15c4.5 0 7-3 7-7-4 0-7 3-7 7z"
        fill="currentColor"
        fillOpacity="0.22"
      />
    </svg>
  );
}

function GaiabotsGlyph() {
  return (
    <svg
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="18"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" fill="currentColor" r="2.2" stroke="none" />
      <line x1="12" x2="12" y1="2" y2="5" />
      <line x1="12" x2="12" y1="19" y2="22" />
      <line x1="2" x2="5" y1="12" y2="12" />
      <line x1="19" x2="22" y1="12" y2="12" />
    </svg>
  );
}
