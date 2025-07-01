#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ANSI colors for better output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// Removed unused getFileSize function

/**
 * Get directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        totalSize += getDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
    return 0;
  }

  return totalSize;
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get gzipped size of a file
 */
function getGzippedSize(filePath) {
  try {
    const result = execSync(`gzip -c "${filePath}" | wc -c`, { encoding: 'utf8' });
    return Number.parseInt(result.trim());
  } catch {
    return 0;
  }
}

/**
 * Analyze a single package
 */
function analyzePackage(packagePath) {
  const packageJsonPath = path.join(packagePath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const distPath = path.join(packagePath, 'dist');
  const srcPath = path.join(packagePath, 'src');

  const analysis = {
    name: packageJson.name,
    version: packageJson.version,
    srcSize: getDirectorySize(srcPath),
    distSize: getDirectorySize(distPath),
    files: [],
  };

  // Analyze individual files in dist
  if (fs.existsSync(distPath)) {
    const distFiles = fs.readdirSync(distPath);
    for (const file of distFiles) {
      const filePath = path.join(distPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        const size = stats.size;
        const gzippedSize = getGzippedSize(filePath);

        analysis.files.push({
          name: file,
          size,
          gzippedSize,
          compression: size > 0 ? (((size - gzippedSize) / size) * 100).toFixed(1) : 0,
        });
      }
    }
  }

  return analysis;
}

/**
 * Main analysis function
 */
function analyzeAllPackages() {
  const packagesDir = path.join(process.cwd(), 'packages');
  const packages = [];

  if (!fs.existsSync(packagesDir)) {
    console.log(`${colors.red}Error: packages directory not found${colors.reset}`);
    process.exit(1);
  }

  const packageDirs = fs.readdirSync(packagesDir);

  for (const dir of packageDirs) {
    const packagePath = path.join(packagesDir, dir);
    const analysis = analyzePackage(packagePath);

    if (analysis) {
      packages.push(analysis);
    }
  }

  return packages;
}

/**
 * Display results
 */
function displayResults(packages) {
  console.log(`\n${colors.bright}${colors.blue}📦 Rilay Package Size Analysis${colors.reset}\n`);

  const totalSrcSize = packages.reduce((sum, pkg) => sum + pkg.srcSize, 0);
  const totalDistSize = packages.reduce((sum, pkg) => sum + pkg.distSize, 0);

  console.log(`${colors.cyan}Overview:${colors.reset}`);
  console.log(`  Total source size: ${colors.green}${formatBytes(totalSrcSize)}${colors.reset}`);
  console.log(`  Total dist size: ${colors.green}${formatBytes(totalDistSize)}${colors.reset}`);
  console.log(
    `  Compression ratio: ${colors.yellow}${totalSrcSize > 0 ? (((totalSrcSize - totalDistSize) / totalSrcSize) * 100).toFixed(1) : 0}%${colors.reset}\n`
  );

  for (const pkg of packages) {
    console.log(
      `${colors.bright}${pkg.name}${colors.reset} ${colors.yellow}v${pkg.version}${colors.reset}`
    );
    console.log(`  Source: ${formatBytes(pkg.srcSize)}`);
    console.log(`  Built: ${formatBytes(pkg.distSize)}`);

    if (pkg.files.length > 0) {
      console.log('  Files:');
      for (const file of pkg.files.sort((a, b) => b.size - a.size)) {
        const gzipInfo =
          file.gzippedSize > 0
            ? ` (${formatBytes(file.gzippedSize)} gzipped, ${file.compression}% compression)`
            : '';
        console.log(`    ${file.name}: ${formatBytes(file.size)}${gzipInfo}`);
      }
    } else {
      console.log(
        `  ${colors.yellow}⚠️  No dist files found - run 'pnpm build' first${colors.reset}`
      );
    }

    console.log('');
  }
}

/**
 * Generate size report in JSON format
 */
function generateReport(packages) {
  const report = {
    timestamp: new Date().toISOString(),
    packages: packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
      sizes: {
        source: pkg.srcSize,
        built: pkg.distSize,
        files: pkg.files.reduce((acc, file) => {
          acc[file.name] = {
            raw: file.size,
            gzipped: file.gzippedSize,
            compression: Number.parseFloat(file.compression),
          };
          return acc;
        }, {}),
      },
    })),
    totals: {
      source: packages.reduce((sum, pkg) => sum + pkg.srcSize, 0),
      built: packages.reduce((sum, pkg) => sum + pkg.distSize, 0),
    },
  };

  const reportPath = path.join(process.cwd(), 'size-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${colors.green}📊 Size report saved to: ${reportPath}${colors.reset}`);
}

// Run the analysis
if (require.main === module) {
  const shouldGenerateReport = process.argv.includes('--report');
  const packages = analyzeAllPackages();

  displayResults(packages);

  if (shouldGenerateReport) {
    generateReport(packages);
  }
}

module.exports = { analyzeAllPackages, formatBytes };
