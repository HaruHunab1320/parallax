import clsx from "clsx";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import CodeBlock from "@theme/CodeBlock";
import React from "react";

import styles from "./index.module.css";

const Icons = {
  layers: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  ),
  check: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  gauge: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  ),
  terminal: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  radar: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
    </svg>
  ),
  deploy: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 17h7" />
      <path d="M17 14v7" />
    </svg>
  ),
  usecase: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6" />
      <path d="M6 9h12" />
      <path d="M7 13h10" />
      <path d="M8 17h8" />
      <path d="M9 21h6" />
    </svg>
  ),
};

const heroCode = `# pattern.yaml
name: content-moderation
version: 1.0.0

agents:
  capabilities: [moderation]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: majority

validation:
  minConfidence: 0.8

output:
  verdict: $vote.result
  confidence: $vote.confidence

# Run and get a confidence-scored result
parallax run pattern.yaml --input '{ "content": "..." }'`;

function Feature({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={styles.feature}>
      <div className={styles.featureIcon}>{icon}</div>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDescription}>{description}</p>
    </div>
  );
}

function UseCase({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={styles.useCase}>
      <div className={styles.useCaseIcon}>{Icons.usecase}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export default function Home(): React.ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <div className={styles.heroLogoWrap}>
              <img
                src="/img/parallax-LIGHT.png"
                alt="Parallax"
                className={clsx(styles.heroLogo, "light-mode-only")}
              />
              <img
                src="/img/parallax-DARK.png"
                alt="Parallax"
                className={clsx(styles.heroLogo, "dark-mode-only")}
              />
            </div>
            <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
            <div className={styles.heroButtons}>
              <Link
                className={clsx("button", styles.primaryButton)}
                to="/docs/getting-started/quickstart"
              >
                Get Started
              </Link>
              <Link
                className={clsx("button", styles.secondaryButton)}
                to="/docs/patterns/overview"
              >
                Pattern Library
              </Link>
              <Link
                className={clsx("button", styles.ghostButton)}
                to="https://parallax.dev/builder"
              >
                Pattern Builder
              </Link>
            </div>
          </div>
          <div className={styles.heroCode}>
            <CodeBlock language="yaml" title="pattern.yaml">
              {heroCode}
            </CodeBlock>
          </div>
        </div>
      </header>

      <section className={styles.features}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Why Parallax?</h2>
            <p className={styles.sectionSubtitle}>
              Orchestrate reliable multi-agent systems with measurable confidence.
            </p>
          </div>
          <div className={styles.featuresGrid}>
            <Feature
              icon={Icons.layers}
              title="Orchestration Patterns"
              description="Compose consensus, voting, merge, and quality-gate flows with simple YAML or the visual builder."
            />
            <Feature
              icon={Icons.check}
              title="Consensus & Voting"
              description="Aggregate multiple agents into a single result with traceable decisions and confidence scores."
            />
            <Feature
              icon={Icons.gauge}
              title="Confidence Scoring"
              description="Quantify uncertainty and enforce thresholds before results move downstream."
            />
            <Feature
              icon={Icons.terminal}
              title="Agent Runtime Control"
              description="Spawn, monitor, and shut down CLI agents locally, in Docker, or in Kubernetes."
            />
            <Feature
              icon={Icons.radar}
              title="Observability"
              description="Trace executions end-to-end with logs, metrics, and audit-ready event history."
            />
            <Feature
              icon={Icons.deploy}
              title="Production-Ready"
              description="Scale to HA clusters with persistence, scheduling, and enterprise security."
            />
          </div>
        </div>
      </section>

      <section className={styles.useCases}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Built for real workloads</h2>
            <p className={styles.sectionSubtitle}>
              Turn brittle agent calls into resilient systems.
            </p>
          </div>
          <div className={styles.useCaseGrid}>
            <UseCase
              title="Content Moderation"
              description="Cross-check multiple models, vote, and block low-confidence results."
            />
            <UseCase
              title="Code Review"
              description="Parallelize specialized agents and merge findings into a single report."
            />
            <UseCase
              title="Data Extraction"
              description="Combine multiple interpretations and validate against a confidence threshold."
            />
            <UseCase
              title="QA & Verification"
              description="Route tasks through quality gates before they reach production."
            />
          </div>
        </div>
      </section>

      <section className={styles.installSection}>
        <div className={styles.installContent}>
          <h2>Start orchestrating in minutes</h2>
          <p>
            Install the SDK, run your first pattern, and scale as you grow.
          </p>
          <div className={styles.heroButtons}>
            <Link className={clsx("button", styles.primaryButton)} to="/docs/getting-started/quickstart">
              Quickstart
            </Link>
            <Link className={clsx("button", styles.secondaryButton)} to="/docs/sdk/overview">
              SDK Reference
            </Link>
            <Link className={clsx("button", styles.ghostButton)} to="https://github.com/parallax-ai/parallax">
              GitHub
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
