import type { ReactNode } from "react";

export type Brand = "cropautonomy" | "gaiabots";

export type WordmarkVariant = "default" | "light";

type WordmarkProps = {
    brand: Brand;
    variant?: WordmarkVariant;
    href?: string;
    className?: string;
};

const labels: Record<Brand, string[]> = {
    cropautonomy: ["Crop", "Autonomy"],
    gaiabots: ["GAIA", "bots"]
};

export function Wordmark({ brand, variant = "default", href, className = "" }: WordmarkProps) {
    const textColor = variant === "light" ? "text-base-100" : "text-neutral";
    const content: ReactNode = (
        <>
            <img
                alt=""
                className="h-8 w-8 shrink-0"
                height={32}
                src="/brand/icon.svg"
                width={32}
            />
            <span className={`whitespace-nowrap text-lg font-semibold tracking-tight ${textColor}`}>
                <span className="text-primary font-extrabold ">{labels[brand][0]}</span>{labels[brand][1]}
            </span>
        </>
    );
    const wrapperClass = `inline-flex items-center gap-2.5 ${className}`;

    if (href) {
        return (
            <a aria-label={labels[brand].join(" ")} className={wrapperClass} href={href}>
                {content}
            </a>
        );
    }
    return <span className={wrapperClass}>{content}</span>;
}
