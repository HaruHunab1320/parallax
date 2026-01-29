import Image from "next/image";

const pills = ["Consensus", "Voting", "Confidence Scoring", "Quality Gates"];

const highlights = [
  {
    title: "Orchestration Patterns",
    description:
      "Model consensus, voting, merge, and verification flows with YAML or the visual builder.",
  },
  {
    title: "Agent Runtimes",
    description:
      "Spawn and manage CLI agents locally, in Docker, or in Kubernetes.",
  },
  {
    title: "Reliability by Design",
    description:
      "Route results through confidence thresholds, retries, and fallback strategies.",
  },
];

const capabilities = [
  "Multi-agent consensus",
  "Confidence scoring",
  "Pattern validation",
  "Execution tracing",
  "Agent lifecycle control",
  "Enterprise-ready HA",
];

const useCases = [
  "Content moderation",
  "Code review at scale",
  "Data extraction pipelines",
  "Quality assurance gates",
  "Fact-checking workflows",
  "Agentic research",
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[#d7dee8]/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/img/parallax-LIGHT-no-text.png"
              alt="Parallax"
              width={44}
              height={44}
              priority
            />
            <span className="text-sm font-semibold tracking-[0.3em] text-[#1b2735]">
              PARALLAX
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#475569] md:flex">
            <a href="https://docs.parallaxai.dev/docs/intro">Docs</a>
            <a href="https://docs.parallaxai.dev/docs/patterns/overview">
              Patterns
            </a>
            <a href="https://builder.parallaxai.dev">Builder</a>
            <a href="https://github.com/parallax-ai/parallax">GitHub</a>
          </nav>
          <a
            href="https://docs.parallaxai.dev/docs/getting-started/quickstart"
            className="hidden rounded-full bg-[#35b5e9] px-4 py-2 text-sm font-semibold text-[#0b0f14] shadow-md shadow-[#35b5e9]/30 transition hover:-translate-y-0.5 md:inline-flex"
          >
            Get Started
          </a>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-6 pb-16 pt-16">
          <div className="triangles-bg pointer-events-none absolute inset-0 opacity-60" />
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d7dee8] bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#1e293b]">
                Orchestration Layer
                <span className="h-1 w-1 rounded-full bg-[#35b5e9]" />
              </div>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-[#0b0f14] sm:text-5xl lg:text-6xl">
                  Reliable multi-agent systems,{" "}
                  <span className="text-[#35b5e9]">by design</span>.
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#526071]">
                  Parallax is an orchestration layer for agents. Compose
                  consensus, voting, and confidence-scored pipelines that stand
                  up in production.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://docs.parallaxai.dev/docs/getting-started/quickstart"
                  className="rounded-full bg-[#35b5e9] px-6 py-3 text-sm font-semibold text-[#0b0f14] shadow-lg shadow-[#35b5e9]/30 transition hover:-translate-y-0.5"
                >
                  Read the docs
                </a>
                <a
                  href="https://builder.parallaxai.dev"
                  className="rounded-full border border-[#cbd5e1] bg-white px-6 py-3 text-sm font-semibold text-[#0f172a] transition hover:border-[#35b5e9]"
                >
                  Launch builder
                </a>
                <a
                  href="https://github.com/parallax-ai/parallax"
                  className="rounded-full bg-transparent px-6 py-3 text-sm font-semibold text-[#475569] transition hover:text-[#0f172a]"
                >
                  View on GitHub
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                {pills.map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full border border-[#e2e8f0] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-10 top-10 h-24 w-24 rounded-full bg-[#f5ed4c]/40 blur-3xl" />
              <div className="absolute -right-10 bottom-0 h-32 w-32 rounded-full bg-[#d92d88]/30 blur-3xl" />
              <div className="rounded-3xl border border-[#d7dee8] bg-white/90 p-8 shadow-xl shadow-[#0f172a]/10">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">
                  Execution Snapshot
                  <span className="rounded-full bg-[#0b0f14] px-2 py-1 text-[10px] text-white">
                    live
                  </span>
                </div>
                <div className="mt-6 space-y-5">
                  <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                    <p className="text-sm font-semibold text-[#1e293b]">
                      Pattern: content-moderation
                    </p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      3 agents · voting · confidence ≥ 0.8
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#64748b]">
                        Consensus
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[#0f172a]">
                        Accept
                      </p>
                      <p className="text-xs text-[#64748b]">2/3 agents agree</p>
                    </div>
                    <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#64748b]">
                        Confidence
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[#0f172a]">
                        0.92
                      </p>
                      <p className="text-xs text-[#64748b]">Above threshold</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#64748b]">
                      Trace
                    </p>
                    <div className="mt-3 grid gap-3 text-xs text-[#475569]">
                      <div className="flex items-center justify-between">
                        <span>Agent 01 · moderation</span>
                        <span className="font-semibold text-[#35b5e9]">
                          PASS
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Agent 02 · safety</span>
                        <span className="font-semibold text-[#35b5e9]">
                          PASS
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Agent 03 · policy</span>
                        <span className="font-semibold text-[#d92d88]">
                          REVIEW
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-[#e2e8f0] bg-white/80 p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-[#0f172a]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#64748b]">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#64748b]">
                  Capabilities
                </p>
                <h2 className="mt-4 text-3xl font-semibold text-[#0b0f14]">
                  Build once. Orchestrate anywhere.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#64748b]">
                  Parallax orchestrates agent flows without locking you into a
                  single model, runtime, or provider. Keep control over how
                  results are produced, validated, and shipped.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-[#e2e8f0] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#475569]"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto w-full max-w-6xl rounded-[32px] border border-[#e2e8f0] bg-white/90 p-10 shadow-xl shadow-[#0f172a]/10">
            <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#64748b]">
                  Architecture
                </p>
                <h2 className="mt-3 text-3xl font-semibold text-[#0b0f14]">
                  Control plane first, agents everywhere.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-[#64748b]">
                  The control plane coordinates agents, enforces consensus, and
                  publishes execution traces. Runtimes can live anywhere while
                  the orchestration logic stays centralized.
                </p>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4 text-sm font-semibold text-[#1e293b]">
                  Control Plane
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-[#475569]">
                  <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
                    Agent Runtime
                  </div>
                  <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
                    Consensus Engine
                  </div>
                  <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
                    Confidence Gates
                  </div>
                  <div className="rounded-xl border border-[#e2e8f0] bg-white p-3">
                    Trace Logs
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4 text-xs text-[#64748b]">
                  Local · Docker · Kubernetes
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-10">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#64748b]">
                Use cases
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-[#0b0f14]">
                Ship confidence-backed agent workflows.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {useCases.map((useCase) => (
                <div
                  key={useCase}
                  className="rounded-2xl border border-[#e2e8f0] bg-white/80 p-5 text-sm font-semibold text-[#1e293b]"
                >
                  {useCase}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto w-full max-w-6xl rounded-[32px] border border-[#0b0f14] bg-[#0b0f14] p-10 text-white shadow-2xl shadow-[#0b0f14]/30">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#94a3b8]">
                  Open source
                </p>
                <h2 className="mt-4 text-3xl font-semibold text-white">
                  Built for builders, open for everyone.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#cbd5e1]">
                  Parallax is Apache 2.0 and welcomes contributions. Build
                  production-grade workflows or fork it for your research stack.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://github.com/parallax-ai/parallax"
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0b0f14]"
                >
                  Star on GitHub
                </a>
                <a
                  href="https://docs.parallaxai.dev/docs/getting-started/installation"
                  className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white"
                >
                  Install locally
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="mx-auto w-full max-w-6xl rounded-[32px] border border-[#e2e8f0] bg-white/90 p-10 shadow-xl shadow-[#0f172a]/10">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#64748b]">
                  Contact
                </p>
                <h2 className="mt-4 text-3xl font-semibold text-[#0b0f14]">
                  Want to collaborate or share feedback?
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-[#64748b]">
                  We would love to hear how you are using Parallax or what you
                  want to see next. Drop a note and we will follow up.
                </p>
              </div>
              <form
                name="contact"
                method="POST"
                data-netlify="true"
                data-netlify-honeypot="bot-field"
                className="grid gap-4"
              >
                <input type="hidden" name="form-name" value="contact" />
                <input type="hidden" name="bot-field" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">
                    Name
                    <input
                      name="name"
                      required
                      className="mt-2 w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] shadow-sm focus:border-[#35b5e9] focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      className="mt-2 w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] shadow-sm focus:border-[#35b5e9] focus:outline-none"
                    />
                  </label>
                </div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[#64748b]">
                  Message
                  <textarea
                    name="message"
                    rows={4}
                    required
                    className="mt-2 w-full rounded-2xl border border-[#e2e8f0] px-4 py-3 text-sm text-[#0f172a] shadow-sm focus:border-[#35b5e9] focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-full bg-[#35b5e9] px-6 py-3 text-sm font-semibold text-[#0b0f14] shadow-lg shadow-[#35b5e9]/30 transition hover:-translate-y-0.5"
                >
                  Send message
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e2e8f0] px-6 py-10 text-sm text-[#64748b]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <span>Parallax — multi-agent orchestration.</span>
          <div className="flex flex-wrap gap-4">
            <a href="https://docs.parallaxai.dev/docs/intro">Docs</a>
            <a href="https://docs.parallaxai.dev/docs/enterprise/overview">
              Enterprise
            </a>
            <a href="https://github.com/parallax-ai/parallax">GitHub</a>
            <a href="https://discord.gg/jdjqvMa2">Discord</a>
            <a href="https://x.com/Parallax__AI">X</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
