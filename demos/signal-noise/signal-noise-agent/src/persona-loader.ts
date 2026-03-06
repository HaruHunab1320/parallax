import fs from 'fs';
import path from 'path';

export interface PersonaConfig {
  id: string;
  name: string;
  role: string;
  channel: string;
  personality: string;
  knowledge: string[];
}

/**
 * Load persona configuration from a directory containing personality.md
 * and knowledge/*.md files.
 *
 * personality.md must have YAML front-matter with id, name, role, channel.
 */
export function loadPersona(personaDir: string): PersonaConfig {
  const personalityPath = path.join(personaDir, 'personality.md');
  if (!fs.existsSync(personalityPath)) {
    throw new Error(`personality.md not found in ${personaDir}`);
  }

  const raw = fs.readFileSync(personalityPath, 'utf-8');
  const { frontMatter, body } = parseFrontMatter(raw);

  const id = frontMatter.id;
  const name = frontMatter.name;
  const role = frontMatter.role;
  const channel = frontMatter.channel;

  if (!id || !name || !role || !channel) {
    throw new Error(
      `personality.md in ${personaDir} missing required front-matter fields (id, name, role, channel)`
    );
  }

  // Load all knowledge files
  const knowledgeDir = path.join(personaDir, 'knowledge');
  const knowledge: string[] = [];
  if (fs.existsSync(knowledgeDir)) {
    const files = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      knowledge.push(fs.readFileSync(path.join(knowledgeDir, file), 'utf-8'));
    }
  }

  return { id, name, role, channel, personality: body, knowledge };
}

function parseFrontMatter(content: string): {
  frontMatter: Record<string, string>;
  body: string;
} {
  const frontMatter: Record<string, string> = {};

  if (!content.startsWith('---')) {
    return { frontMatter, body: content };
  }

  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) {
    return { frontMatter, body: content };
  }

  const yamlBlock = content.slice(3, endIdx).trim();
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontMatter[key] = value;
  }

  const body = content.slice(endIdx + 3).trim();
  return { frontMatter, body };
}
