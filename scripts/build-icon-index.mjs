// Builds the icon index of the icon picker from an unpacked @tabler/icons
// npm package: outline icons only, without the "Brand" category (logos of
// other companies are trademarks). The result is committed, so neither the
// build nor the browser fetch anything from a CDN.
//
//   node scripts/build-icon-index.mjs <unpacked package dir> <output dir>
//
// Without Node, e.g.:
//   docker run --rm -v "$PWD:/w" -w /w node:24-alpine sh -c \
//     'cd /tmp && npm pack @tabler/icons@3.52.0 && tar xzf tabler-icons-*.tgz &&
//      cd /w && node scripts/build-icon-index.mjs /tmp/package site/assets/icons'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [pkgDir, outDir] = process.argv.slice(2);
if (!pkgDir || !outDir) {
	console.error('usage: build-icon-index.mjs <unpacked package dir> <output dir>');
	process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(pkgDir, 'icons.json'), 'utf8'));
const nodes = JSON.parse(readFileSync(join(pkgDir, 'tabler-nodes-outline.json'), 'utf8'));

const icons = [];
let skipped = 0;
for (const name of Object.keys(nodes).sort()) {
	const info = meta[name] || {};
	if (info.category === 'Brand' || name.startsWith('brand-')) {
		skipped++;
		continue;
	}
	const paths = nodes[name].filter(([tag]) => tag === 'path').map(([, attrs]) => attrs.d);
	if (paths.length !== nodes[name].length) {
		// the picker writes path data only; other shapes would be lost
		skipped++;
		continue;
	}
	const words = [info.category || '', ...(info.tags || [])].map((t) => String(t).toLowerCase()).filter(Boolean);
	icons.push([name, [...new Set(words)].join(' '), paths]);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tabler-outline.json'), JSON.stringify({ version: pkg.version, icons }));
writeFileSync(join(outDir, 'LICENSE-tabler-icons.txt'), readFileSync(join(pkgDir, 'LICENSE'), 'utf8'));
console.log(`@tabler/icons ${pkg.version}: ${icons.length} icons, ${skipped} skipped`);
