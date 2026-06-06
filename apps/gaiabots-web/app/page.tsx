import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckList,
  CtaLink,
  CtaSection,
  DeviceCard,
  DroneIcon,
  FutureFamilyCard,
  GridIcon,
  LeadForm,
  MediaSplit,
  PencilIcon,
  PlusIcon,
  RoverIcon,
  Section,
  SectionIntro,
  UsersIcon,
  type DeviceCardProps,
  type FutureFamilyCardProps
} from "@gaia/ui";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=1800&q=80";
const ROVER_IMAGE =
  "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=1400&q=80";
const DRONE_IMAGE =
  "https://images.unsplash.com/photo-1473625247510-8ceb1760943f?w=1400&q=80";
const KB_IMAGE =
  "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1400&q=80";

const devices: DeviceCardProps[] = [
  {
    code: "GAIA-R",
    label: "Ground platform",
    status: "Concept · in development",
    image: ROVER_IMAGE,
    imageAlt: "Ground-level view of crops at field height",
    description:
      "A field-ready ground rover for in-row crop scanning, localized environmental sensing, and future autonomous route execution across structured rows and orchards.",
    specs: [
      ["Primary role", "Row-level crop scanning & sensing"],
      ["Operating range", "Open fields, structured rows, light orchard terrain"],
      ["Capture", "Multi-camera, localized sensors, GPS-tagged scans"],
      ["Integration", "Native CropAutonomy telemetry & scan ingestion"]
    ]
  },
  {
    code: "GAIA-D",
    label: "Aerial platform",
    status: "Concept · in development",
    image: DRONE_IMAGE,
    imageAlt: "Aerial view of farmland from a drone",
    description:
      "An autonomous aerial drone for overhead crop intelligence, large-area inspection, multispectral imaging, and field mapping across whole parcels in a single flight.",
    specs: [
      ["Primary role", "Overhead field imaging & mapping"],
      ["Operating range", "Whole parcels, mixed terrain, sustained flight"],
      ["Capture", "RGB, multispectral, geo-tagged orthomosaics"],
      ["Integration", "Flights feed directly into CropAutonomy analysis"]
    ]
  }
];

const futureFamilies: FutureFamilyCardProps[] = [
  {
    code: "GAIA-S",
    title: "Sensor station",
    body: "Stationary environmental monitoring for soil, microclimate, and persistent in-field observations."
  },
  {
    code: "GAIA-C",
    title: "Control hub",
    body: "Coordination layer for orchestrating missions, fleets, and multi-device deployments at the farm level."
  },
  {
    code: "GAIA-E",
    title: "Edge AI compute",
    body: "On-site inference for low-latency vision and decisions in environments without reliable network connectivity."
  },
  {
    code: "GAIA-A",
    title: "Autonomous actuator",
    body: "Targeted, automated field intervention systems built on the same platform as the rest of the GAIA family."
  }
];

const kbPoints = [
  "Device family overview & specifications",
  "Setup, safety, maintenance, and field deployment",
  "Telemetry, diagnostics, and firmware references",
  "CropAutonomy integration & troubleshooting"
];

