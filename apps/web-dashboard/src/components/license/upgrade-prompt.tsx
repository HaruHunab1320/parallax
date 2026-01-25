'use client';

import React from 'react';

interface UpgradePromptProps {
  feature?: string;
}

export function UpgradePrompt({ feature }: UpgradePromptProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-parallax-dark p-8">
      <div className="max-w-2xl w-full">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🚀 Parallax Enterprise
          </h1>
          <p className="text-parallax-gray text-lg">
            Production-ready features for your AI orchestration
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-parallax-card border border-parallax-border rounded-xl p-8">
          {feature && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
              <p className="text-blue-400 text-sm">
                <span className="font-semibold">Feature requested:</span> {feature}
              </p>
            </div>
          )}

          <h2 className="text-2xl font-semibold text-white mb-4">
            The Web Dashboard requires Parallax Enterprise
          </h2>

          <p className="text-parallax-gray mb-6">
            You're running Parallax Open Source, which includes unlimited agents and all patterns.
            The web dashboard requires Enterprise for persistent data storage.
          </p>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <FeatureItem
              icon="💾"
              title="Persistence"
              description="Execution history & metrics stored in PostgreSQL"
            />
            <FeatureItem
              icon="📊"
              title="Dashboard"
              description="Real-time monitoring & agent management"
            />
            <FeatureItem
              icon="⏰"
              title="Scheduling"
              description="Cron jobs & event triggers for automation"
            />
            <FeatureItem
              icon="🔄"
              title="High Availability"
              description="Clustering & automatic failover"
            />
            <FeatureItem
              icon="👥"
              title="Multi-user"
              description="Team workspaces with RBAC & SSO"
            />
            <FeatureItem
              icon="🛟"
              title="Priority Support"
              description="SLA-backed assistance from our team"
            />
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="https://parallax.ai/enterprise"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg text-center transition-colors"
            >
              Start 30-Day Free Trial
            </a>
            <a
              href="https://parallax.ai/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-parallax-dark hover:bg-parallax-darker text-white font-semibold py-3 px-6 rounded-lg text-center border border-parallax-border transition-colors"
            >
              View Pricing
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-parallax-gray text-sm">
            Already have a license?{' '}
            <code className="bg-parallax-card px-2 py-1 rounded text-xs">
              PARALLAX_LICENSE_KEY=your-key
            </code>
          </p>
          <p className="text-parallax-gray text-sm mt-2">
            <a href="https://docs.parallax.ai/enterprise/licensing" className="text-blue-400 hover:underline">
              View licensing documentation →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-parallax-dark/50">
      <span className="text-2xl">{icon}</span>
      <div>
        <h3 className="text-white font-medium">{title}</h3>
        <p className="text-parallax-gray text-sm">{description}</p>
      </div>
    </div>
  );
}
