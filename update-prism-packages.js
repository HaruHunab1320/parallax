#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// Packages to update
const PRISM_PACKAGES = {
  '@prism-lang/core': 'latest',
  '@prism-lang/validator': 'latest'
};

async function updatePackageJson(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const packageJson = JSON.parse(content);
    let updated = false;
    
    // Update dependencies
    if (packageJson.dependencies) {
      for (const [pkg, version] of Object.entries(PRISM_PACKAGES)) {
        if (packageJson.dependencies[pkg]) {
          packageJson.dependencies[pkg] = version;
          updated = true;
          console.log(`  Updated ${pkg} in dependencies`);
        }
      }
    }
    
    // Update devDependencies
    if (packageJson.devDependencies) {
      for (const [pkg, version] of Object.entries(PRISM_PACKAGES)) {
        if (packageJson.devDependencies[pkg]) {
          packageJson.devDependencies[pkg] = version;
          updated = true;
          console.log(`  Updated ${pkg} in devDependencies`);
        }
      }
    }
    
    if (updated) {
      await fs.writeFile(filePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
      console.log(`✓ Updated: ${filePath}`);
    } else {
      console.log(`- No updates needed: ${filePath}`);
    }
    
    return updated;
  } catch (error) {
    console.error(`✗ Error updating ${filePath}: ${error.message}`);
    return false;
  }
}

async function findPackageJsonFiles(dir) {
  const files = [];
  
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and .git
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          await walk(fullPath);
        }
      } else if (entry.isFile() && entry.name === 'package.json') {
        files.push(fullPath);
      }
    }
  }
  
  await walk(dir);
  return files;
}

async function main() {
  console.log('Updating @prism-lang packages to latest version...\n');
  
  const rootDir = path.join(__dirname);
  const packageFiles = await findPackageJsonFiles(rootDir);
  
  console.log(`Found ${packageFiles.length} package.json files\n`);
  
  let updatedCount = 0;
  for (const file of packageFiles) {
    const updated = await updatePackageJson(file);
    if (updated) updatedCount++;
  }
  
  console.log(`\n✅ Updated ${updatedCount} package.json files`);
  console.log('\nNext steps:');
  console.log('1. Run "pnpm install" to update the packages');
  console.log('2. Test that everything still works with the new versions');
}

main().catch(console.error);