export default function Home() {
  return (
    <>
      <Hero />
      <Devices />
      <Connect />
      <Future />
      <KnowledgeBase />
      <Cta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-shell-deep text-neutral-content">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
        src={HERO_IMAGE}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(15,20,17,0.92) 0%, rgba(15,20,17,0.72) 50%, rgba(15,20,17,0.40) 100%)"
        }}
      />
      <div className="relative mx-auto w-full max-w-[1440px] px-6 py-24 lg:px-16 lg:py-32">
        <div className="max-w-3xl">
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-3 py-1.5 text-sm font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Hardware in active development
          </span>
          <h1 className="mb-6 text-5xl font-semibold leading-tight tracking-tight md:text-7xl">
            Field robotics for autonomous agriculture.
          </h1>
          <p className="mb-10 max-w-2xl text-lg leading-7 text-neutral-content/78">
            GAIAbots is the robotics arm of the CropAutonomy ecosystem — building GAIA-R, a ground rover for crop intelligence at row level, and GAIA-D, an aerial platform for overhead field analysis.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <CtaLink
              className="btn whitespace-nowrap rounded-md border-0 bg-base-100 px-5 text-neutral hover:bg-base-200"
              cta="follow_development"
              href="#updates"
              location="hero"
              source="gaiabots.ai"
            >
              Follow development
              <ArrowRight />
            </CtaLink>
            <a
              className="btn btn-outline whitespace-nowrap rounded-md border-base-100/30 px-5 text-base-100 hover:bg-base-100/10 hover:text-base-100"
              href="https://cropautonomy.com"
            >
              Visit CropAutonomy
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Devices() {
  return (
    <Section id="devices" tone="light">
      <SectionIntro
        align="center"
        eyebrow="The GAIA device family"
        lead="A ground rover that walks the rows. An aerial drone that watches the whole parcel. Both feed the same CropAutonomy workspace."
        title="Two platforms. One field, seen completely."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {devices.map((device) => (
          <DeviceCard key={device.code} {...device} />
        ))}
      </div>
    </Section>
  );
}

function Connect() {
  return (
    <Section id="connect" tone="dark">
      <header className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <span className="mb-3 block text-sm font-semibold text-leaf-soft">One ecosystem</span>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Every device feeds CropAutonomy.
          </h2>
        </div>
        <p className="max-w-sm text-base leading-6 text-neutral-content/70">
          GAIAbots devices are not standalone tools. Telemetry, scans, and missions will land in the same multi-tenant platform that ingests operator-captured imagery (Field Capture on CropAutonomy) — one pipeline, multiple input sources.
        </p>
      </header>
      <div className="grid gap-6 rounded-2xl border border-neutral-content/10 bg-shell-deep p-6 lg:grid-cols-[280px_auto_1fr_auto_240px] lg:gap-0 lg:items-stretch lg:p-9">
        <DiagramColumn title="Field devices">
          <DiagramRow icon={<RoverIcon />} subtitle="Row-level scans & telemetry" title="GAIA-R" tone="accent" />
          <DiagramRow icon={<DroneIcon />} subtitle="Aerial imagery & mapping" title="GAIA-D" tone="accent" />
          <DiagramRow
            dashed
            icon={<PlusIcon />}
            subtitle="Sensor stations, edge compute, more"
            title="Future families"
          />
        </DiagramColumn>
        <DiagramArrow />
        <DiagramPlatformCard />
        <DiagramArrow />
        <DiagramColumn title="Field teams">
          <DiagramRow icon={<UsersIcon />} subtitle="Farms & agronomists" title="Operators" tone="leaf" />
          <DiagramRow icon={<GridIcon />} subtitle="Structured field trials" title="Researchers" tone="leaf" />
          <DiagramRow
            icon={<PencilIcon />}
            subtitle="Integrations & missions"
            title="Robotics builders"
            tone="leaf"
          />
        </DiagramColumn>
      </div>
    </Section>
  );
}

function DiagramColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-content/55">
        {title}
      </span>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

type DiagramRowTone = "accent" | "leaf";

function DiagramRow({
  icon,
  title,
  subtitle,
  tone,
  dashed = false
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone?: DiagramRowTone;
  dashed?: boolean;
}) {
  const wrap = dashed
    ? "border border-dashed border-neutral-content/15 bg-neutral-content/5"
    : "border border-neutral-content/10 bg-neutral-content/5";
  let iconClass = "border border-neutral-content/15 bg-neutral-content/10 text-neutral-content/55";
  if (tone === "accent") {
    iconClass = "border border-accent/35 bg-accent/15 text-accent";
  } else if (tone === "leaf") {
    iconClass = "border border-leaf-soft/30 bg-leaf-soft/15 text-leaf-soft";
  }
  return (
    <div className={`flex items-center gap-3.5 rounded-lg p-4 ${wrap}`}>
      <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
        {icon}
      </span>
      <div className="flex flex-col">
        <span className={`text-base font-semibold ${dashed ? "text-neutral-content/75" : "text-neutral-content"}`}>
          {title}
        </span>
        <span className={`text-sm ${dashed ? "text-neutral-content/45" : "text-neutral-content/60"}`}>
          {subtitle}
        </span>
      </div>
    </div>
  );
}

