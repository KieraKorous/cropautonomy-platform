import {
  AudienceCard,
  BrainIcon,
  CameraIcon,
  ChartIcon,
  CheckList,
  CtaLink,
  CtaSection,
  FeatureCard,
  FeatureRow,
  GlobeIcon,
  LeadForm,
  MediaSplit,
  RoadmapList,
  RoverIcon,
  Section,
  SectionIntro,
  ShieldIcon,
  type RoadmapMilestone
} from "@gaia/ui";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80";
const FIELD_IMAGE =
  "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1400&q=80";
const AUDIENCE_IMAGES = {
  farms: "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=900&q=80",
  business: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=900&q=80",
  research: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=900&q=80",
  robotics: "https://images.unsplash.com/photo-1473625247510-8ceb1760943f?w=900&q=80"
} as const;

const features = [
  {
    icon: <CameraIcon />,
    title: "Crop scans & imaging",
    body: "Field Capture — phone camera and bulk upload — is the first capture method we're building. Drone, rover, and sensor inputs will join the same pipeline as the GAIA device lineup comes online. Every scan links to a field, zone, and crop, searchable across the whole organization.",
    bullets: [
      "Field Capture (phone & bulk upload) — v1 method",
      "GAIA-D drone & GAIA-R rover ingestion — planned",
      "Field, zone, and crop linkage on every capture"
    ]
  },
  {
    icon: <BrainIcon />,
    title: "AI crop analysis",
    body: "Queued analysis workflows turn each scan into a structured report — visible stress, suspected disease, nutrient concerns, and confidence scores you can act on.",
    bullets: [
      "Asynchronous analysis queue",
      "Health summary with confidence",
      "Notifications on completion"
    ]
  },
  {
    icon: <RoverIcon />,
    title: "Devices & robotics",
    body: "Model devices, missions, and telemetry from day one — so when GAIA-R rovers and GAIA-D drones come online, your platform is already ready to receive them.",
    bullets: [
      "Device taxonomy from day one",
      "Telemetry, routes, missions",
      "GAIA-R and GAIA-D ready"
    ]
  }
];

const fieldValueProps = [
  {
    icon: <GlobeIcon />,
    title: "Works offline-first",
    body: "Capture and queue scans without connectivity. Syncs back when you're in range."
  },
  {
    icon: <ShieldIcon />,
    title: "Roles built for real teams",
    body: "Owners, managers, technicians, agronomists, and viewers — each with the access they need."
  },
  {
    icon: <ChartIcon />,
    title: "A history you can trust",
    body: "Every scan, analysis, and field note is preserved and searchable across seasons."
  }
];

const audiences = [
  {
    title: "Farms & growers",
    body: "Track every field across the season — scans, notes, conditions, and crop history in one place your whole operation can reach.",
    image: AUDIENCE_IMAGES.farms
  },
  {
    title: "Agricultural businesses",
    body: "Coordinate across multiple farms, contractors, and regions — with the visibility and access controls a real organization needs.",
    image: AUDIENCE_IMAGES.business
  },
  {
    title: "Research & institutions",
    body: "Run structured field trials with persistent scan history, exportable datasets, and reproducible AI analysis pipelines.",
    image: AUDIENCE_IMAGES.research
  },
  {
    title: "Robotics collaborators",
    body: "Plug rover, drone, and sensor platforms into a tenant-aware ingestion layer designed for telemetry and missions from day one.",
    image: AUDIENCE_IMAGES.robotics
  }
];

const roadmap: RoadmapMilestone[] = [
  {
    when: "Now",
    quarter: "Q2 2026",
    title: "Public landing pages & early access",
    body: "CropAutonomy.com and GAIAbots.ai live, lead capture wired to durable storage and email notifications, brand and design system established.",
    status: "Shipped",
    statusTone: "success"
  },
  {
    when: "Next",
    quarter: "Q3 2026",
    title: "Portal foundation & first farms",
    body: "Multi-tenant portal with organizations, farms, fields, and roles. Crop scan ingestion from web upload. Early access partners begin onboarding into staging.",
    status: "In progress",
    statusTone: "accent"
  },
  {
    when: "August 2026",
    quarter: "Prototype target",
    title: "Field Capture end-to-end",
    body: "Field Capture is the visible loop in the August 2026 prototype: capture or upload from a phone, queue an AI analysis, deliver a structured crop health report, notify the field team. The first complete pass through the platform — built first because it doesn't depend on hardware.",
    status: "Planned",
    statusTone: "secondary"
  },
  {
    when: "Beyond",
    quarter: "Late 2026 →",
    title: "GAIA devices & autonomous field operations",
    body: "GAIA-R rover and GAIA-D drone telemetry integration, mission scheduling, expanded sensor families, deeper environmental modeling, and the path toward genuinely autonomous field execution.",
    status: "Exploring",
    statusTone: "muted"
  }
];

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <FieldStory />
      <Audiences />
      <Roadmap />
      <Cta />
    </>
  );
}

