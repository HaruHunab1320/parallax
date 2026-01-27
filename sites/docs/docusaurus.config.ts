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
          editUrl: 'https://github.com/parallax-ai/parallax/tree/main/sites/docs/',
          routeBasePath: '/', // Docs at root
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

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
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/sdk/overview',
          label: 'SDK',
          position: 'left',
        },
        {
          to: '/patterns/overview',
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
              to: '/getting-started/installation',
            },
            {
              label: 'SDK Reference',
              to: '/sdk/overview',
            },
            {
              label: 'Pattern Library',
              to: '/patterns/overview',
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
              label: 'Twitter',
              href: 'https://twitter.com/parallax_ai',
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
      copyright: `Copyright © ${new Date().getFullYear()} Parallax. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['typescript', 'yaml', 'bash', 'json'],
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