function DiagramArrow() {
  return (
    <div className="hidden items-center justify-center px-6 lg:flex">
      <span className="block h-px w-10 bg-neutral-content/30" />
      <ArrowRight className="text-neutral-content/50" size={14} />
    </div>
  );
}

function DiagramPlatformCard() {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-content/55">
        CropAutonomy platform
      </span>
      <div className="flex flex-col gap-3 rounded-lg bg-primary p-6 text-primary-content">
        <h3 className="text-lg font-semibold">Telemetry & vision ingestion</h3>
        <p className="text-sm leading-5 text-primary-content/80">
          All device data — and operator-captured imagery via Field Capture — will land in tenant-aware storage, run through queued AI analysis, and surface as structured crop intelligence inside the same workspace.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Ingestion API", "Scan storage", "Mission scheduler", "AI analysis queue"].map((tag) => (
            <span
              className="rounded bg-primary-content/10 px-2.5 py-1 text-xs text-primary-content"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Future() {
  return (
    <Section id="future" tone="warm">
      <SectionIntro
        eyebrow="The wider device family"
        lead="The roadmap leaves room for sensor stations, edge AI compute, control hubs, and autonomous actuator systems — each operating inside the same telemetry, mission, and tenancy model."
        title="GAIA-R and GAIA-D are just the beginning."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {futureFamilies.map((family) => (
          <FutureFamilyCard key={family.code} {...family} />
        ))}
      </div>
    </Section>
  );
}

function KnowledgeBase() {
  return (
    <Section id="knowledge-base" tone="light">
      <MediaSplit
        contentWidth="wide"
        image={KB_IMAGE}
        imageAlt="Hands holding a young green seedling in dark soil"
        imagePosition="right"
      >
        <span className="mb-3 block text-sm font-semibold text-primary">Coming to GAIAbots.ai</span>
        <h2 className="mb-5 text-3xl font-semibold leading-tight tracking-tight text-neutral md:text-4xl">
          A real knowledge base for real hardware.
        </h2>
        <p className="mb-7 text-lg leading-7 text-base-content/70">
          As GAIA-R and GAIA-D mature, this site grows into the technical reference farms, technicians, and integrators rely on — written by the people building the hardware.
        </p>
        <CheckList items={kbPoints} size="md" />
      </MediaSplit>
    </Section>
  );
}

function Cta() {
  return (
    <CtaSection id="updates">
      <div className="flex flex-col lg:pt-3.5">
        <span className="mb-3 text-sm font-semibold text-leaf-soft">Follow development</span>
        <h2 className="mb-5 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Get updates from the hardware team.
        </h2>
        <p className="mb-8 text-base leading-7 text-neutral-content/72">
          Whether you're a farm interested in field robotics, a research group exploring autonomous platforms, or a hardware collaborator who wants to integrate — we want to hear from you as GAIA-R and GAIA-D come together.
        </p>
        <CheckList
          items={[
            "Hardware progress and prototype milestone updates",
            "Early collaboration opportunities for research partners",
            "Direct technical channel for hardware builders"
          ]}
          size="md"
          tone="light"
        />
      </div>
      <LeadForm
        apiUrl={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/v1/leads`}
        copy={{
          submitLabel: "Request updates",
          consentLabel: "I agree to receive development updates from GAIAbots.",
          messageLabel: "Anything specific you'd like to follow?"
        }}
        defaultInterest="robotics_collaborator"
        placeholders={{
          name: "Mira Okafor",
          email: "mira@nordbanksoils.eu",
          organization: "Nordbank Soils Research · Uppsala",
          message:
            "We are evaluating multispectral aerial platforms for a multi-year nitrogen study and would like to track GAIA-D as it matures."
        }}
        source="gaiabots.ai"
      />
    </CtaSection>
  );
}