function Hero() {
  return (
    <section className="bg-base-100">
      <div className="mx-auto grid w-full max-w-[1440px] gap-12 px-6 py-16 lg:grid-cols-[600px_1fr] lg:items-center lg:gap-16 lg:px-16 lg:py-24">
        <div className="flex flex-col">
          <span className="mb-7 inline-flex items-center gap-2 self-start rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Now in active development · prototype Aug 2026
          </span>
          <h1 className="mb-6 text-5xl font-semibold leading-tight tracking-tight text-neutral md:text-6xl">
            Autonomous agricultural intelligence for the modern farm.
          </h1>
          <p className="mb-9 max-w-xl text-lg leading-7 text-base-content/70">
            CropAutonomy is the platform farms, growers, and research teams will use to scan crops, analyze field conditions with AI, and coordinate the next generation of agricultural robotics — all in one workspace.
          </p>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <CtaLink
              className="btn btn-primary rounded-md px-5"
              cta="request_early_access"
              href="#early-access"
              location="hero"
              source="cropautonomy.com"
            >
              Request early access
            </CtaLink>
            <a
              className="btn btn-outline rounded-md border-base-content/20 px-5 text-neutral hover:bg-base-200 hover:text-neutral"
              href="#platform"
            >
              See the platform
            </a>
          </div>
          <p className="text-sm leading-6 text-base-content/55">
            Built for farms, agricultural businesses, agronomy teams, and research institutions. No credit card needed for the access list.
          </p>
        </div>
        <div className="relative h-[420px] overflow-hidden rounded-xl bg-primary md:h-[520px] lg:h-[560px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Golden hour sunlight across a working farm field"
            className="h-full w-full object-cover"
            loading="eager"
            src={HERO_IMAGE}
          />
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <Section id="platform" tone="warm">
      <SectionIntro
        align="center"
        eyebrow="What we're building"
        lead="Crop intelligence, environmental data, and device coordination — designed to work together from day one, on every farm."
        title="One platform for the whole field operation."
      />
      <div className="grid gap-5 md:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </Section>
  );
}

function FieldStory() {
  return (
    <Section tone="light">
      <MediaSplit contentWidth="narrow" image={FIELD_IMAGE} imageAlt="Close-up of young crops growing in dark soil">
        <span className="mb-3 block text-sm font-semibold text-primary">
          Designed with the field in mind
        </span>
        <h2 className="mb-5 text-3xl font-semibold leading-tight tracking-tight text-neutral md:text-4xl">
          Made for the people who actually walk the rows.
        </h2>
        <p className="mb-7 text-lg leading-7 text-base-content/70">
          Spotty cell coverage. Dust on the lens. A scout with one hand on a clipboard. CropAutonomy is being built around the realities of the field — not the comforts of an office dashboard.
        </p>
        <div className="flex flex-col gap-5">
          {fieldValueProps.map((row) => (
            <FeatureRow key={row.title} {...row} />
          ))}
        </div>
      </MediaSplit>
    </Section>
  );
}

function Audiences() {
  return (
    <Section id="audiences" tone="warm">
      <SectionIntro
        accessory={
          <CtaLink
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
            cta="joining_access_list"
            href="#early-access"
            location="audiences"
            source="cropautonomy.com"
          >
            Joining the access list →
          </CtaLink>
        }
        eyebrow="Who it's for"
        title="Built for everyone responsible for the harvest."
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {audiences.map((audience) => (
          <AudienceCard key={audience.title} {...audience} />
        ))}
      </div>
    </Section>
  );
}

function Roadmap() {
  return (
    <Section id="roadmap" tone="light">
      <div className="grid gap-12 lg:grid-cols-[360px_1fr] lg:gap-16">
        <div>
          <span className="mb-3 block text-sm font-semibold text-primary">Where we are</span>
          <h2 className="mb-5 text-3xl font-semibold leading-tight tracking-tight text-neutral md:text-4xl">
            A platform being built in the open.
          </h2>
          <p className="text-base leading-7 text-base-content/70">
            We are early. The roadmap below is what's real, what's next, and what we're aiming at for the August 2026 working prototype.
          </p>
        </div>
        <RoadmapList items={roadmap} />
      </div>
    </Section>
  );
}

function Cta() {
  return (
    <CtaSection id="early-access">
      <div className="flex flex-col lg:pt-3.5">
        <span className="mb-3 text-sm font-semibold text-leaf-soft">Early access</span>
        <h2 className="mb-5 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Join the people we're building this with.
        </h2>
        <p className="mb-8 text-base leading-7 text-neutral-content/72">
          Tell us what you grow, where you grow it, and what would matter most. We'll keep you on the inside of CropAutonomy as it comes together — and reach out when there's something real to put in your hands.
        </p>
        <CheckList
          items={[
            "Direct line to the team — no marketing drip",
            "First access to the August 2026 prototype",
            "Optional partnership for research and robotics teams"
          ]}
          size="md"
          tone="light"
        />
      </div>
      <LeadForm
        apiUrl={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/v1/leads`}
        defaultInterest="farm_or_grower"
        placeholders={{
          name: "Avery Lindgren",
          email: "avery@lindgrenfamilyfarm.com",
          organization: "Lindgren Family Farm · 1,240 acres · MN",
          message:
            "We're scouting corn and soybeans on six fields this season. Curious about anything that would let our agronomist see scan history across years."
        }}
        source="cropautonomy.com"
      />
    </CtaSection>
  );
}
