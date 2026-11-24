/* openLitfass config: turns the :::form blocks of a page into a JSON file.
   markdown-pages.js renders the forms (field names are the labels in lower
   case, spaces as "_"); a page spec below maps those names to JSON keys.
   The JSON is rebuilt on every change, shown below the forms and can be
   downloaded, copied or loaded from an existing file. Nothing is sent
   anywhere; a draft is kept in localStorage so that leaving the page does
   not lose the input. */
(function () {
	'use strict';

	const page = new URLSearchParams(window.location.search).get('page') || '';
	const DRAFT_PREFIX = 'ol-config-draft:';
	const SPECS = {};
	window.OLConfig = { specs: SPECS };

	/* ---------- small helpers ---------- */

	function el(tag, attrs, children) {
		const node = document.createElement(tag);
		Object.keys(attrs || {}).forEach((key) => {
			if (key === 'text') node.textContent = attrs[key];
			else if (key === 'class') node.className = attrs[key];
			else if (key.startsWith('on')) node.addEventListener(key.slice(2), attrs[key]);
			else node.setAttribute(key, attrs[key]);
		});
		(children || []).forEach((child) => node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child));
		return node;
	}

	function button(text, onclick, cls) {
		return el('button', { type: 'button', class: cls || 'cfg-button', text: text, onclick: onclick });
	}

	function getPath(obj, path) {
		return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), obj);
	}

	function setPath(obj, path, value) {
		const keys = path.split('.');
		let target = obj;
		keys.slice(0, -1).forEach((key) => {
			if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
			target = target[key];
		});
		target[keys[keys.length - 1]] = value;
	}

	function splitList(text) {
		return String(text).split(',').map((part) => part.trim()).filter(Boolean);
	}

	function slug(text) {
		return String(text).toLowerCase()
			.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	}

	function isEmpty(value) {
		return value === undefined || value === null || value === ''
			|| (Array.isArray(value) && !value.length)
			|| (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
	}

	/* SVG path data from a textarea: one path per line, or a pasted <svg>
	   (e.g. from Tabler Icons) whose <path d="…"> are taken over. */
	function parseIcon(text) {
		const source = String(text || '').trim();
		if (!source) return { paths: [], other: 0 };
		if (source.indexOf('<') >= 0) {
			const doc = new DOMParser().parseFromString(source.indexOf('<svg') >= 0 ? source : '<svg xmlns="http://www.w3.org/2000/svg">' + source + '</svg>', 'image/svg+xml');
			const paths = Array.prototype.map.call(doc.querySelectorAll('path'), (p) => (p.getAttribute('d') || '').trim())
				.filter((d) => d && !/^M0 0h24v24H0(V0)?z$/i.test(d));
			const other = doc.querySelectorAll('circle, rect, line, polyline, polygon, ellipse').length;
			return { paths: paths, other: other };
		}
		return { paths: source.split(/\n+/).map((line) => line.trim()).filter(Boolean), other: 0 };
	}

	function iconPreview(paths) {
		const ns = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('width', '24');
		svg.setAttribute('height', '24');
		svg.setAttribute('class', 'cfg-icon');
		svg.setAttribute('aria-hidden', 'true');
		(paths || []).forEach((d) => {
			const path = document.createElementNS(ns, 'path');
			path.setAttribute('d', d);
			svg.appendChild(path);
		});
		return svg;
	}

	/* ---------- form fields ---------- */

	function fields(root, name) {
		return Array.prototype.slice.call(root.querySelectorAll('[name="' + CSS.escape(name) + '"]'));
	}

	function field(root, name) {
		return fields(root, name)[0] || null;
	}

	function getValue(root, name) {
		const list = fields(root, name);
		if (!list.length) return undefined;
		if (list[0].type === 'checkbox') return list.filter((c) => c.checked).map((c) => c.value);
		if (list[0].type === 'radio') {
			const checked = list.find((r) => r.checked);
			return checked ? checked.value : '';
		}
		return list[0].value.trim();
	}

	function setValue(root, name, value) {
		const list = fields(root, name);
		if (!list.length) return;
		if (list[0].type === 'checkbox') {
			const values = Array.isArray(value) ? value : [];
			list.forEach((c) => { c.checked = values.indexOf(c.value) >= 0; });
		} else if (list[0].type === 'radio') {
			list.forEach((r) => { r.checked = r.value === value; });
		} else {
			list[0].value = value == null ? '' : String(value);
		}
	}

	/* A field descriptor maps one form field to a JSON key:
	     { name, key, type, hint, placeholder, attrs, datalist }
	   type: text (default), int, number, list (comma-separated), icon,
	   bool (single checkbox), choices (checkbox group -> array),
	   flags (checkbox group -> one Boolean per option), meta (not in JSON). */

	function readObject(root, descs) {
		const obj = {};
		descs.forEach((d) => {
			if (d.type === 'meta') return;
			const raw = getValue(root, d.name);
			if (raw === undefined) return;
			let value;
			switch (d.type) {
				case 'int': value = raw === '' ? undefined : parseInt(raw, 10); break;
				case 'number': value = raw === '' ? undefined : Number(raw); break;
				case 'list': value = splitList(raw); break;
				case 'icon': value = parseIcon(raw).paths; break;
				case 'bool': value = raw.length ? true : undefined; break;
				case 'choices': value = raw.slice(); break;
				case 'flags':
					Object.keys(d.flags).forEach((label) => { if (raw.indexOf(label) >= 0) setPath(obj, d.flags[label], true); });
					return;
				default: value = raw;
			}
			if (typeof value === 'number' && isNaN(value)) value = undefined;
			if (!isEmpty(value)) setPath(obj, d.key || d.name, value);
		});
		return obj;
	}

	function writeObject(root, descs, obj) {
		descs.forEach((d) => {
			if (d.type === 'meta') return;
			if (d.type === 'flags') {
				setValue(root, d.name, Object.keys(d.flags).filter((label) => getPath(obj, d.flags[label]) === true));
				return;
			}
			const value = getPath(obj, d.key || d.name);
			switch (d.type) {
				case 'list': setValue(root, d.name, Array.isArray(value) ? value.join(', ') : value); break;
				case 'icon': setValue(root, d.name, Array.isArray(value) ? value.join('\n') : value); break;
				case 'bool': setValue(root, d.name, value === true ? fields(root, d.name).map((c) => c.value) : []); break;
				case 'choices': setValue(root, d.name, Array.isArray(value) ? value : []); break;
				default: setValue(root, d.name, value);
			}
		});
	}

	function topKeys(descs) {
		const keys = [];
		descs.forEach((d) => {
			if (d.type === 'meta') return;
			if (d.type === 'flags') Object.keys(d.flags).forEach((label) => keys.push(d.flags[label].split('.')[0]));
			else keys.push((d.key || d.name).split('.')[0]);
		});
		return keys;
	}

	/* hints, placeholders, extra attributes and datalists from the descriptors */
	function decorate(root, descs) {
		descs.forEach((d) => {
			const list = fields(root, d.name);
			if (!list.length) return;
			const first = list[0];
			if (d.placeholder && first.type !== 'checkbox' && first.type !== 'radio') first.setAttribute('placeholder', d.placeholder);
			Object.keys(d.attrs || {}).forEach((key) => first.setAttribute(key, d.attrs[key]));
			if (d.datalist) first.setAttribute('list', d.datalist);
			if (d.hint) {
				const anchor = first.closest('fieldset') || first;
				const hint = el('small', { class: 'cfg-hint', id: (first.id || d.name) + '-hint', text: d.hint });
				anchor.insertAdjacentElement('afterend', hint);
				first.setAttribute('aria-describedby', hint.id);
			}
		});
	}

	function datalist(id, values) {
		let list = document.getElementById(id);
		if (!list) {
			list = el('datalist', { id: id });
			document.body.appendChild(list);
		}
		list.textContent = '';
		values.forEach((value) => list.appendChild(el('option', { value: value })));
	}

	/* fills `target` from `source` while the user has not typed into it */
	function autoFill(root, sourceName, targetName, make) {
		const source = field(root, sourceName);
		const target = field(root, targetName);
		if (!source || !target) return;
		target.dataset.auto = 'on';
		const update = () => { if (target.dataset.auto === 'on') target.value = make(); };
		root.addEventListener('input', (event) => {
			if (event.target === target) target.dataset.auto = target.value ? 'off' : 'on';
			else if (event.target.form === source.form) update();
		});
		return { reset: () => { target.dataset.auto = 'on'; }, keep: () => { target.dataset.auto = target.value ? 'off' : 'on'; } };
	}

	/* the parent element of a form field's label/input pair */
	function formOf(root, name) {
		const f = field(root, name);
		return f ? f.form : null;
	}

	/* ---------- list editor: one form edits one entry of a list ---------- */

	function listEditor(ctx, opts) {
		const form = formOf(ctx.main, opts.anchor);
		if (!form) return null;
		const items = [];
		let editing = -1;
		const submit = form.querySelector('button[type="submit"]');
		const addText = submit ? submit.textContent : 'Add';
		const cancel = button('Cancel', () => stopEditing());
		cancel.hidden = true;
		if (submit) submit.insertAdjacentElement('afterend', cancel);
		const message = el('p', { class: 'cfg-message', role: 'status' });
		form.appendChild(message);
		const container = el('div', { class: 'cfg-list' });
		form.insertAdjacentElement('afterend', container);
		decorate(form, opts.descs);

		function stopEditing() {
			editing = -1;
			form.reset();
			if (submit) submit.textContent = addText;
			cancel.hidden = true;
			message.textContent = '';
			if (opts.onReset) opts.onReset();
		}

		function move(from, to) {
			if (to < 0 || to >= items.length) return;
			items.splice(to, 0, items.splice(from, 1)[0]);
			if (editing === from) editing = to;
			changed();
		}

		function changed() {
			render();
			if (opts.onChange) opts.onChange(items);
			ctx.refresh();
		}

		function render() {
			container.textContent = '';
			if (!items.length) {
				container.appendChild(el('p', { class: 'cfg-empty', text: opts.empty }));
				return;
			}
			const head = el('tr', {}, opts.columns.map((c) => el('th', { scope: 'col', text: c.label })).concat([el('th', { scope: 'col', text: '' })]));
			const body = el('tbody');
			items.forEach((item, i) => {
				const cells = opts.columns.map((c) => {
					const content = c.render(item);
					return el('td', {}, [typeof content === 'string' ? content : content || '']);
				});
				const label = item[opts.key] || '#' + (i + 1);
				const actions = el('td', { class: 'cfg-row-actions' }, [
					button('Edit', () => {
						editing = i;
						form.reset();
						writeObject(form, opts.descs, item);
						form.dispatchEvent(new CustomEvent('cfg:filled'));
						if (opts.onEdit) opts.onEdit(item);
						if (submit) submit.textContent = 'Save changes';
						cancel.hidden = false;
						message.textContent = 'Editing “' + label + '”.';
						form.scrollIntoView({ block: 'start' });
						const first = form.querySelector('input, textarea, select');
						if (first) first.focus();
					}, 'cfg-link'),
					button('↑', () => move(i, i - 1), 'cfg-link'),
					button('↓', () => move(i, i + 1), 'cfg-link'),
					button('Remove', () => {
						if (!window.confirm('Remove “' + label + '”?')) return;
						items.splice(i, 1);
						if (editing === i) stopEditing();
						else if (editing > i) editing--;
						changed();
					}, 'cfg-link cfg-danger'),
				]);
				actions.querySelectorAll('button')[1].setAttribute('aria-label', 'Move “' + label + '” up');
				actions.querySelectorAll('button')[2].setAttribute('aria-label', 'Move “' + label + '” down');
				body.appendChild(el('tr', {}, cells.concat([actions])));
			});
			container.appendChild(el('table', {}, [el('thead', {}, [head]), body]));
		}

		form.addEventListener('mdp:form-submit', (event) => {
			event.stopPropagation();
			const previous = editing >= 0 ? items[editing] : {};
			const item = readObject(form, opts.descs);
			// keys this form does not know (from an imported file) are kept
			const known = topKeys(opts.descs);
			Object.keys(previous).forEach((key) => { if (known.indexOf(key) < 0) item[key] = previous[key]; });
			const clash = items.findIndex((other, i) => i !== editing && other[opts.key] === item[opts.key]);
			if (clash >= 0) {
				message.textContent = 'There is already an entry “' + item[opts.key] + '”.';
				return;
			}
			const problem = opts.check ? opts.check(item, form) : '';
			if (problem) {
				message.textContent = problem;
				return;
			}
			if (editing >= 0) items[editing] = item;
			else items.push(item);
			stopEditing();
			message.textContent = 'Saved “' + item[opts.key] + '”.';
			changed();
			const first = form.querySelector('input, textarea, select');
			if (first) first.focus();
		});

		render();
		return {
			items: () => items.slice(),
			set: (list) => {
				items.length = 0;
				(Array.isArray(list) ? list : []).forEach((item) => { if (item && typeof item === 'object') items.push(item); });
				stopEditing();
				render();
				if (opts.onChange) opts.onChange(items);
			},
		};
	}

	/* live icon preview below an icon textarea */
	function iconField(root, name) {
		const area = field(root, name);
		if (!area) return;
		const preview = el('div', { class: 'cfg-icon-preview', 'aria-live': 'polite' });
		(area.nextElementSibling && area.nextElementSibling.classList.contains('cfg-hint') ? area.nextElementSibling : area).insertAdjacentElement('afterend', preview);
		const update = () => {
			const icon = parseIcon(area.value);
			preview.textContent = '';
			if (!icon.paths.length) return;
			preview.appendChild(iconPreview(icon.paths));
			preview.appendChild(document.createTextNode(icon.paths.length + (icon.paths.length === 1 ? ' path' : ' paths')
				+ (icon.other ? ' – ' + icon.other + ' other shapes (circle, rect, …) are left out; use path-only icons' : '')));
		};
		area.addEventListener('input', update);
		area.form.addEventListener('reset', () => setTimeout(update));
		area.form.addEventListener('cfg:filled', update);
	}

	/* ---------- the page: output, import, draft ---------- */

	function setUp(main, spec) {
		const ctx = { main: main, extras: {}, refresh: () => {} };
		const out = main.querySelector('[data-cfg-output]');
		const code = el('code');
		const warnings = el('ul', { class: 'cfg-warnings' });
		const status = el('span', { class: 'cfg-status', role: 'status' });
		const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: '' });
		const fileLabel = el('p', { class: 'cfg-file' });

		function current() {
			const obj = spec.build(ctx);
			Object.keys(ctx.extras).forEach((key) => { if (!(key in obj)) obj[key] = ctx.extras[key]; });
			return obj;
		}

		function fileName(obj) {
			return typeof spec.file === 'function' ? spec.file(obj, ctx) : spec.file;
		}

		function load(obj) {
			main.querySelectorAll('form').forEach((form) => form.reset());
			const known = spec.keys ? spec.keys() : [];
			ctx.extras = {};
			Object.keys(obj).forEach((key) => { if (known.indexOf(key) < 0 && (spec.drop || []).indexOf(key) < 0) ctx.extras[key] = obj[key]; });
			spec.load(ctx, obj);
			main.querySelectorAll('form').forEach((form) => form.dispatchEvent(new CustomEvent('cfg:filled')));
		}

		let pending = false;
		ctx.refresh = () => {
			if (pending) return;
			pending = true;
			setTimeout(() => {
				pending = false;
				const obj = current();
				code.textContent = JSON.stringify(obj, null, 2) + '\n';
				const problems = spec.validate ? spec.validate(obj, ctx) : [];
				warnings.textContent = '';
				problems.forEach((p) => warnings.appendChild(el('li', { text: p })));
				warnings.hidden = !problems.length;
				fileLabel.textContent = '';
				fileLabel.appendChild(document.createTextNode('File: '));
				fileLabel.appendChild(el('code', { text: (spec.folder || '') + fileName(obj) }));
				try { localStorage.setItem(DRAFT_PREFIX + page, JSON.stringify({ obj: obj, meta: spec.meta ? spec.meta(ctx) : null })); } catch (e) {}
			});
		};

		function importFile(file) {
			const reader = new FileReader();
			reader.onload = () => {
				let obj;
				try {
					obj = JSON.parse(String(reader.result).replace(/^﻿/, ''));
				} catch (e) {
					status.textContent = file.name + ' is not valid JSON: ' + e.message;
					return;
				}
				if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
					status.textContent = file.name + ' does not contain a JSON object.';
					return;
				}
				load(obj);
				if (spec.imported) spec.imported(ctx, file.name);
				status.textContent = 'Loaded ' + file.name + '.';
				ctx.refresh();
			};
			reader.readAsText(file);
		}

		fileInput.addEventListener('change', () => {
			if (fileInput.files[0]) importFile(fileInput.files[0]);
			fileInput.value = '';
		});

		const actions = el('div', { class: 'cfg-actions' }, [
			button('Download', () => {
				const obj = current();
				const blob = new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const link = el('a', { href: url, download: fileName(obj) });
				document.body.appendChild(link);
				link.click();
				link.remove();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				status.textContent = 'Downloaded ' + fileName(obj) + '.';
			}, 'cfg-button cfg-primary'),
			button('Copy', () => {
				const text = code.textContent;
				const done = () => { status.textContent = 'Copied to the clipboard.'; };
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text).then(done, () => { status.textContent = 'Copying failed; select the JSON and copy it by hand.'; });
				} else {
					status.textContent = 'Select the JSON and copy it by hand.';
				}
			}),
			button('Import a file…', () => fileInput.click()),
			button('Start over', () => {
				if (!window.confirm('Clear all fields of this page?')) return;
				try { localStorage.removeItem(DRAFT_PREFIX + page); } catch (e) {}
				load({});
				if (spec.cleared) spec.cleared(ctx);
				status.textContent = 'All fields cleared.';
				ctx.refresh();
			}),
			status,
			fileInput,
		]);

		if (out) {
			out.classList.add('cfg-output');
			out.appendChild(warnings);
			out.appendChild(fileLabel);
			out.appendChild(el('pre', {}, [code]));
			out.appendChild(actions);
		}

		const top = main.querySelector('[data-cfg-import]');
		if (top) {
			top.classList.add('cfg-import');
			top.appendChild(button('Import an existing file…', () => fileInput.click()));
			top.appendChild(document.createTextNode(' or start with an empty form. Your input is kept in this browser until you start over.'));
		}

		// the forms are only edited live; Enter in a single-field form must not do anything
		main.addEventListener('mdp:form-submit', (event) => event.preventDefault());
		main.addEventListener('input', ctx.refresh);
		main.addEventListener('change', ctx.refresh);

		spec.init(ctx);

		let draft = null;
		try { draft = JSON.parse(localStorage.getItem(DRAFT_PREFIX + page) || 'null'); } catch (e) {}
		if (draft && draft.obj && typeof draft.obj === 'object') {
			load(draft.obj);
			if (spec.restore && draft.meta) spec.restore(ctx, draft.meta);
		}
		ctx.refresh();
	}

	/* ---------- shared validation ---------- */

	const RE = {
		date: /^\d{4}-\d{2}-\d{2}$/,
		monthDay: /^\d{2}-\d{2}$/,
		time: /^([01]\d|2[0-3]):[0-5]\d$/,
		colour: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i,
		id: /^[a-z0-9]+(-[a-z0-9]+)*$/,
		url: /^https?:\/\/\S+$/i,
	};

	function timeZones() {
		try { return Intl.supportedValuesOf('timeZone'); } catch (e) { return []; }
	}

	/* ---------- instance.json ---------- */

	const INSTANCE = [
		{ name: 'name', key: 'name', placeholder: 'weissens.ee', hint: 'Short name; the wordmark in the header. Required.' },
		{ name: 'title', key: 'title', placeholder: 'weissens.ee – Events in Weißensee', hint: 'The page <title>. Default: the name.' },
		{ name: 'description', key: 'description', placeholder: 'Der Event-Kalender für Berlin-Weißensee.', hint: 'Meta description and link previews.' },
		{ name: 'base_url', key: 'baseUrl', placeholder: 'https://weissens.ee', hint: 'Public address of the site; needed for the sitemap and canonical URLs.' },
		{ name: 'time_zone', key: 'timezone', placeholder: 'Europe/Berlin', datalist: 'cfg-timezones', hint: 'IANA time zone of all event times. Default: Europe/Berlin.' },
		{ name: 'language', key: 'language', placeholder: 'de', hint: 'Language of the page (<html lang>). Default: de.' },
		{ name: 'theme_colour', key: 'themeColor', placeholder: '#17383D', hint: 'Browser theme colour, PWA colours and favicon background.' },
		{ name: 'short_name', key: 'shortName', placeholder: 'weissens.ee', hint: 'Name below the app icon when installed, about 12 characters. Default: the name.' },
		{ name: 'about', key: 'about', hint: 'Text of the About page; plain text, blank lines separate paragraphs.' },
		{ name: 'imprint_url', key: 'imprintUrl', placeholder: 'impressum.html', hint: 'Legal notice: absolute URL or a page in site/.' },
		{ name: 'privacy_url', key: 'privacyUrl', placeholder: 'datenschutz.html', hint: 'Privacy policy: absolute URL or a page in site/.' },
		{ name: 'submit_url', key: 'submitUrl', placeholder: 'mailto:termine@example.org', hint: 'Where people report a missing event: a form or a mailto: link.' },
		{ name: 'issues_url', key: 'issuesUrl', placeholder: 'https://github.com/owner/instance/issues', hint: 'The instance’s own issue tracker for wrong events, sources or places.' },
	];

	SPECS.instance = {
		file: 'instance.json',
		keys: () => topKeys(INSTANCE),
		init: (ctx) => {
			decorate(ctx.main, INSTANCE);
			datalist('cfg-timezones', timeZones());
			const text = field(ctx.main, 'theme_colour');
			if (text) {
				const picker = el('input', { type: 'color', class: 'cfg-colour', 'aria-label': 'Pick the theme colour', value: '#2f3e4e' });
				const sync = () => { if (RE.colour.test(text.value) && text.value.length === 7) picker.value = text.value.toLowerCase(); };
				picker.addEventListener('input', () => { text.value = picker.value.toUpperCase(); ctx.refresh(); });
				text.addEventListener('input', sync);
				text.form.addEventListener('cfg:filled', sync);
				text.insertAdjacentElement('afterend', picker);
				text.parentNode.insertBefore(el('div', { class: 'cfg-inline' }), text).append(text, picker);
			}
		},
		build: (ctx) => readObject(ctx.main, INSTANCE),
		load: (ctx, obj) => writeObject(ctx.main, INSTANCE, obj),
		validate: (obj) => {
			const p = [];
			if (!obj.name) p.push('Name is required.');
			if (obj.baseUrl && !RE.url.test(obj.baseUrl)) p.push('Base URL must start with https:// (or http://).');
			if (obj.baseUrl && /\/$/.test(obj.baseUrl)) p.push('Base URL: leave out the trailing slash.');
			const zones = timeZones();
			if (obj.timezone && zones.length && zones.indexOf(obj.timezone) < 0 && obj.timezone !== 'UTC') p.push('Time zone “' + obj.timezone + '” is not a known IANA time zone.');
			if (obj.language && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(obj.language)) p.push('Language should be a language tag such as de or de-DE.');
			if (obj.themeColor && !RE.colour.test(obj.themeColor)) p.push('Theme colour should be a hex colour such as #17383D.');
			if (obj.shortName && obj.shortName.length > 12) p.push('Short name is longer than 12 characters and may be cut off below the app icon.');
			if (obj.issuesUrl && !RE.url.test(obj.issuesUrl)) p.push('Issues URL must be an absolute URL.');
			return p;
		},
	};

	/* ---------- categories.json ---------- */

	const CATEGORY = [
		{ name: 'category_name', key: 'name', placeholder: 'Kultur', hint: 'As it appears in events and in the filter.' },
		{ name: 'icon', key: 'icon', type: 'icon', placeholder: '<svg …>…</svg>  or  M12 21a9 9 0 0 1 0 -18…', hint: 'SVG path data, one path per line, drawn in a 24 × 24 box. Or paste a whole <svg>, e.g. from tabler.io/icons.' },
		{ name: 'group', key: 'group', datalist: 'cfg-categories', hint: 'Optional: another category this one belongs to (one level deep).' },
	];
	const CATEGORIES_TOP = [
		{ name: 'fallback_category', key: 'fallback', datalist: 'cfg-categories', placeholder: 'Unkategorisiert', hint: 'For events without a category. Must be one of the categories above.' },
	];

	SPECS.categories = {
		file: 'categories.json',
		keys: () => ['fallback', 'categories'],
		init: (ctx) => {
			decorate(ctx.main, CATEGORIES_TOP);
			ctx.list = listEditor(ctx, {
				anchor: 'category_name', descs: CATEGORY, key: 'name',
				empty: 'No categories yet. Add the first one above.',
				columns: [
					{ label: 'Icon', render: (c) => iconPreview(c.icon) },
					{ label: 'Name', render: (c) => c.name },
					{ label: 'Group', render: (c) => c.group || '' },
				],
				check: (c) => (c.group && c.group === c.name ? 'A category cannot be its own group.' : ''),
				onChange: (items) => datalist('cfg-categories', items.map((c) => c.name)),
			});
			iconField(ctx.main, 'icon');
		},
		build: (ctx) => {
			const obj = readObject(ctx.main, CATEGORIES_TOP);
			obj.categories = ctx.list.items();
			if (!('fallback' in obj)) obj.fallback = '';
			return { fallback: obj.fallback, categories: obj.categories };
		},
		load: (ctx, obj) => {
			writeObject(ctx.main, CATEGORIES_TOP, obj);
			ctx.list.set(obj.categories);
		},
		validate: (obj) => {
			const p = [];
			const names = obj.categories.map((c) => c.name);
			if (!obj.categories.length) p.push('Add at least one category.');
			if (!obj.fallback) p.push('The fallback category is required.');
			else if (names.indexOf(obj.fallback) < 0) p.push('The fallback “' + obj.fallback + '” is not one of the categories.');
			obj.categories.forEach((c) => {
				if (!c.icon || !c.icon.length) p.push('“' + c.name + '” has no icon.');
				if (!c.group) return;
				const group = obj.categories.find((g) => g.name === c.group);
				if (!group) p.push('“' + c.name + '”: the group “' + c.group + '” is not a category.');
				else if (group.group) p.push('“' + c.name + '”: the group “' + c.group + '” is itself in a group; groups are one level deep.');
			});
			return p;
		},
	};

	/* ---------- places.json ---------- */

	const PLACE_TYPE = [
		{ name: 'type_name', key: 'name', placeholder: 'Park', hint: 'The order of the types is the order of the type chips.' },
		{ name: 'type_icon', key: 'icon', type: 'icon', placeholder: '<svg …>…</svg>  or  path data, one per line', hint: 'As for categories: path data per line or a pasted <svg>.' },
	];
	const PLACE = [
		{ name: 'id', key: 'id', placeholder: 'theater-im-delphi', attrs: { pattern: '[a-z0-9]+(-[a-z0-9]+)*' }, hint: 'Lower-case letters, digits and hyphens; part of the URL. Filled in from the name.' },
		{ name: 'place_name', key: 'name', placeholder: 'Theater im Delphi' },
		{ name: 'type', key: 'type', datalist: 'cfg-place-types', hint: 'One of the types above.' },
		{ name: 'description', key: 'description' },
		{ name: 'address', key: 'address', placeholder: 'Gustav-Adolf-Straße 2, 13086 Berlin' },
		{ name: 'latitude', key: 'lat', type: 'number', placeholder: '52.5519', attrs: { step: 'any', min: '-90', max: '90' } },
		{ name: 'longitude', key: 'lon', type: 'number', placeholder: '13.4312', attrs: { step: 'any', min: '-180', max: '180' }, hint: 'Coordinates for the map link and the map snippet.' },
		{ name: 'website', key: 'url', placeholder: 'https://example.org' },
		{ name: 'opening_hours', key: 'openingHours', placeholder: 'Mo–Fr 9–16 Uhr' },
		{ name: 'season', key: 'season', placeholder: 'April bis Oktober' },
		{ name: 'match_terms', key: 'match', type: 'list', placeholder: 'Delphi, Theater im Delphi', hint: 'Comma-separated terms that link events by their location. Default: the name.' },
		{ name: 'refs', key: 'refs', type: 'list', placeholder: 'osm:way/123456', hint: 'Comma-separated identifiers in other directories; must be unique.' },
	];

	SPECS.places = {
		file: 'places.json',
		keys: () => ['types', 'places'],
		init: (ctx) => {
			ctx.types = listEditor(ctx, {
				anchor: 'type_name', descs: PLACE_TYPE, key: 'name',
				empty: 'No place types yet.',
				columns: [
					{ label: 'Icon', render: (t) => iconPreview(t.icon) },
					{ label: 'Name', render: (t) => t.name },
				],
				onChange: (items) => datalist('cfg-place-types', items.map((t) => t.name)),
			});
			iconField(ctx.main, 'type_icon');
			let auto = null;
			ctx.places = listEditor(ctx, {
				anchor: 'place_name', descs: PLACE, key: 'id',
				empty: 'No places yet.',
				columns: [
					{ label: 'ID', render: (pl) => el('code', { text: pl.id }) },
					{ label: 'Name', render: (pl) => pl.name },
					{ label: 'Type', render: (pl) => pl.type || '' },
				],
				check: (pl) => {
					const types = ctx.types.items().map((t) => t.name);
					if (types.length && types.indexOf(pl.type) < 0) return 'The type “' + pl.type + '” is not one of the place types.';
					if ((pl.refs || []).indexOf(pl.id) >= 0) return 'A ref must not equal the ID.';
					return '';
				},
				onReset: () => { if (auto) auto.reset(); },
				onEdit: () => { if (auto) auto.keep(); },
			});
			auto = autoFill(ctx.main, 'place_name', 'id', () => slug(getValue(ctx.main, 'place_name')));
		},
		build: (ctx) => ({ types: ctx.types.items(), places: ctx.places.items() }),
		load: (ctx, obj) => {
			ctx.types.set(obj.types);
			ctx.places.set(obj.places);
		},
		validate: (obj) => {
			const p = [];
			const types = obj.types.map((t) => t.name);
			if (!obj.types.length) p.push('Add at least one place type.');
			obj.types.forEach((t) => { if (!t.icon || !t.icon.length) p.push('Type “' + t.name + '” has no icon.'); });
			const seen = {};
			obj.places.forEach((pl) => {
				if (!RE.id.test(pl.id || '')) p.push('Place “' + (pl.name || pl.id) + '”: the ID may only contain lower-case letters, digits and hyphens.');
				if (types.indexOf(pl.type) < 0) p.push('Place “' + pl.id + '”: the type “' + (pl.type || '') + '” is not one of the place types.');
				[pl.id].concat(pl.refs || []).forEach((ref) => {
					if (!ref) return;
					if (seen[ref] && seen[ref] !== pl.id) p.push('“' + ref + '” is used by “' + seen[ref] + '” and “' + pl.id + '”; IDs and refs must be unique.');
					seen[ref] = pl.id;
				});
				if ((pl.lat === undefined) !== (pl.lon === undefined)) p.push('Place “' + pl.id + '”: give both latitude and longitude, or neither.');
			});
			return p;
		},
	};

	/* ---------- inbox/<name>.json ---------- */

	const INBOX = [
		{ name: 'file_name', type: 'meta', placeholder: '2026-12-05-flohmarkt-antonplatz', attrs: { pattern: '[A-Za-z0-9_.-]+' }, hint: 'Without .json. The file name is the event’s stable ID: do not rename the file later. Filled in from date and title.' },
		{ name: 'title', key: 'title', placeholder: 'Flohmarkt am Antonplatz' },
		{ name: 'date', key: 'date', hint: 'Required for a single event; leave it empty for a recurring one.' },
		{ name: 'start_time', key: 'startTime', hint: 'Without a start time the event is all-day.' },
		{ name: 'end_time', key: 'endTime' },
		{ name: 'category', key: 'category', placeholder: 'Markt', hint: 'One of the instance’s categories.' },
		{ name: 'description', key: 'description', placeholder: 'Trödel, Bücher und Kuchen.' },
		{ name: 'location_name', key: 'location.name', placeholder: 'Antonplatz' },
		{ name: 'location_address', key: 'location.address', placeholder: 'Antonplatz, 13086 Berlin' },
		{ name: 'organizer', key: 'organizer', placeholder: 'Kiezinitiative' },
		{ name: 'link', key: 'url', placeholder: 'https://example.org/flohmarkt' },
		{ name: 'place', key: 'place', placeholder: 'antonplatz', hint: 'Optional: id or ref of a place in places.json.' },
		{ name: 'marked_as', type: 'flags', flags: { 'Ticket required': 'ticketRequired', 'Registration required': 'registrationRequired', 'Family-friendly': 'familyFriendly', 'Cancelled': 'cancelled' } },
		{ name: 'weekdays', key: 'repeat.weekdays', type: 'choices', hint: 'The days of the week on which the event takes place; needs From.' },
		{ name: 'from', key: 'repeat.from', placeholder: '2026-10-01 or 10-01', hint: 'Start of the period: a date (YYYY-MM-DD) or, for a season that recurs every year, month and day (MM-DD).' },
		{ name: 'until', key: 'repeat.until', placeholder: '2027-03-31 or 03-31', hint: 'End of the period, in the same form as From. Optional for a date.' },
		{ name: 'additional_dates', key: 'repeat.dates', type: 'list', placeholder: '2027-05-06, 12-25, easter+1', hint: 'Comma-separated extra days, also without weekdays.' },
		{ name: 'except', key: 'repeat.except', type: 'list', placeholder: 'feiertage, 12-24, 12-31', hint: 'Comma-separated days without the event; day lists from holidays.json work too.' },
		{ name: 'days_ahead', key: 'repeat.daysAhead', type: 'int', placeholder: '60', attrs: { min: '1' }, hint: 'How far ahead occurrences are generated. Default: 60.' },
		{ name: 'price', type: 'meta' },
		{ name: 'amount_in_euros', type: 'meta', attrs: { step: '0.01', min: '0' } },
	];
	const DAY = /^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|\*-\d{2}|easter([+-]\d+)?|[a-zäöüß][\wäöüß-]*)$/i;
	const INBOX_ORDER = ['title', 'date', 'startTime', 'endTime', 'category', 'description', 'location', 'organizer', 'url', 'price', 'ticketRequired', 'registrationRequired', 'familyFriendly', 'cancelled', 'place', 'repeat'];

	function fileStem(name) {
		return String(name || '').replace(/\.json$/i, '');
	}

	SPECS.inbox = {
		folder: 'inbox/',
		file: (obj, ctx) => (fileStem(getValue(ctx.main, 'file_name')) || 'event') + '.json',
		keys: () => INBOX_ORDER,
		init: (ctx) => {
			decorate(ctx.main, INBOX);
			ctx.auto = autoFill(ctx.main, 'title', 'file_name', () => {
				const date = getValue(ctx.main, 'date');
				return slug((date ? date + ' ' : '') + getValue(ctx.main, 'title'));
			});
		},
		build: (ctx) => {
			const obj = readObject(ctx.main, INBOX);
			const price = getValue(ctx.main, 'price');
			const amount = getValue(ctx.main, 'amount_in_euros');
			if (price === 'paid') obj.price = amount !== '' && !isNaN(Number(amount)) ? { free: false, amount: Number(amount) } : { free: false };
			else if (price === 'unknown') obj.price = { free: false };
			const ordered = {};
			INBOX_ORDER.forEach((key) => { if (key in obj) ordered[key] = obj[key]; });
			return ordered;
		},
		load: (ctx, obj) => {
			writeObject(ctx.main, INBOX, obj);
			const price = obj.price;
			if (!price || price.free !== false) setValue(ctx.main, 'price', 'free');
			else if (typeof price.amount === 'number') {
				setValue(ctx.main, 'price', 'paid');
				setValue(ctx.main, 'amount_in_euros', price.amount);
			} else setValue(ctx.main, 'price', 'unknown');
		},
		meta: (ctx) => ({ file: getValue(ctx.main, 'file_name') }),
		restore: (ctx, meta) => {
			if (meta.file) {
				setValue(ctx.main, 'file_name', meta.file);
				if (ctx.auto) ctx.auto.keep();
			}
		},
		imported: (ctx, name) => {
			setValue(ctx.main, 'file_name', fileStem(name));
			if (ctx.auto) ctx.auto.keep();
		},
		cleared: (ctx) => { if (ctx.auto) ctx.auto.reset(); },
		validate: (obj, ctx) => {
			const p = [];
			const r = obj.repeat;
			const stem = fileStem(getValue(ctx.main, 'file_name'));
			if (!stem) p.push('Give the file a name.');
			else if (!/^[A-Za-z0-9_.-]+$/.test(stem)) p.push('The file name should only contain letters, digits, “-”, “_” and “.”.');
			if (/\.example$/i.test(stem)) p.push('Files ending in .example.json are not read.');
			if (!obj.title) p.push('The title is required.');
			if (!r && !obj.date) p.push('Give a date, or fill in “Recurring event”.');
			if (obj.date && !RE.date.test(obj.date)) p.push('The date must be YYYY-MM-DD.');
			['startTime', 'endTime'].forEach((key) => { if (obj[key] && !RE.time.test(obj[key])) p.push(key + ' must be HH:MM.'); });
			if (obj.endTime && !obj.startTime) p.push('An end time needs a start time.');
			if (obj.price && obj.price.free === false && getValue(ctx.main, 'price') === 'paid' && obj.price.amount === undefined) p.push('Enter the amount, or choose “unknown”.');
			if (r) {
				if (obj.date) p.push('With “Recurring event” filled in, leave the date empty; it is ignored.');
				if (r.weekdays && !r.from) p.push('Weekdays need From.');
				if (!r.weekdays && !r.dates && (r.from || r.until)) p.push('From and Until only apply to weekdays.');
				if (r.from && !RE.date.test(r.from) && !RE.monthDay.test(r.from)) p.push('From must be YYYY-MM-DD or MM-DD.');
				if (r.until && !RE.date.test(r.until) && !RE.monthDay.test(r.until)) p.push('Until must be YYYY-MM-DD or MM-DD.');
				if (r.from && r.until && RE.monthDay.test(r.from) !== RE.monthDay.test(r.until)) p.push('From and Until must use the same form (both dates, or both month and day).');
				if (r.from && RE.monthDay.test(r.from) && !r.until) p.push('A season (MM-DD) needs Until.');
				(r.dates || []).concat(r.except || []).forEach((day) => { if (!DAY.test(day)) p.push('“' + day + '” is not a day (YYYY-MM-DD, MM-DD, *-DD, easter±N or a day list).'); });
				if (!r.weekdays && !r.dates) p.push('A recurring event needs weekdays or additional dates.');
			}
			return p;
		},
	};

	/* ---------- start ---------- */

	document.addEventListener('mdp:rendered', (event) => {
		if (!event.detail || event.detail.region !== 'main') return;
		const spec = SPECS[page];
		if (spec && spec.init) setUp(document.querySelector('main'), spec);
	});
})();
