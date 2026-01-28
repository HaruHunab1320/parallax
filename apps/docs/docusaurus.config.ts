import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Parallax',
  tagline: 'Multi-agent orchestration for reliable AI systems',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.parallax.dev',
  baseUrl: '/',

  organizationName: 'parallax-ai',
  projectName: 'parallax',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/parallax-ai/parallax/tree/main/apps/docs/',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themes: ['@docusaurus/theme-mermaid'],
  markdown: {
    mermaid: true,
  },

  themeConfig: {
    image: 'img/parallax-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: '',
      logo: {
        alt: 'Parallax Logo',
        src: 'img/parallax-LIGHT-no-text.png',
        srcDark: 'img/parallax-DARK.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
          docId: 'intro',
        },
        {
          to: '/docs/sdk/overview',
          label: 'SDK',
          position: 'left',
        },
        {
          to: '/docs/patterns/overview',
          label: 'Patterns',
          position: 'left',
        },
        {
          href: 'https://parallax.dev/builder',
          label: 'Pattern Builder',
          position: 'right',
        },
        {
          href: 'https://github.com/parallax-ai/parallax',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/installation',
            },
            {
              label: 'SDK Reference',
              to: '/docs/sdk/overview',
            },
            {
              label: 'Pattern Library',
              to: '/docs/patterns/overview',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/parallax-ai/parallax/discussions',
            },
            {
              label: 'Discord',
              href: 'https://discord.gg/parallax',
            },
            {
              label: 'X',
              href: 'https://twitter.com/parallax__ai',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/parallax-ai/parallax',
            },
            {
              label: 'Pattern Builder',
              href: 'https://parallax.dev/builder',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Parallax.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['typescript', 'yaml', 'bash', 'json'],
    },
    mermaid: {
      theme: {light: 'base', dark: 'dark'},
      options: {
        themeVariables: {
          background: 'transparent',
          primaryColor: '#ffffff',
          primaryBorderColor: '#2a9fcd',
          primaryTextColor: '#0f1720',
          lineColor: '#2a9fcd',
          secondaryColor: '#f7f8fb',
          tertiaryColor: '#ffffff',
          clusterBkg: 'transparent',
          clusterBorder: 'rgba(217, 45, 136, 0.35)',
          noteBkgColor: '#ffffff',
          noteTextColor: '#0f1720',
          noteBorderColor: '#f5ed4c',
        },
      },
    },
    // TODO: Set up Algolia DocSearch when ready
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_SEARCH_API_KEY',
    //   indexName: 'parallax',
    //   contextualSearch: true,
    // },
  } satisfies Preset.ThemeConfig,
};

export default config;
