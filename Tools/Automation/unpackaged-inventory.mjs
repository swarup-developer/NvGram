import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const patterns = {
  storage: /ApplicationData\.Current/g,
  identity: /(?:Package|AppInfo)\.Current/g,
  activation: /AppInstance\.GetActivatedEventArgs/g,
  resources: /ResourceLoader\.|ResourceContext\.|ms-appx:/g,
  integration: /FullTrustProcessLauncher\.|StartupTask\.|ToastNotificationManager\.|TileUpdateManager\./g
};
function scan(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['obj', 'bin', 'AppPackages', 'Generated Files'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return scan(path);
    if (!entry.name.endsWith('.cs') || entry.name === 'Constants.Secret.cs') return [];
    const findings = [];
    readFileSync(path, 'utf8').split(/\r?\n/).forEach((text, index) => {
      if (text.trimStart().startsWith('//')) return;
      for (const [category, pattern] of Object.entries(patterns)) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) findings.push({ file: path.replaceAll('\\', '/'), line: index + 1, category });
      }
    });
    return findings;
  });
}
const findings = scan('Telegram');
const counts = Object.fromEntries(Object.keys(patterns).map(category => [category, findings.filter(item => item.category === category).length]));
mkdirSync('artifacts/unpackaged', { recursive: true });
writeFileSync('artifacts/unpackaged/inventory.json', JSON.stringify({ schemaVersion: 1, counts, findings, limitations: 'Candidate call sites, not verified defects; compiled flavors and runtime reachability require review. Credentials and source line contents are never emitted.' }, null, 2) + '\n');
console.log(JSON.stringify({ files: new Set(findings.map(item => item.file)).size, counts }, null, 2));
