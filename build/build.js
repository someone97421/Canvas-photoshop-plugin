#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const steps = [
  'pnpm --filter ./packages/sdppp-photoshop... build',
  'node build/package-psccx.js',
  'cross-env NODE_ENV=production node typescripts/_build/esbuild.ts',
  'node build/package-all.js'
]

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get package name from command line arguments or build all
const packageName = process.argv[2];

async function buildAll() {
  console.log('🚀 Building all packages in correct order...');
  
  const rootDir = join(__dirname, '..');
  
  try {
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      
      console.log(`📦 Step ${stepIndex + 1}: ${step}`);
      execSync(step, {
        stdio: 'inherit',
        cwd: rootDir,
        shell: true
      });
    }
    
    console.log('✅ All packages built successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

async function buildSinglePackage(packageName) {
  const packageDir = join(__dirname, '../packages', packageName);
  
  if (!existsSync(packageDir)) {
    console.error(`❌ Package '${packageName}' not found in packages/`);
    process.exit(1);
  }
  
  const packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error(`❌ No package.json found in ${packageName}`);
    process.exit(1);
  }
  
  console.log(`🚀 Building package: ${packageName}`);
  
  try {
    execSync(`pnpm --filter ./packages/${packageName}... build`, {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    });
    
    // If building sdppp-photoshop, run the packaging script
    if (packageName === 'sdppp-photoshop') {
      console.log('📋 Running Photoshop packaging...');
      await import('./package-psccx.js');
    }
    
    console.log(`✅ Build completed successfully for ${packageName}`);
  } catch (error) {
    console.error(`❌ Build failed for ${packageName}:`, error.message);
    process.exit(1);
  }
}

// Main execution
if (!packageName) {
  console.log('Available packages:');
  
  const packagesDir = join(__dirname, '../packages');
  if (existsSync(packagesDir)) {
    const packages = readdirSync(packagesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    packages.forEach(pkg => console.log(`  - ${pkg}`));
  }
  console.log('\nUsage: node build/build.js [package-name]');
  console.log('Building all packages...\n');
  
  await buildAll();
} else {
  await buildSinglePackage(packageName);
}
