/* openLitfass config: the loaded instance ("workspace"). The configuration
   files of one instance are read from a folder, single files, a ZIP or a
   git repository (assets/repo.js) and kept in localStorage as text, so that
   every form page can edit them and the whole set can be downloaded again
   as a ZIP. Files that are not changed are written back byte for byte.
   Nothing is sent anywhere. */
(function () {
	'use strict';

	const KEY = 'ol-config-workspace';
	const ROOT_FILES = ['instance.json', 'categories.json', 'places.json', 'holidays.json'];
	const FOLDERS = ['sources/', 'inbox/'];
	const listeners = [];

	let state = read();

	function read() {
		try {
			const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
			if (raw && raw.files && typeof raw.files === 'object') return raw;
		} catch (e) {}
		return null;
	}

	function persist() {
		try {
			if (state) localStorage.setItem(KEY, JSON.stringify(state));
			else localStorage.removeItem(KEY);
		} catch (e) {
			throw new Error('The browser storage is full or blocked; the instance cannot be kept.');
		}
		listeners.forEach((fn) => fn());
	}

	function sortedPaths() {
		const rank = (p) => {
			const root = ROOT_FILES.indexOf(p);
			if (root >= 0) return '0' + root;
			return (p.indexOf('sources/') === 0 ? '1' : p.indexOf('inbox/') === 0 ? '2' : '3') + p;
		};
		return Object.keys(state ? state.files : {}).sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
	}

	function parse(text) {
		try {
			const obj = JSON.parse(String(text).replace(/^﻿/, ''));
			return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
		} catch (e) {
			return null;
		}
	}

	/* JSON with sorted keys, to compare content regardless of key order */
	function canonical(value) {
		if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
		if (value && typeof value === 'object') {
			return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
		}
		return JSON.stringify(value);
	}

	function format(obj) {
		return JSON.stringify(obj, null, 2) + '\n';
	}

	/* where a file belongs in the instance, or '' if it is not a config file */
	function classify(path, text) {
		const rel = path.replace(/\\/g, '/').replace(/^\/+/, '');
		if (ROOT_FILES.indexOf(rel) >= 0) return rel;
		if (/^(sources|inbox)\/[^/]+\.json$/i.test(rel)) return rel.replace(/^(sources|inbox)/i, (m) => m.toLowerCase());
		if (rel.indexOf('/') >= 0 || !/\.json$/i.test(rel)) return '';
		const obj = parse(text);
		if (!obj) return '';
		if (typeof obj.type === 'string' && typeof obj.url === 'string') return 'sources/' + rel;
		if (typeof obj.title === 'string' && (obj.date || obj.repeat)) return 'inbox/' + rel;
		return '';
	}

	/* paths below a common top folder (the instance folder) lose it */
	function stripTop(paths) {
		const tops = paths.map((p) => (p.indexOf('/') > 0 ? p.split('/')[0] : ''));
		const top = tops[0];
		if (!top || tops.some((t) => t !== top)) return (p) => p;
		const known = ['sources', 'inbox'];
		if (known.indexOf(top.toLowerCase()) >= 0 && paths.every((p) => p.split('/').length === 2)) return (p) => p;
		return (p) => p.slice(top.length + 1);
	}

	function readText(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsText(file);
		});
	}

	/* JSZip is only loaded when a ZIP is read or written */
	let zipLoading = null;
	function loadZip() {
		if (window.JSZip) return Promise.resolve(window.JSZip);
		if (!zipLoading) {
			zipLoading = new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src = 'assets/lib/jszip-3.10.1.min.js';
				script.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('ZIP support did not load.')));
				script.onerror = () => { zipLoading = null; reject(new Error('ZIP support did not load.')); };
				document.head.appendChild(script);
			});
		}
		return zipLoading;
	}

	/* entries: [{ path, file }] (path relative to what was picked or dropped)
	   or [{ path, read }]; origin: where a replacing import came from */
	async function importEntries(entries, replace, origin) {
		// only the paths first: a picked instance folder also holds data/,
		// public/ and .git/, which are never read
		const candidates = [];
		for (const entry of entries) {
			if (/\.zip$/i.test(entry.path)) {
				const archive = await (await loadZip()).loadAsync(entry.file);
				Object.keys(archive.files).filter((n) => !archive.files[n].dir).forEach((name) => {
					candidates.push({ path: name, read: () => archive.files[name].async('string') });
				});
			} else {
				candidates.push({ path: entry.path, read: entry.read || (() => readText(entry.file)) });
			}
		}
		const strip = stripTop(candidates.map((c) => c.path.replace(/\\/g, '/')));
		const files = replace || !state ? {} : Object.assign({}, state.files);
		const report = { added: [], replaced: [], ignored: [], invalid: [] };
		for (const c of candidates) {
			const rel = strip(c.path.replace(/\\/g, '/'));
			if (/(^|\/)\./.test(rel) || !/\.json$/i.test(rel)) continue;
			const possible = ROOT_FILES.indexOf(rel) >= 0 || /^(sources|inbox)\/[^/]+$/i.test(rel) || rel.indexOf('/') < 0;
			if (!possible) continue;
			const text = await c.read();
			const target = classify(rel, text);
			if (!target) {
				report.ignored.push(rel);
				continue;
			}
			if (!parse(text)) report.invalid.push(target);
			(files[target] !== undefined ? report.replaced : report.added).push(target);
			files[target] = text;
		}
		if (!report.added.length && !report.replaced.length) return report;
		const from = replace || !state ? origin : state.origin;
		state = { files: files, loaded: new Date().toISOString() };
		if (from) state.origin = from;
		persist();
		return report;
	}

	function get(path) {
		return state && state.files[path] !== undefined ? parse(state.files[path]) : null;
	}

	/* stores obj at path unless it has the same content as the file there;
	   keys listed in keep (e.g. "status") are taken over from the old file */
	function save(path, obj, keep) {
		if (!state) return false;
		const old = state.files[path] !== undefined ? parse(state.files[path]) : null;
		const merged = Object.assign({}, obj);
		(keep || []).forEach((key) => { if (old && key in old && !(key in merged)) merged[key] = old[key]; });
		if (old && canonical(old) === canonical(merged)) return false;
		state.files[path] = format(merged);
		persist();
		return true;
	}

	function move(from, to) {
		if (!state || state.files[from] === undefined || from === to) return;
		state.files[to] = state.files[from];
		delete state.files[from];
		persist();
	}

	function remove(path) {
		if (!state || state.files[path] === undefined) return;
		delete state.files[path];
		persist();
	}

	function clear() {
		state = null;
		persist();
	}

	/* ---------- cross-file references ---------- */

	function categoryNames() {
		const cats = get('categories.json');
		return cats && Array.isArray(cats.categories) ? cats.categories.map((c) => c && c.name).filter(Boolean) : null;
	}

	function placeKeys() {
		const places = get('places.json');
		if (!places || !Array.isArray(places.places)) return null;
		const keys = [];
		places.places.forEach((pl) => { if (pl && pl.id) keys.push(pl.id); ((pl && pl.refs) || []).forEach((r) => keys.push(r)); });
		return keys;
	}

	/* every place in the instance's files that names a category:
	   { path, where, value, set(obj, newValue) } */
	function categoryRefs(only) {
		const refs = [];
		sortedPaths().forEach((path) => {
			if (only && path !== only) return;
			const obj = get(path);
			if (!obj) return;
			if (path.indexOf('sources/') === 0) {
				Object.keys(obj.categoryMap || {}).forEach((from) => refs.push({
					path: path, where: 'category map “' + from + '”', value: obj.categoryMap[from],
					set: (o, v) => { o.categoryMap[from] = v; },
				}));
				(Array.isArray(obj.categoryRules) ? obj.categoryRules : []).forEach((r, i) => {
					if (r && typeof r.category === 'string') refs.push({
						path: path, where: 'category rule “' + r.regex + '”', value: r.category,
						set: (o, v) => { o.categoryRules[i].category = v; },
					});
				});
				(Array.isArray(obj.categories) ? obj.categories : []).forEach((name, i) => refs.push({
					path: path, where: 'allowed categories', value: name,
					set: (o, v) => { o.categories[i] = v; },
				}));
				const rule = obj.mapping && obj.mapping.category;
				if (rule && typeof rule.default === 'string') refs.push({
					path: path, where: 'mapping default', value: rule.default,
					set: (o, v) => { o.mapping.category.default = v; },
				});
			} else if (path.indexOf('inbox/') === 0 && typeof obj.category === 'string') {
				refs.push({ path: path, where: 'category', value: obj.category, set: (o, v) => { o.category = v; } });
			}
		});
		return refs;
	}

	function placeRefs(only) {
		const refs = [];
		sortedPaths().forEach((path) => {
			if (only && path !== only) return;
			const obj = get(path);
			if (!obj) return;
			if ((path.indexOf('sources/') === 0 || path.indexOf('inbox/') === 0) && typeof obj.place === 'string' && obj.place) {
				refs.push({ path: path, where: 'place', value: obj.place, set: (o, v) => { o.place = v; } });
			}
			const rule = obj.mapping && obj.mapping.placeRef;
			if (path.indexOf('sources/') === 0 && rule && typeof rule.default === 'string') {
				refs.push({ path: path, where: 'placeRef default', value: rule.default, set: (o, v) => { o.mapping.placeRef.default = v; } });
			}
		});
		return refs;
	}

	/* renames value in all refs; returns the changed paths */
	function rename(refs, from, to, skip) {
		const changed = {};
		refs.filter((r) => r.value === from && r.path !== skip).forEach((r) => {
			if (!changed[r.path]) changed[r.path] = get(r.path);
			r.set(changed[r.path], to);
		});
		Object.keys(changed).forEach((path) => { state.files[path] = format(changed[path]); });
		if (Object.keys(changed).length) persist();
		return Object.keys(changed);
	}

	/* problems across files, for the start page */
	function check() {
		const problems = [];
		if (!state) return problems;
		sortedPaths().forEach((path) => { if (!get(path)) problems.push({ path: path, text: 'is not valid JSON.' }); });
		const cats = categoryNames();
		if (cats) {
			categoryRefs().forEach((r) => {
				if (cats.indexOf(r.value) < 0) problems.push({ path: r.path, text: r.where + ': “' + r.value + '” is not a category in categories.json (shown with the fallback icon).' });
			});
		} else if (categoryRefs().length) {
			problems.push({ path: 'categories.json', text: 'is missing; the categories of sources and inbox events cannot be checked.' });
		}
		const places = placeKeys();
		if (places) {
			placeRefs().forEach((r) => {
				if (places.indexOf(r.value) < 0) problems.push({ path: r.path, text: r.where + ': “' + r.value + '” is not an id or ref in places.json.' });
			});
		}
		return problems;
	}

	function instanceName() {
		const inst = get('instance.json');
		return inst && typeof inst.name === 'string' && inst.name ? inst.name : 'instance';
	}

	async function zip() {
		const JSZip = await loadZip();
		const archive = new JSZip();
		sortedPaths().forEach((path) => archive.file(path, state.files[path]));
		return archive.generateAsync({ type: 'blob', compression: 'DEFLATE' });
	}

	window.OLWorkspace = {
		active: () => !!state,
		paths: sortedPaths,
		list: (folder) => sortedPaths().filter((p) => p.indexOf(folder) === 0),
		has: (path) => !!state && state.files[path] !== undefined,
		get: get,
		save: save,
		move: move,
		remove: remove,
		clear: clear,
		importEntries: importEntries,
		categoryNames: categoryNames,
		placeKeys: placeKeys,
		categoryRefs: categoryRefs,
		placeRefs: placeRefs,
		renameCategory: (from, to, skip) => rename(categoryRefs(), from, to, skip),
		renamePlace: (from, to, skip) => rename(placeRefs(), from, to, skip),
		check: check,
		instanceName: instanceName,
		loadedAt: () => (state ? state.loaded : null),
		origin: () => (state && state.origin) || null,
		zip: zip,
		onChange: (fn) => listeners.push(fn),
		FOLDERS: FOLDERS,
	};
})();
