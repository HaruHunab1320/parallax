"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { PatternBuilder } from "@parallax/pattern-builder";

export default function BuilderPage() {
  const [latestYaml, setLatestYaml] = useState<string | null>(null);

  const handleSave = useCallback((yaml: string) => {
    setLatestYaml(yaml);
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "parallax-pattern.yaml";
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-[#d7dee8] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Image
            src="/img/parallax-LIGHT-no-text.png"
            alt="Parallax"
            width={40}
            height={40}
            priority
          />
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7c8798]">
              Parallax
            </span>
            <span className="text-sm font-semibold text-[#0f172a]">
              Pattern Builder
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <a
            href="https://docs.parallaxai.dev/docs/pattern-builder/overview"
            className="rounded-full border border-[#e2e8f0] px-4 py-2 font-semibold text-[#475569] transition hover:border-[#35b5e9]"
          >
            Docs
          </a>
          <a
            href="https://docs.parallaxai.dev/docs/patterns/overview"
            className="rounded-full border border-[#e2e8f0] px-4 py-2 font-semibold text-[#475569] transition hover:border-[#35b5e9]"
          >
            Patterns
          </a>
          <a
            href="https://github.com/parallax-ai/parallax"
            className="rounded-full bg-[#35b5e9] px-4 py-2 font-semibold text-[#0b0f14] shadow-md shadow-[#35b5e9]/30 transition hover:-translate-y-0.5"
          >
            GitHub
          </a>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e2e8f0] bg-white/80 px-6 py-3 text-xs text-[#64748b]">
          <span>Design orchestration patterns visually, then export to YAML.</span>
          <span>
            {latestYaml ? "Last export ready" : "No export yet"}
          </span>
        </div>

        <div className="flex-1 overflow-hidden">
          <PatternBuilder onSave={handleSave} showYamlPreview />
        </div>
      </main>
    </div>
  );
}
