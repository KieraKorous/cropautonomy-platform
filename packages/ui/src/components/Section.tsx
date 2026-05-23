import type { ReactNode } from "react";

export type SectionTone = "light" | "warm" | "dark" | "hero-dark";

const toneClasses: Record<SectionTone, string> = {
  light: "bg-base-100 text-neutral",
  warm: "border-y border-base-content/10 bg-base-200/60 text-neutral",
  dark: "bg-neutral text-neutral-content",
  "hero-dark": "bg-shell-deep text-neutral-content"
};

export function Section({
  tone = "light",
  id,
  children,
  containerClassName = "",
  className = ""
}: {
  tone?: SectionTone;
  id?: string;
  children: ReactNode;
  containerClassName?: string;
  className?: string;
}) {
  return (
    <section className={`${toneClasses[tone]} ${className}`} id={id}>
      <div className={`mx-auto w-full max-w-[1440px] px-6 py-20 lg:px-16 lg:py-24 ${containerClassName}`}>
        {children}
      </div>
    </section>
  );
}

export type SectionIntroProps = {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "center" | "left";
  tone?: "default" | "light";
  accessory?: ReactNode;
  className?: string;
};

export function SectionIntro({
  eyebrow,
  title,
  lead,
  align = "left",
  tone = "default",
  accessory,
  className = ""
}: SectionIntroProps) {
  const isLight = tone === "light";
  const eyebrowColor = isLight ? "text-leaf-soft" : "text-primary";
  const titleColor = isLight ? "text-neutral-content" : "text-neutral";
  const leadColor = isLight ? "text-neutral-content/70" : "text-base-content/70";

  if (align === "center") {
    return (
      <div className={`mx-auto mb-14 flex max-w-2xl flex-col items-center text-center ${className}`}>
        {eyebrow && <span className={`mb-3 text-sm font-semibold ${eyebrowColor}`}>{eyebrow}</span>}
        <h2
          className={`mb-4 text-3xl font-semibold leading-tight tracking-tight md:text-5xl ${titleColor}`}
        >
          {title}
        </h2>
        {lead && <p className={`text-lg leading-7 ${leadColor}`}>{lead}</p>}
      </div>
    );
  }

  return (
    <header
      className={`mb-12 flex flex-col gap-6 ${accessory ? "md:flex-row md:items-end md:justify-between" : ""} ${className}`}
    >
      <div className="max-w-2xl">
        {eyebrow && <span className={`mb-3 block text-sm font-semibold ${eyebrowColor}`}>{eyebrow}</span>}
        <h2
          className={`text-3xl font-semibold leading-tight tracking-tight md:text-4xl ${titleColor}`}
        >
          {title}
        </h2>
        {lead && <p className={`mt-4 text-lg leading-7 ${leadColor}`}>{lead}</p>}
      </div>
      {accessory}
    </header>
  );
}

export type MediaSplitProps = {
  image: string;
  imageAlt?: string;
  imagePosition?: "left" | "right";
  children: ReactNode;
  contentWidth?: "narrow" | "wide";
};

export function MediaSplit({
  image,
  imageAlt = "",
  imagePosition = "left",
  children,
  contentWidth = "narrow"
}: MediaSplitProps) {
  const left = imagePosition === "left";
  const gridCols =
    contentWidth === "wide"
      ? left
        ? "lg:grid-cols-[1fr_580px]"
        : "lg:grid-cols-[580px_1fr]"
      : left
        ? "lg:grid-cols-[1fr_520px]"
        : "lg:grid-cols-[520px_1fr]";

  const imageEl = (
    <div className="h-[340px] overflow-hidden rounded-xl md:h-[440px] lg:h-[480px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={imageAlt} className="h-full w-full object-cover" loading="lazy" src={image} />
    </div>
  );

  return (
    <div className={`grid items-center gap-12 lg:gap-16 ${gridCols}`}>
      {left ? imageEl : <div>{children}</div>}
      {left ? <div>{children}</div> : imageEl}
    </div>
  );
}

export function CtaSection({
  id,
  children
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-neutral text-neutral-content" id={id}>
      <div className="mx-auto grid w-full max-w-[1440px] gap-12 px-6 py-20 lg:grid-cols-[520px_1fr] lg:items-start lg:gap-20 lg:px-16 lg:py-24">
        {children}
      </div>
    </section>
  );
}
