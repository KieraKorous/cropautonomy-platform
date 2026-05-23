import { StatusPill, type Tone } from "./atoms";

export type RoadmapMilestone = {
  when: string;
  quarter: string;
  title: string;
  body: string;
  status: string;
  statusTone: Tone;
};

const whenToneClass: Record<Tone, string> = {
  primary: "text-primary",
  accent: "text-accent",
  secondary: "text-secondary",
  success: "text-success",
  muted: "text-base-content/55"
};

export function RoadmapList({ items }: { items: readonly RoadmapMilestone[] }) {
  return (
    <ol className="flex flex-col border-l border-base-content/10 pl-8 lg:pl-12">
      {items.map((item, idx) => (
        <RoadmapItem isLast={idx === items.length - 1} item={item} key={item.title} />
      ))}
    </ol>
  );
}

function RoadmapItem({
  item,
  isLast
}: {
  item: RoadmapMilestone;
  isLast: boolean;
}) {
  return (
    <li
      className={`flex flex-col gap-4 ${
        isLast ? "" : "mb-9 border-b border-base-content/10 pb-9"
      } md:grid md:grid-cols-[140px_1fr_auto] md:items-start md:gap-6`}
    >
      <div>
        <p className={`text-xs font-semibold ${whenToneClass[item.statusTone]}`}>{item.when}</p>
        <p className="mt-1 text-sm text-base-content/60">{item.quarter}</p>
      </div>
      <div>
        <h3 className="mb-2.5 text-xl font-semibold text-neutral">{item.title}</h3>
        <p className="text-sm leading-6 text-base-content/70">{item.body}</p>
      </div>
      <StatusPill label={item.status} tone={item.statusTone} />
    </li>
  );
}
