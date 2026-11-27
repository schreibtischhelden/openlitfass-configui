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
	const BOUND_PREFIX = 'ol-config-bound:';
	const TABLER_URL = 'https://github.com/tabler/tabler-icons';
	const WS = window.OLWorkspace;
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
				case 'intlist': value = splitList(raw).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n)); break;
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
				case 'list':
				case 'intlist': setValue(root, d.name, Array.isArray(value) ? value.join(', ') : value); break;
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

		function labelOf(item, i) {
			return (opts.label ? opts.label(item) : item[opts.key]) || '#' + (i + 1);
		}

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
			ctx.touched = true;
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
				const label = labelOf(item, i);
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
						const note = opts.removeNote ? opts.removeNote(item) : '';
						if (!window.confirm('Remove “' + label + '”?' + (note ? '\n\n' + note : ''))) return;
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
			const clash = opts.key ? items.findIndex((other, i) => i !== editing && other[opts.key] === item[opts.key]) : -1;
			if (clash >= 0) {
				message.textContent = 'There is already an entry “' + item[opts.key] + '”.';
				return;
			}
			const problem = opts.check ? opts.check(item, form) : '';
			if (problem) {
				message.textContent = problem;
				return;
			}
			const oldKey = editing >= 0 && opts.key ? previous[opts.key] : undefined;
			if (editing >= 0) items[editing] = item;
			else items.push(item);
			stopEditing();
			let note = '';
			if (oldKey !== undefined && oldKey !== item[opts.key] && opts.onRename) note = opts.onRename(oldKey, item[opts.key], items) || '';
			message.textContent = 'Saved “' + labelOf(item, items.indexOf(item)) + '”.' + (note ? ' ' + note : '');
			changed();
			const first = form.querySelector('input, textarea, select');
			if (first) first.focus();
		});

		render();
		return {
			render: render,
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
	function iconField(root, name, labelName) {
		const area = field(root, name);
		if (!area) return;
		const preview = el('div', { class: 'cfg-icon-preview', 'aria-live': 'polite' });
		const pick = button('Pick an icon…', () => {
			window.OLIconPicker.open(tools, getValue(root, labelName), (paths) => {
				area.value = paths.join('\n');
				area.dispatchEvent(new Event('input', { bubbles: true }));
				area.focus();
			});
		});
		const tools = el('p', { class: 'cfg-icon-tools' }, [
			pick,
			' Suggestions from the name. Or copy the SVG of an icon from ',
			el('a', { href: TABLER_URL, target: '_blank', rel: 'noopener', text: 'Tabler Icons' }),
			' (outline, MIT Licence) and paste it here.',
		]);
		const after = area.nextElementSibling && area.nextElementSibling.classList.contains('cfg-hint') ? area.nextElementSibling : area;
		after.insertAdjacentElement('afterend', tools);
		tools.insertAdjacentElement('afterend', preview);
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
		/* ctx.bound: the path of the file in the loaded instance that this
		   page edits; changes made by the user are saved there. */
		const ctx = { main: main, extras: {}, refresh: () => {}, bound: null, touched: false };
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
				if (ctx.bound && ctx.touched) {
					const target = (spec.folder || '') + fileName(obj);
					if (target !== ctx.bound && WS.has(target)) {
						problems.unshift('“' + target + '” already exists in the loaded instance. Choose another file name; until then the changes are not saved there.');
					} else {
						if (target !== ctx.bound) {
							WS.move(ctx.bound, target);
							bind(target);
						}
						WS.save(ctx.bound, obj, spec.drop);
					}
				}
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
				status.textContent = 'Loaded ' + file.name + '.' + (ctx.bound ? ' It replaces ' + ctx.bound + ' in the loaded instance.' : '');
				ctx.touched = true;
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
				const wasBound = ctx.bound;
				if (!window.confirm('Clear all fields of this page?' + (wasBound ? ' ' + wasBound + ' in the loaded instance stays as it is.' : ''))) return;
				try { localStorage.removeItem(DRAFT_PREFIX + page); } catch (e) {}
				bind(null);
				load({});
				if (spec.cleared) spec.cleared(ctx);
				status.textContent = 'All fields cleared.' + (wasBound ? ' ' + wasBound + ' in the loaded instance is unchanged.' : '');
				ctx.touched = false;
				ctx.refresh();
				renderBar();
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

		/* ----- the loaded instance ----- */

		const multi = !!spec.folder;

		function bind(path) {
			ctx.bound = path;
			try {
				if (path) localStorage.setItem(BOUND_PREFIX + page, path);
				else localStorage.setItem(BOUND_PREFIX + page, '');
			} catch (e) {}
		}

		function storedBinding() {
			try { return localStorage.getItem(BOUND_PREFIX + page); } catch (e) { return null; }
		}

		function openFromInstance(path) {
			const obj = WS.get(path);
			if (!obj) {
				status.textContent = path + ' in the loaded instance is not valid JSON; fix it in an editor first.';
				return false;
			}
			bind(path);
			load(obj);
			if (spec.imported) spec.imported(ctx, path.split('/').pop());
			ctx.touched = false;
			ctx.refresh();
			return true;
		}

		function addToInstance() {
			const obj = current();
			const path = (spec.folder || '') + fileName(obj);
			if (WS.has(path) && !window.confirm(path + ' already exists in the loaded instance. Replace it?')) return;
			bind(path);
			ctx.touched = true;
			WS.save(path, obj);
			status.textContent = 'Added ' + path + ' to the loaded instance.';
			ctx.refresh();
			renderBar();
		}

		const top = main.querySelector('[data-cfg-import]');
		function renderBar() {
			if (!top) return;
			top.textContent = '';
			top.classList.add('cfg-import');
			if (!WS.active()) {
				top.appendChild(button('Import an existing file…', () => fileInput.click()));
				top.appendChild(document.createTextNode(' or start with an empty form. Your input is kept in this browser until you start over. To check this file against the rest of your configuration, '));
				top.appendChild(el('a', { href: '.', text: 'load your instance on the start page' }));
				top.appendChild(document.createTextNode('.'));
				return;
			}
			const name = WS.instanceName();
			if (multi) {
				const select = el('select', { 'aria-label': 'File in the loaded instance' }, [el('option', { value: '', text: '(a new file)' })]
					.concat(WS.list(spec.folder).map((p) => el('option', { value: p, text: p.slice(spec.folder.length) }))));
				select.value = ctx.bound || '';
				select.addEventListener('change', () => {
					if (select.value) openFromInstance(select.value);
					else {
						bind(null);
						load({});
						if (spec.cleared) spec.cleared(ctx);
						ctx.touched = false;
						ctx.refresh();
					}
					renderBar();
				});
				top.appendChild(el('label', { class: 'cfg-bar-label' }, ['Instance “' + name + '”, file in ' + spec.folder + ': ', select]));
				if (ctx.bound) {
					top.appendChild(el('span', { class: 'cfg-bar-note', text: ' Changes are saved to the loaded instance. ' }));
					top.appendChild(button('Remove from the instance', () => {
						if (!window.confirm('Remove ' + ctx.bound + ' from the loaded instance? The fields stay filled in.')) return;
						WS.remove(ctx.bound);
						status.textContent = 'Removed ' + ctx.bound + ' from the loaded instance.';
						bind(null);
						renderBar();
					}, 'cfg-link cfg-danger'));
				} else {
					top.appendChild(document.createTextNode(' '));
					top.appendChild(button('Add to the instance', addToInstance));
				}
			} else if (ctx.bound) {
				top.appendChild(document.createTextNode('Editing ' + spec.file + ' of the loaded instance “' + name + '”; changes are saved there. '));
			} else if (WS.has(spec.file)) {
				top.appendChild(document.createTextNode('The loaded instance “' + name + '” has a ' + spec.file + '. '));
				top.appendChild(button('Edit it', () => { openFromInstance(spec.file); renderBar(); }));
			} else {
				top.appendChild(document.createTextNode('The loaded instance “' + name + '” has no ' + spec.file + ' yet. '));
				top.appendChild(button('Add this one', addToInstance));
			}
			top.appendChild(document.createTextNode(' '));
			top.appendChild(button('Download all (ZIP)', () => downloadZip(status)));
			top.appendChild(document.createTextNode(' '));
			top.appendChild(el('a', { href: '.', text: 'Overview' }));
		}

		ctx.load = (obj) => {
			load(obj);
			ctx.refresh();
		};
		ctx.renderBar = renderBar;

		// the forms are only edited live; Enter in a single-field form must not do anything
		main.addEventListener('mdp:form-submit', (event) => event.preventDefault());
		const edited = (event) => {
			if (top && top.contains(event.target)) return;
			ctx.touched = true;
			ctx.refresh();
		};
		main.addEventListener('input', edited);
		main.addEventListener('change', edited);

		spec.init(ctx);

		let draft = null;
		try { draft = JSON.parse(localStorage.getItem(DRAFT_PREFIX + page) || 'null'); } catch (e) {}
		const requested = new URLSearchParams(window.location.search).get('file');
		const stored = storedBinding();
		let start = null;
		if (WS.active()) {
			if (multi) start = [requested, requested === null ? stored : null].find((p) => p && p.indexOf(spec.folder) === 0 && WS.has(p)) || null;
			else if (WS.has(spec.file) && stored !== '') start = spec.file;
		}
		// a singleton page stays unbound when the user chose "Start over" on it
		// (stored ''); otherwise it edits the instance's file
		if (!(start && openFromInstance(start))) {
			ctx.bound = null;
			if (draft && draft.obj && typeof draft.obj === 'object' && !(requested && multi)) {
				load(draft.obj);
				if (spec.restore && draft.meta) spec.restore(ctx, draft.meta);
			}
			ctx.refresh();
		}
		renderBar();
		WS.onChange(renderBar);
	}

	function downloadBlob(blob, name) {
		const url = URL.createObjectURL(blob);
		const link = el('a', { href: url, download: name });
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function downloadZip(status) {
		const name = slug(WS.instanceName()) || 'instance';
		WS.zip().then((blob) => {
			downloadBlob(blob, name + '-config.zip');
			status.textContent = 'Downloaded ' + name + '-config.zip with ' + WS.paths().length + ' files.';
		}, (e) => { status.textContent = e.message; });
	}

	/* the instance's categories and places, from the loaded instance or
	   from the drafts of the categories and places pages */
	function draftOf(name) {
		try {
			const draft = JSON.parse(localStorage.getItem(DRAFT_PREFIX + name) || 'null');
			return draft && draft.obj ? draft.obj : null;
		} catch (e) {
			return null;
		}
	}

	function knownCategories() {
		const fromWs = WS.categoryNames();
		if (fromWs) return { names: fromWs, from: 'categories.json of the loaded instance' };
		const draft = draftOf('categories');
		if (draft && Array.isArray(draft.categories) && draft.categories.length) {
			return { names: draft.categories.map((c) => c.name).filter(Boolean), from: 'your categories.json draft' };
		}
		return null;
	}

	function knownPlaces() {
		const fromWs = WS.placeKeys();
		if (fromWs) return { names: fromWs, from: 'places.json of the loaded instance' };
		const draft = draftOf('places');
		if (draft && Array.isArray(draft.places) && draft.places.length) {
			const keys = [];
			draft.places.forEach((pl) => { if (pl.id) keys.push(pl.id); (pl.refs || []).forEach((r) => keys.push(r)); });
			return { names: keys, from: 'your places.json draft' };
		}
		return null;
	}

	/* datalists for the category and place fields of sources and inbox events */
	function instanceDatalists() {
		const cats = knownCategories();
		const places = knownPlaces();
		datalist('cfg-instance-categories', cats ? cats.names : []);
		datalist('cfg-instance-places', places ? places.names : []);
	}

	/* refs: [{ where, value }] -> problems against the known categories/places */
	function refProblems(catRefs, placeRefs) {
		const p = [];
		const cats = knownCategories();
		if (cats) {
			catRefs.forEach((r) => { if (r.value && cats.names.indexOf(r.value) < 0) p.push(r.where + ': “' + r.value + '” is not a category in ' + cats.from + '; such events get the fallback icon.'); });
		} else if (catRefs.length) {
			p.push('The categories cannot be checked: load your instance on the start page, or fill in categories.json first.');
		}
		const places = knownPlaces();
		if (places) {
			placeRefs.forEach((r) => { if (r.value && places.names.indexOf(r.value) < 0) p.push(r.where + ': “' + r.value + '” is not an id or ref in ' + places.from + '.'); });
		}
		return p;
	}

	function filesUsing(refs, value) {
		return refs.filter((r) => r.value === value).map((r) => r.path).filter((p, i, all) => all.indexOf(p) === i);
	}

	/* table cell: the files of the loaded instance that use value */
	function usedIn(refs, value) {
		const files = filesUsing(refs, value);
		if (!files.length) return el('span', { class: 'cfg-muted', text: '–' });
		return el('span', { title: files.join('\n'), text: files.length + (files.length === 1 ? ' file' : ' files') });
	}

	/* after renaming a category or place id: offers to rename it in the
	   other files of the loaded instance; returns a note for the user */
	function renameElsewhere(what, from, to, refs, rename) {
		if (!WS.active()) {
			return 'If sources or inbox events use the ' + what + ' “' + from + '”, change them to “' + to + '” as well, or load your instance on the start page to have it done for you.';
		}
		const files = filesUsing(refs, from);
		if (!files.length) return '';
		if (!window.confirm('The ' + what + ' “' + from + '” is used in ' + files.length + (files.length === 1 ? ' file' : ' files') + ' of the loaded instance:\n\n' + files.join('\n') + '\n\nRename it to “' + to + '” there as well?')) {
			return 'Still “' + from + '” in: ' + files.join(', ') + '.';
		}
		const changed = rename(from, to);
		return 'Renamed in ' + changed.length + (changed.length === 1 ? ' file' : ' files') + ': ' + changed.join(', ') + '.';
	}

	function removeNote(refs, value, consequence) {
		if (!WS.active()) return 'Sources and inbox events that use “' + value + '” need to be changed as well. ' + consequence;
		const files = filesUsing(refs, value);
		return files.length ? 'It is used in: ' + files.join(', ') + '. ' + consequence : '';
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
		{ name: 'icon', key: 'icon', type: 'icon', placeholder: '<svg …>…</svg>  or  M12 21a9 9 0 0 1 0 -18…', hint: 'SVG path data, one path per line, drawn in a 24 × 24 box. Or paste a whole <svg>.' },
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
			const columns = [
				{ label: 'Icon', render: (c) => iconPreview(c.icon) },
				{ label: 'Name', render: (c) => c.name },
				{ label: 'Group', render: (c) => c.group || '' },
			];
			if (WS.active()) columns.push({ label: 'Used in', render: (c) => usedIn(WS.categoryRefs(), c.name) });
			ctx.list = listEditor(ctx, {
				anchor: 'category_name', descs: CATEGORY, key: 'name',
				empty: 'No categories yet. Add the first one above.',
				columns: columns,
				check: (c) => (c.group && c.group === c.name ? 'A category cannot be its own group.' : ''),
				onChange: (items) => datalist('cfg-categories', items.map((c) => c.name)),
				onRename: (from, to, items) => {
					items.forEach((c) => { if (c.group === from) c.group = to; });
					if (getValue(ctx.main, 'fallback_category') === from) setValue(ctx.main, 'fallback_category', to);
					return renameElsewhere('category', from, to, WS.categoryRefs(), WS.renameCategory);
				},
				removeNote: (c) => {
					const groups = ctx.list.items().filter((other) => other.group === c.name).map((other) => other.name);
					const notes = [];
					if (groups.length) notes.push('It is the group of ' + groups.join(', ') + '.');
					notes.push(removeNote(WS.categoryRefs(), c.name, 'Events with this category then get the fallback icon.'));
					return notes.filter(Boolean).join('\n');
				},
			});
			iconField(ctx.main, 'icon', 'category_name');
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
				onRename: (from, to) => {
					const places = ctx.places.items();
					let count = 0;
					places.forEach((pl) => { if (pl.type === from) { pl.type = to; count++; } });
					if (count) ctx.places.render();
					return count ? 'The type of ' + count + (count === 1 ? ' place' : ' places') + ' was changed as well.' : '';
				},
				removeNote: (t) => {
					const count = ctx.places.items().filter((pl) => pl.type === t.name).length;
					return count ? count + (count === 1 ? ' place has' : ' places have') + ' this type; give them another one afterwards.' : '';
				},
			});
			iconField(ctx.main, 'type_icon', 'type_name');
			let auto = null;
			const columns = [
				{ label: 'ID', render: (pl) => el('code', { text: pl.id }) },
				{ label: 'Name', render: (pl) => pl.name },
				{ label: 'Type', render: (pl) => pl.type || '' },
			];
			if (WS.active()) {
				// computed once per table, not once per row
				let refs = null;
				columns.push({ label: 'Used in', render: (pl) => {
					if (!refs) { refs = WS.placeRefs(); setTimeout(() => { refs = null; }); }
					const values = [pl.id].concat(pl.refs || []);
					const files = refs.filter((r) => values.indexOf(r.value) >= 0).map((r) => r.path).filter((p, i, all) => all.indexOf(p) === i);
					return files.length ? el('span', { title: files.join('\n'), text: files.length + (files.length === 1 ? ' file' : ' files') }) : el('span', { class: 'cfg-muted', text: '–' });
				} });
			}
			ctx.places = listEditor(ctx, {
				anchor: 'place_name', descs: PLACE, key: 'id',
				empty: 'No places yet.',
				columns: columns,
				onRename: (from, to) => renameElsewhere('place id', from, to, WS.placeRefs(), WS.renamePlace),
				removeNote: (pl) => removeNote(WS.placeRefs(), pl.id, 'Events linked to it lose the link to the place.'),
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
		{ name: 'category', key: 'category', datalist: 'cfg-instance-categories', placeholder: 'Markt', hint: 'One of the instance’s categories.' },
		{ name: 'description', key: 'description', placeholder: 'Trödel, Bücher und Kuchen.' },
		{ name: 'location_name', key: 'location.name', placeholder: 'Antonplatz' },
		{ name: 'location_address', key: 'location.address', placeholder: 'Antonplatz, 13086 Berlin' },
		{ name: 'organizer', key: 'organizer', placeholder: 'Kiezinitiative' },
		{ name: 'link', key: 'url', placeholder: 'https://example.org/flohmarkt' },
		{ name: 'image', key: 'image', placeholder: 'https://example.org/img/flohmarkt.jpg', hint: 'Optional: https URL of an image at its source. It is linked, not copied; visitors load it after a click or as they have set it.' },
		{ name: 'place', key: 'place', datalist: 'cfg-instance-places', placeholder: 'antonplatz', hint: 'Optional: id or ref of a place in places.json.' },
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
	const INBOX_ORDER = ['title', 'date', 'startTime', 'endTime', 'category', 'description', 'location', 'organizer', 'url', 'image', 'price', 'ticketRequired', 'registrationRequired', 'familyFriendly', 'cancelled', 'place', 'repeat'];

	function fileStem(name) {
		return String(name || '').replace(/\.json$/i, '');
	}

	SPECS.inbox = {
		folder: 'inbox/',
		file: (obj, ctx) => (fileStem(getValue(ctx.main, 'file_name')) || 'event') + '.json',
		keys: () => INBOX_ORDER,
		init: (ctx) => {
			decorate(ctx.main, INBOX);
			instanceDatalists();
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
			return p.concat(refProblems(
				obj.category ? [{ where: 'Category', value: obj.category }] : [],
				obj.place ? [{ where: 'Place', value: obj.place }] : []));
		},
	};

	/* ---------- sources/<name>.json ---------- */

	const TYPES = ['ical', 'rss', 'json', 'html', 'wcs'];
	// sections of the page (heading ids) and the types they apply to
	const SOURCE_SECTIONS = {
		'options-for-icalendar-and-wcs': ['ical', 'wcs'],
		'options-for-icalendar': ['ical'],
		'options-for-wcs': ['wcs'],
		'options-for-json': ['json'],
		'options-for-html': ['html'],
		'field-mapping': ['rss', 'json', 'html'],
	};
	const SOURCE_COMMON = [
		{ name: 'type', key: 'type' },
		{ name: 'url', key: 'url', placeholder: 'https://example.org/events.ics', hint: 'The feed, API or page to fetch; for wcs the site’s base URL.' },
		{ name: 'label', key: 'label', placeholder: 'Freilichtbühne Weißensee', hint: 'Display name, shown as “Quelle: …” and on the About page.' },
		{ name: 'homepage', key: 'homepage', placeholder: 'https://example.org', hint: 'The organiser’s website, linked in the list of sources.' },
		{ name: 'source_name', key: 'name', hint: 'Stable identifier in logs, metrics and events.json. Default: the file name; usually leave it empty.' },
		{ name: 'priority', key: 'priority', type: 'int', placeholder: '0', hint: 'Which version wins when sources overlap: the venue’s own source higher (e.g. 10) than an aggregator (0 or negative).' },
		{ name: 'source_disabled', key: 'disabled', type: 'bool', hint: 'Skip the source without deleting the file.' },
	];
	const SOURCE_FILTERS = [
		{ name: 'days_ahead', key: 'daysAhead', type: 'int', attrs: { min: '1' }, placeholder: '60', hint: 'Keep only events up to N days ahead. wcs: request window (default 30); ical: recurrences are expanded this far (default 180).' },
		{ name: 'place', key: 'place', datalist: 'cfg-instance-places', placeholder: 'brotfabrik', hint: 'Link every event to this place of places.json (id or ref); for sources with a single venue.' },
		{ name: 'allowed_categories', key: 'categories', type: 'list', datalist: 'cfg-instance-categories', placeholder: 'Kultur, Markt', hint: 'Comma-separated allowlist, applied after the category map. Empty: keep all.' },
		{ name: 'event_images', key: 'images', type: 'bool', hint: 'Keep the event images the source provides (iCal IMAGE/ATTACH, mapping “image”). Off by default because licences vary; only https URLs are kept, and the image is linked, never copied.' },
	];
	const SOURCE_BY_TYPE = {
		ical: [
			{ name: 'organizer', key: 'organizer', placeholder: 'Beispiel-Bühne', hint: 'ical: used when an event has no ORGANIZER. wcs: organiser of every event.' },
			{ name: 'default_location', key: 'locationDefault', placeholder: 'Beispiel-Bühne, Musterstraße 5, 12345 Berlin', hint: 'Venue for events without one: “Venue, Street 1, 12345 City”.' },
			{ name: 'family-friendly', key: 'familyFriendly', type: 'bool', hint: 'Mark every event of this source as family-friendly.' },
		],
		icalOnly: [
			{ name: 'utc_times_as', key: 'icalUTCAs', attrs: { pattern: 'local|[+\\-]\\d{2}:?\\d{2}' }, placeholder: '+01:00', hint: 'Only for exporters that mark local times as UTC (…Z) after subtracting a fixed offset, so summer events show an hour late: “+01:00”, or “local” to ignore the Z. Leave empty for correct feeds.' },
		],
		wcs: [
			{ name: 'wcs_type_ids', key: 'wcsTypeIds', type: 'intlist', placeholder: '27, 28, 29, 30', hint: 'Comma-separated. The content[wcs_type][] values of the admin-ajax.php request in the browser’s Network tab. Without them the plugin’s demo classes come along.' },
		],
		json: [
			{ name: 'items_path', key: 'itemsPath', placeholder: 'data.items', hint: 'Dot path to the array of events in the response; empty if the response is the array.' },
			{ name: 'next_page_path', key: 'nextPath', placeholder: 'next_rest_url', hint: 'Dot path to the URL of the next page, for paginated APIs.' },
			{ name: 'max_pages', key: 'maxPages', type: 'int', attrs: { min: '1' }, placeholder: '10', hint: 'Page limit. Default: 10.' },
		],
		html: [
			{ name: 'item_selector', key: 'itemSelector', placeholder: '#events .event', hint: 'CSS selector of one event container.' },
			{ name: 'section_selector', key: 'sectionSelector', placeholder: 'h3.program_date1', hint: 'Optional: headings that group the entries after them; their text is the value “section”.' },
		],
	};
	SOURCE_BY_TYPE.wcs = SOURCE_BY_TYPE.ical.concat(SOURCE_BY_TYPE.wcs);
	SOURCE_BY_TYPE.ical = SOURCE_BY_TYPE.ical.concat(SOURCE_BY_TYPE.icalOnly);
	delete SOURCE_BY_TYPE.icalOnly;
	const EXTRACT = [
		{ name: 'value_name', key: 'name', placeholder: 'title', hint: 'The name used as path in the field mapping.' },
		{ name: 'selector', key: 'selector', placeholder: 'h2 a', hint: 'Relative to the event container; empty = the container itself. Supported: tag, .class, #id, [attr], [attr=value], :first-of-type, :nth-of-type(n), “a b”, “a > b”.' },
		{ name: 'attribute', key: 'attr', placeholder: 'href', hint: 'An attribute instead of the text; relative URLs are resolved.' },
		{ name: 'extract_options', type: 'flags', flags: { 'inner HTML': 'html', 'all matches': 'all' }, hint: 'Inner HTML keeps the paragraphs of a description; all matches joins every match instead of the first.' },
		{ name: 'skip', key: 'skip', type: 'int', attrs: { min: '0' }, hint: 'With all matches: skip the first N.' },
		{ name: 'regex', key: 'regex', placeholder: '(\\d{1,2}:\\d{2})', hint: 'Go syntax. The group “value”, otherwise all groups joined, otherwise the whole match.' },
	];
	const EXTRACT_ORDER = ['selector', 'attr', 'html', 'all', 'skip', 'regex'];
	const TARGETS = ['sourceId', 'title', 'description', 'category', 'organizer', 'url', 'image', 'locationName', 'locationAddress', 'placeRef', 'start', 'end', 'date', 'startTime', 'endTime', 'price', 'ticketRequired', 'registrationRequired', 'familyFriendly', 'cancelled'];
	const BOOL_TARGETS = ['ticketRequired', 'registrationRequired', 'familyFriendly', 'cancelled'];
	const RULE = [
		{ name: 'target_field', key: 'target' },
		{ name: 'path', key: 'path', placeholder: 'location.title', hint: 'JSON: dot path into one item (tags.0 = first tag). RSS: tag name in lower case (content:encoded → encoded), attributes as tag@attribute (enclosure@url). HTML: a value name from above, or section.' },
		{ name: 'template', key: 'template', placeholder: '{street}, {zip} {city}', hint: 'Instead of a path: combine several values; {a|b} takes the first non-empty one.' },
		{ name: 'regex', key: 'regex', hint: 'Extract part of the value (Go syntax).' },
		{ name: 'format', key: 'format', placeholder: '2 Jan 2006 15:04|2 Jan 2006', hint: 'start and end only: Go time layout or RFC3339, RFC1123Z, RFC1123; several separated by |.' },
		{ name: 'default', key: 'default', hint: 'Used when path or template yields nothing.' },
		{ name: 'equals', key: 'equals', placeholder: 'cancelled|canceled', hint: 'Attributes (ticketRequired, registrationRequired, familyFriendly, cancelled) only: texts that count as true.' },
	];
	const RULE_ORDER = ['path', 'regex', 'format', 'default', 'template'];
	const PRICE = [
		{ name: 'amount_path', key: 'amountPath', placeholder: 'price.amount', hint: 'Path to the amount in euros, also as text; 0 or missing = free.' },
		{ name: 'free_path', key: 'freePath', hint: 'Path to an explicit Boolean “free”; takes precedence.' },
		{ name: 'price_unknown', key: 'unknownIfMissing', type: 'bool', hint: 'A missing amount means “price unknown” instead of free.' },
		{ name: 'amount_regex', key: 'amountRegex', placeholder: '(?i)eintritt\\W{0,3}(frei)|(\\d+(?:,\\d+)?)\\s*€', hint: 'Extract the amount from free text at the amount path; “frei” counts as free.' },
	];
	const CATEGORY_MAP = [
		{ name: 'source_category', key: 'from', placeholder: 'Konzert', hint: 'The source’s category name; matched case-insensitively.' },
		{ name: 'instance_category', key: 'to', datalist: 'cfg-instance-categories', placeholder: 'Kultur', hint: 'One of the instance’s categories.' },
	];
	const MATCH = [
		{ name: 'rule', key: 'kind' },
		{ name: 'field', key: 'field' },
		{ name: 'pattern', key: 'regex', placeholder: '(?i)weißensee|1308[68]', hint: 'Go syntax; (?i) makes it case-insensitive.' },
	];
	const SOURCE_ORDER = ['name', 'label', 'homepage', 'priority', 'preset', 'params', 'type', 'url', 'disabled', 'itemsPath', 'nextPath', 'maxPages', 'itemSelector', 'sectionSelector', 'extract', 'mapping', 'daysAhead', 'categories', 'include', 'exclude', 'wcsTypeIds', 'organizer', 'locationDefault', 'icalUTCAs', 'categoryMap', 'familyFriendly', 'place', 'images'];

	// the example instance's templates (sources/*.example.json)
	const SOURCE_TEMPLATES = {
		ical: { label: 'Beispiel-Bühne', homepage: 'https://example.org', type: 'ical', url: 'https://example.org/events.ics', daysAhead: 120, organizer: 'Beispiel-Bühne', locationDefault: 'Beispiel-Bühne, Musterstraße 5', categoryMap: { Konzert: 'Kultur', Theater: 'Kultur' } },
		rss: { label: 'Beispiel-Kulturzentrum', homepage: 'https://example.org', type: 'rss', url: 'https://example.org/events/feed', mapping: { sourceId: { path: 'guid' }, title: { path: 'title' }, description: { path: 'description' }, url: { path: 'link' }, category: { path: 'category', default: 'Kultur' }, organizer: { default: 'Beispiel-Kulturzentrum' }, locationName: { default: 'Beispiel-Kulturzentrum' }, start: { path: 'pubdate', format: 'RFC1123Z' } } },
		json: { label: 'Beispiel-Veranstaltungs-API', homepage: 'https://example.org', type: 'json', url: 'https://example.org/api/events', itemsPath: 'data.items', daysAhead: 60, mapping: { sourceId: { path: 'id' }, title: { path: 'name' }, description: { path: 'text' }, url: { path: 'detailUrl' }, category: { path: 'tags.0', default: 'Unkategorisiert' }, organizer: { path: 'organizer.name' }, locationName: { path: 'location.title' }, locationAddress: { path: 'location.address' }, start: { path: 'startDateTime', format: '2006-01-02T15:04:05Z07:00' }, end: { path: 'endDateTime', format: '2006-01-02T15:04:05Z07:00' }, price: { amountPath: 'price.amount' } } },
		html: { label: 'Beispiel-Stadtteilzentrum', homepage: 'https://example.org', type: 'html', url: 'https://example.org/veranstaltungen.html', itemSelector: '#events .event', extract: { day: '.date .day', month: '.date .month', year: '.date .year', title: 'h2', category: 'a.category', link: { selector: 'h2 a', attr: 'href' }, start: { selector: 'p.time', regex: '(\\d{1,2}:\\d{2})' }, end: { selector: 'p.time', regex: '-\\s*(\\d{1,2}:\\d{2})' }, place: 'p.place', description: { selector: 'p', all: true, skip: 2, html: true } }, mapping: { title: { path: 'title' }, description: { path: 'description' }, category: { path: 'category' }, url: { path: 'link', default: 'https://example.org/veranstaltungen.html' }, locationName: { path: 'place', default: 'Beispiel-Stadtteilzentrum' }, locationAddress: { default: 'Musterstraße 23, 10115 Berlin' }, start: { template: '{day} {month} {year} {start}', format: '2 Jan 2006 15:04|2 Jan 2006' }, end: { template: '{day} {month} {year} {end}', format: '2 Jan 2006 15:04' } }, daysAhead: 60 },
		wcs: { label: 'Beispiel-Familienzentrum', homepage: 'https://example.org', type: 'wcs', url: 'https://example.org', daysAhead: 30, organizer: 'Beispiel-Familienzentrum', locationDefault: 'Beispiel-Familienzentrum, Musterstraße 1', wcsTypeIds: [1, 2, 3], familyFriendly: true, categoryMap: { bewegung: 'Sport', kreatives: 'Kultur' } },
	};

	function ordered(obj, order) {
		const out = {};
		order.forEach((key) => { if (key in obj) out[key] = obj[key]; });
		Object.keys(obj).forEach((key) => { if (!(key in out)) out[key] = obj[key]; });
		return out;
	}

	function sourceType(ctx) {
		const type = getValue(ctx.main, 'type');
		return TYPES.indexOf(type) >= 0 ? type : 'ical';
	}

	/* the chosen preset's name, '' for none */
	function presetName(ctx) {
		const name = getValue(ctx.main, 'preset');
		return name && name !== 'none' ? name : '';
	}

	// keys a preset-based file keeps as they are: the preset provides them,
	// the file may override them, the preset form doesn't edit them
	const PRESET_KEEP = ['type', 'url', 'itemsPath', 'nextPath', 'maxPages', 'itemSelector', 'sectionSelector', 'extract', 'mapping', 'wcsTypeIds', 'organizer', 'locationDefault', 'icalUTCAs', 'familyFriendly'];

	/* the presets shipped with the core, copied into assets/presets/ when the
	   site is assembled (scripts/assemble.sh) */
	function loadPresets() {
		const get = (path) => fetch(path, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(path + ': ' + r.status))));
		return get('assets/presets/index.json')
			.then((names) => Promise.all(names.map((name) => get('assets/presets/' + encodeURIComponent(name) + '.json').then((p) => Object.assign(p, { name: name })))))
			.catch(() => []);
	}

	function showSection(main, id, hidden) {
		const heading = document.getElementById(id);
		if (!heading || !main.contains(heading)) return;
		const level = Number(heading.tagName.slice(1));
		heading.hidden = hidden;
		for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
			if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
			node.hidden = hidden;
		}
	}

	/* shows the sections of the chosen type: a heading and everything up to
	   the next heading of the same or a higher level. With a preset, the
	   preset provides type, address and the type's options. */
	function showSections(main, type, preset) {
		showSection(main, 'type-and-address', !!preset);
		Object.keys(SOURCE_SECTIONS).forEach((id) => showSection(main, id, !!preset || SOURCE_SECTIONS[id].indexOf(type) < 0));
	}

	/* include/exclude rules and the category map, for every source */
	function sourceFilters(ctx, obj) {
		const include = [];
		const exclude = [];
		ctx.matches.items().forEach((m) => (m.kind === 'exclude' ? exclude : include).push({ field: m.field, regex: m.regex }));
		if (include.length) obj.include = include;
		if (exclude.length) obj.exclude = exclude;
		const map = {};
		ctx.categoryMap.items().forEach((m) => { map[m.from] = m.to; });
		if (!isEmpty(map)) obj.categoryMap = map;
		return obj;
	}

	function sourceFields(type) {
		return SOURCE_COMMON.concat(SOURCE_BY_TYPE[type] || [], SOURCE_FILTERS);
	}

	SPECS.source = {
		folder: 'sources/',
		file: (obj, ctx) => (fileStem(getValue(ctx.main, 'file_name')) || 'source') + '.json',
		keys: () => SOURCE_ORDER,
		drop: ['status'],
		init: (ctx) => {
			const all = [];
			[SOURCE_COMMON, SOURCE_BY_TYPE.ical, SOURCE_BY_TYPE.wcs, SOURCE_BY_TYPE.json, SOURCE_BY_TYPE.html, SOURCE_FILTERS].forEach((list) => list.forEach((d) => { if (all.indexOf(d) < 0) all.push(d); }));
			ctx.allFields = all;
			instanceDatalists();
			decorate(ctx.main, all.concat([{ name: 'file_name', hint: 'Without .json. The file name is the source name unless “Source name” is set; keep it stable.' }]));
			ctx.extract = listEditor(ctx, {
				anchor: 'value_name', descs: EXTRACT, key: 'name',
				empty: 'No values yet. Add one per piece of information: title, date, time, link, …',
				columns: [
					{ label: 'Name', render: (x) => el('code', { text: x.name }) },
					{ label: 'Selector', render: (x) => x.selector || '(container)' },
					{ label: 'Details', render: (x) => ['attr', 'html', 'all', 'skip', 'regex'].filter((k) => x[k] !== undefined).map((k) => (x[k] === true ? k : k + ' ' + x[k])).join(', ') },
				],
				check: (x) => (/^[\w.-]+$/.test(x.name) ? '' : 'Use letters, digits, “_”, “-” and “.” for the name.'),
			});
			ctx.rules = listEditor(ctx, {
				anchor: 'target_field', descs: RULE, key: 'target',
				empty: 'No rules yet. An event needs at least a title and a date (start, or date).',
				columns: [
					{ label: 'Field', render: (r) => el('code', { text: r.target }) },
					{ label: 'Rule', render: (r) => ['path', 'template', 'regex', 'format', 'default', 'equals'].filter((k) => r[k] !== undefined).map((k) => k + ': ' + r[k]).join(' · ') },
				],
				check: (r) => {
					if (r.target === 'price') return 'Use the form “Price” below for the price.';
					const bool = BOOL_TARGETS.indexOf(r.target) >= 0;
					if (bool && (r.template || r.regex || r.format || r.default)) return 'Attributes only take a path and “equals”.';
					if (!bool && r.equals) return '“equals” is only for attributes.';
					if (r.format && ['start', 'end'].indexOf(r.target) < 0) return '“format” is only for start and end.';
					if (!r.path && !r.template && !r.default) return 'Give a path, a template or a default.';
					return '';
				},
			});
			ctx.categoryMap = listEditor(ctx, {
				anchor: 'source_category', descs: CATEGORY_MAP, key: 'from',
				empty: 'No translations. Unmapped categories are kept as they are.',
				columns: [
					{ label: 'Source', render: (m) => m.from },
					{ label: 'Instance', render: (m) => m.to || '' },
				],
				check: (m) => (m.to ? '' : 'Give the instance’s category.'),
			});
			ctx.matches = listEditor(ctx, {
				anchor: 'pattern', descs: MATCH, key: null,
				label: (m) => m.kind + ' ' + m.field + ' ' + m.regex,
				empty: 'No rules: every event is kept.',
				columns: [
					{ label: 'Rule', render: (m) => m.kind },
					{ label: 'Field', render: (m) => m.field },
					{ label: 'Regex', render: (m) => el('code', { text: m.regex || '' }) },
				],
			});
			ctx.auto = autoFill(ctx.main, 'label', 'file_name', () => slug(getValue(ctx.main, 'label')));
			const sync = () => showSections(ctx.main, sourceType(ctx), presetName(ctx));
			ctx.syncSections = sync;

			ctx.presets = {};
			ctx.presetsLoaded = false;
			ctx.presetParams = {};
			ctx.presetKept = [];
			const presetSelect = field(ctx.main, 'preset');
			const paramsBox = ctx.main.querySelector('[data-cfg-preset-params]');
			ctx.presetOption = (name, label) => {
				let option = Array.prototype.find.call(presetSelect.options, (o) => o.value === name);
				if (!option) {
					option = el('option', { value: name });
					presetSelect.appendChild(option);
				}
				option.textContent = label;
			};
			ctx.renderPresetParams = () => {
				if (!paramsBox) return;
				paramsBox.textContent = '';
				const name = presetName(ctx);
				if (!name) return;
				const preset = ctx.presets[name];
				if (!preset) {
					paramsBox.appendChild(el('p', { class: 'cfg-hint', text: ctx.presetsLoaded ? 'This version of the config UI doesn’t know the preset “' + name + '”. Its parameters are kept as they are.' : 'Loading the presets…' }));
					return;
				}
				paramsBox.appendChild(el('p', { class: 'cfg-hint', text: preset.description }));
				const form = el('form', { class: 'cfg-preset-form', onsubmit: (event) => event.preventDefault() });
				Object.keys(preset.params || {}).forEach((key) => {
					const def = preset.params[key];
					const id = 'cfg-preset-param-' + key;
					const input = el('input', { type: 'text', id: id, name: 'preset_param_' + key, autocomplete: 'off', spellcheck: 'false' });
					input.value = ctx.presetParams[key] || '';
					if (def.example || def.default) input.setAttribute('placeholder', def.example || def.default);
					if (def.required) input.required = true;
					input.addEventListener('input', () => { ctx.presetParams[key] = input.value; });
					const hint = [def.description, def.default ? 'Default: ' + def.default + '.' : ''].filter(Boolean).join(' ');
					form.appendChild(el('label', { for: id, text: (def.label || key) + (def.required ? '*' : '') }));
					form.appendChild(input);
					if (hint) {
						const small = el('small', { class: 'cfg-hint', id: id + '-hint', text: hint });
						input.setAttribute('aria-describedby', small.id);
						form.appendChild(small);
					}
				});
				paramsBox.appendChild(form);
				if (ctx.presetKept.length) {
					paramsBox.appendChild(el('p', { class: 'cfg-hint', text: 'Kept from the loaded file as overrides of the preset: ' + ctx.presetKept.join(', ') + '.' }));
				}
			};
			presetSelect.addEventListener('change', () => {
				ctx.renderPresetParams();
				sync();
			});
			loadPresets().then((list) => {
				list.forEach((p) => {
					ctx.presets[p.name] = p;
					ctx.presetOption(p.name, p.label || p.name);
				});
				ctx.presetsLoaded = true;
				ctx.renderPresetParams();
				ctx.refresh();
			});

			const typeSelect = field(ctx.main, 'type');
			typeSelect.addEventListener('change', sync);
			typeSelect.form.addEventListener('reset', () => setTimeout(sync));
			const bar = el('p', { class: 'cfg-template' }, [button('Fill in the example for this type', () => {
				const type = sourceType(ctx);
				if (getValue(ctx.main, 'url') && !window.confirm('Replace the current fields with the example for “' + type + '”?')) return;
				ctx.load(JSON.parse(JSON.stringify(SOURCE_TEMPLATES[type])));
				setValue(ctx.main, 'file_name', '');
				ctx.auto.reset();
				field(ctx.main, 'label').dispatchEvent(new Event('input', { bubbles: true }));
			})]);
			typeSelect.form.appendChild(bar);
			sync();
		},
		build: (ctx) => {
			const preset = presetName(ctx);
			if (preset) {
				const obj = readObject(ctx.main, SOURCE_COMMON.filter((d) => d.key !== 'type' && d.key !== 'url').concat(SOURCE_FILTERS));
				obj.preset = preset;
				const params = {};
				Object.keys(ctx.presetParams).forEach((key) => {
					const value = String(ctx.presetParams[key] || '').trim();
					if (value) params[key] = value;
				});
				if (!isEmpty(params)) obj.params = params;
				return ordered(sourceFilters(ctx, obj), SOURCE_ORDER);
			}
			const type = sourceType(ctx);
			const obj = readObject(ctx.main, sourceFields(type));
			obj.type = type;
			if (type === 'html') {
				const extract = {};
				ctx.extract.items().forEach((x) => {
					const rule = ordered(Object.assign({}, x), EXTRACT_ORDER);
					delete rule.name;
					const keys = Object.keys(rule);
					extract[x.name] = keys.length === 1 && keys[0] === 'selector' ? rule.selector : rule;
				});
				if (!isEmpty(extract)) obj.extract = extract;
			}
			if (['rss', 'json', 'html'].indexOf(type) >= 0) {
				const mapping = {};
				ctx.rules.items().forEach((r) => {
					const rule = ordered(Object.assign({}, r), BOOL_TARGETS.indexOf(r.target) >= 0 ? ['path', 'equals'] : RULE_ORDER);
					delete rule.target;
					mapping[r.target] = rule;
				});
				const price = readObject(formOf(ctx.main, 'amount_path'), PRICE);
				if (!isEmpty(price)) mapping.price = price;
				if (!isEmpty(mapping)) obj.mapping = ordered(mapping, TARGETS);
			}
			return ordered(sourceFilters(ctx, obj), SOURCE_ORDER);
		},
		load: (ctx, obj) => {
			const preset = typeof obj.preset === 'string' ? obj.preset : '';
			ctx.presetParams = Object.assign({}, obj.params || {});
			ctx.presetKept = [];
			if (preset) {
				if (!ctx.presets[preset]) ctx.presetOption(preset, preset);
				PRESET_KEEP.forEach((key) => {
					if (key in obj) {
						ctx.extras[key] = obj[key];
						ctx.presetKept.push(key);
					}
				});
			}
			setValue(ctx.main, 'preset', preset || 'none');
			writeObject(ctx.main, ctx.allFields, preset ? {} : obj);
			writeObject(ctx.main, SOURCE_COMMON.filter((d) => d.key !== 'type' && d.key !== 'url').concat(SOURCE_FILTERS), obj);
			if (preset || TYPES.indexOf(obj.type) < 0) setValue(ctx.main, 'type', 'ical');
			ctx.renderPresetParams();
			if (preset) {
				ctx.extract.set([]);
				ctx.rules.set([]);
				ctx.categoryMap.set(Object.keys(obj.categoryMap || {}).map((from) => ({ from: from, to: obj.categoryMap[from] })));
				ctx.matches.set((obj.include || []).map((m) => Object.assign({ kind: 'include' }, m)).concat((obj.exclude || []).map((m) => Object.assign({ kind: 'exclude' }, m))));
				ctx.syncSections();
				return;
			}
			ctx.extract.set(Object.keys(obj.extract || {}).map((name) => {
				const rule = obj.extract[name];
				return Object.assign({ name: name }, typeof rule === 'string' ? { selector: rule } : rule);
			}));
			const mapping = obj.mapping || {};
			ctx.rules.set(Object.keys(mapping).filter((t) => t !== 'price').map((t) => Object.assign({ target: t }, mapping[t])));
			writeObject(formOf(ctx.main, 'amount_path'), PRICE, mapping.price || {});
			ctx.categoryMap.set(Object.keys(obj.categoryMap || {}).map((from) => ({ from: from, to: obj.categoryMap[from] })));
			ctx.matches.set((obj.include || []).map((m) => Object.assign({ kind: 'include' }, m)).concat((obj.exclude || []).map((m) => Object.assign({ kind: 'exclude' }, m))));
			ctx.syncSections();
		},
		meta: (ctx) => ({ file: getValue(ctx.main, 'file_name') }),
		restore: (ctx, meta) => {
			if (meta.file) {
				setValue(ctx.main, 'file_name', meta.file);
				ctx.auto.keep();
			}
		},
		imported: (ctx, name) => {
			setValue(ctx.main, 'file_name', fileStem(name));
			ctx.auto.keep();
		},
		cleared: (ctx) => ctx.auto.reset(),
		validate: (obj, ctx) => {
			const p = [];
			const stem = fileStem(getValue(ctx.main, 'file_name'));
			if (!stem) p.push('Give the file a name.');
			else if (!/^[A-Za-z0-9_.-]+$/.test(stem)) p.push('The file name should only contain letters, digits, “-”, “_” and “.”.');
			if (/\.example$/i.test(stem)) p.push('Files ending in .example.json are templates and are not loaded.');
			if (obj.preset) {
				const preset = ctx.presets[obj.preset];
				if (!preset && ctx.presetsLoaded) p.push('The core of this config UI has no preset “' + obj.preset + '”; check the name or the core version.');
				const params = obj.params || {};
				if (preset) {
					Object.keys(preset.params || {}).forEach((key) => {
						if (preset.params[key].required && !params[key]) p.push('Preset: “' + (preset.params[key].label || key) + '” is required.');
					});
					Object.keys(params).forEach((key) => {
						if (!(key in (preset.params || {}))) p.push('Preset: “' + obj.preset + '” has no parameter “' + key + '”.');
					});
				}
				return p.concat(sourceRefProblems(obj));
			}
			if (!obj.url) p.push('The URL is required.');
			else if (!RE.url.test(obj.url)) p.push('The URL must start with https:// (or http://).');
			if (obj.homepage && !RE.url.test(obj.homepage)) p.push('The homepage must be an absolute URL.');
			if (obj.type === 'wcs' && !obj.wcsTypeIds) p.push('wcs: without type IDs the plugin also returns its demo classes.');
			if (obj.type === 'wcs' && obj.url && /admin-ajax/.test(obj.url)) p.push('wcs: the URL is the site’s base URL, not the admin-ajax.php endpoint.');
			if (obj.type === 'html' && !obj.itemSelector) p.push('html: the item selector is required.');
			if (obj.type === 'html' && (!obj.extract || isEmpty(obj.extract))) p.push('html: add the values to read from each event (extract).');
			if (obj.itemSelector && /,/.test(obj.itemSelector)) p.push('Selector lists (“,”) are not supported.');
			if (['rss', 'json', 'html'].indexOf(obj.type) >= 0) {
				const m = obj.mapping || {};
				if (!m.title) p.push('The field mapping needs a rule for title.');
				if (!m.start && !m.date) p.push('The field mapping needs a rule for start (or date).');
				if (obj.type === 'rss' && m.start && m.start.path === 'pubdate') p.push('rss: pubDate is often the date of the post, not of the event. Check a few entries against the website.');
				if (obj.type === 'html' && obj.extract) {
					const names = Object.keys(obj.extract).concat(obj.sectionSelector ? ['section'] : []);
					Object.keys(m).forEach((target) => {
						const rule = m[target];
						const refs = [];
						if (rule.path) refs.push(rule.path);
						(rule.template || '').replace(/\{([^}]+)\}/g, (all, inner) => { inner.split('|').forEach((n) => refs.push(n.trim())); return all; });
						refs.forEach((ref) => { if (names.indexOf(ref) < 0) p.push(target + ': “' + ref + '” is not one of the extracted values.'); });
					});
				}
			}
			return p.concat(sourceRefProblems(obj));
		},
	};

	/* categories and places a source refers to that the instance lacks */
	function sourceRefProblems(obj) {
		const catRefs = [];
		Object.keys(obj.categoryMap || {}).forEach((from) => catRefs.push({ where: 'Category map “' + from + '”', value: obj.categoryMap[from] }));
		(obj.categories || []).forEach((name) => catRefs.push({ where: 'Allowed categories', value: name }));
		const mapping = obj.mapping || {};
		if (mapping.category && mapping.category.default) catRefs.push({ where: 'Field mapping, category default', value: mapping.category.default });
		const placeRefs = [];
		if (obj.place) placeRefs.push({ where: 'Place', value: obj.place });
		if (mapping.placeRef && mapping.placeRef.default) placeRefs.push({ where: 'Field mapping, placeRef default', value: mapping.placeRef.default });
		return refProblems(catRefs, placeRefs);
	}

	/* ---------- start page: load, check and download the instance ---------- */

	const EDIT_PAGES = { 'instance.json': 'instance', 'categories.json': 'categories', 'places.json': 'places', 'sources/': 'source', 'inbox/': 'inbox' };

	function editLink(path) {
		if (EDIT_PAGES[path]) return '?page=' + EDIT_PAGES[path];
		const folder = path.slice(0, path.indexOf('/') + 1);
		return EDIT_PAGES[folder] ? '?page=' + EDIT_PAGES[folder] + '&file=' + encodeURIComponent(path) : '';
	}

	/* files and folders dropped onto the page: [{ path, file }] */
	async function droppedEntries(dataTransfer) {
		const out = [];
		const walk = (entry, prefix) => new Promise((resolve) => {
			if (entry.isFile) {
				entry.file((file) => { out.push({ path: prefix + file.name, file: file }); resolve(); }, () => resolve());
			} else if (entry.isDirectory) {
				const reader = entry.createReader();
				const all = [];
				const next = () => reader.readEntries((batch) => {
					if (!batch.length) {
						Promise.all(all.map((child) => walk(child, prefix + entry.name + '/'))).then(resolve);
						return;
					}
					all.push.apply(all, batch);
					next();
				}, () => resolve());
				next();
			} else resolve();
		});
		const items = Array.prototype.slice.call(dataTransfer.items || []);
		const entries = items.map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)).filter(Boolean);
		if (entries.length) {
			await Promise.all(entries.map((entry) => walk(entry, '')));
			return { entries: out, folder: entries.some((e) => e.isDirectory) };
		}
		Array.prototype.forEach.call(dataTransfer.files || [], (file) => out.push({ path: file.name, file: file }));
		return { entries: out, folder: false };
	}

	function setUpWorkspace(box) {
		box.classList.add('cfg-workspace');
		const status = el('p', { class: 'cfg-status', role: 'status' });
		const folderInput = el('input', { type: 'file', multiple: '', hidden: '' });
		folderInput.webkitdirectory = true;
		const filesInput = el('input', { type: 'file', multiple: '', accept: '.json,.zip,application/json,application/zip', hidden: '' });
		const content = el('div');

		function forgetBindings() {
			Object.keys(SPECS).forEach((name) => { try { localStorage.removeItem(BOUND_PREFIX + name); } catch (e) {} });
		}

		async function load(entries, wholeInstance) {
			if (!entries.length) return;
			const zip = entries.some((e) => /\.zip$/i.test(e.path));
			const replace = wholeInstance || zip;
			if (replace && WS.active() && !window.confirm('Replace the loaded instance “' + WS.instanceName() + '”? Changes that you have not downloaded are lost.')) return;
			status.textContent = 'Reading…';
			try {
				const report = await WS.importEntries(entries, replace);
				if (replace) forgetBindings();
				const parts = [];
				if (report.added.length) parts.push(report.added.length + (report.added.length === 1 ? ' file' : ' files') + ' loaded');
				if (report.replaced.length) parts.push(report.replaced.length + ' replaced');
				if (report.invalid.length) parts.push('not valid JSON: ' + report.invalid.join(', '));
				if (report.ignored.length) parts.push('ignored (not a configuration file): ' + report.ignored.join(', '));
				status.textContent = (parts.join('; ') || 'No configuration files found. Pick the instance folder, the one with instance.json, sources/ and inbox/.') + '.';
			} catch (e) {
				status.textContent = e.message;
			}
			render();
		}

		folderInput.addEventListener('change', () => {
			const entries = Array.prototype.map.call(folderInput.files, (file) => ({ path: file.webkitRelativePath || file.name, file: file }));
			folderInput.value = '';
			load(entries, true);
		});
		filesInput.addEventListener('change', () => {
			const entries = Array.prototype.map.call(filesInput.files, (file) => ({ path: file.name, file: file }));
			filesInput.value = '';
			load(entries, false);
		});
		box.addEventListener('dragover', (event) => { event.preventDefault(); box.classList.add('cfg-drop'); });
		box.addEventListener('dragleave', () => box.classList.remove('cfg-drop'));
		box.addEventListener('drop', (event) => {
			event.preventDefault();
			box.classList.remove('cfg-drop');
			droppedEntries(event.dataTransfer).then((dropped) => load(dropped.entries, dropped.folder));
		});

		function render() {
			content.textContent = '';
			const actions = el('p', { class: 'cfg-actions' }, [
				button('Load the instance folder…', () => folderInput.click(), 'cfg-button' + (WS.active() ? '' : ' cfg-primary')),
				button('Load files or a ZIP…', () => filesInput.click()),
				el('span', { class: 'cfg-muted', text: 'or drop them here.' }),
			]);
			content.appendChild(actions);
			if (!WS.active()) return;

			const paths = WS.paths();
			const head = el('p', { class: 'cfg-workspace-head' }, [
				el('strong', { text: 'Loaded: “' + WS.instanceName() + '”' }),
				' – ' + paths.length + (paths.length === 1 ? ' file' : ' files') + '. ',
			]);
			content.appendChild(head);
			content.appendChild(el('p', { class: 'cfg-actions' }, [
				button('Download all (ZIP)', () => downloadZip(status), 'cfg-button cfg-primary'),
				button('Unload', () => {
					if (!window.confirm('Remove the loaded instance from this browser? Changes that you have not downloaded are lost. Your files on disk are not touched.')) return;
					WS.clear();
					forgetBindings();
					status.textContent = 'The instance was removed from this browser.';
					render();
				}),
			]));

			const problems = WS.check();
			if (problems.length) {
				content.appendChild(el('p', { class: 'cfg-problems-head', text: problems.length + (problems.length === 1 ? ' thing needs' : ' things need') + ' your attention:' }));
				content.appendChild(el('ul', { class: 'cfg-warnings' }, problems.map((pr) => {
					const link = editLink(pr.path);
					return el('li', {}, [link && WS.has(pr.path) ? el('a', { href: link, text: pr.path }) : el('code', { text: pr.path }), ' ' + pr.text]);
				})));
			} else {
				content.appendChild(el('p', { class: 'cfg-ok', text: 'The categories and places used by the sources and inbox events all exist.' }));
			}

			const body = el('tbody', {}, paths.map((path) => {
				const link = editLink(path);
				return el('tr', {}, [
					el('td', {}, [link ? el('a', { href: link, text: path }) : el('code', { text: path })]),
					el('td', { class: 'cfg-row-actions' }, [button('Remove', () => {
						if (!window.confirm('Remove ' + path + ' from the loaded instance?')) return;
						WS.remove(path);
						render();
					}, 'cfg-link cfg-danger')]),
				]);
			}));
			content.appendChild(el('div', { class: 'cfg-list' }, [el('table', {}, [
				el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'File' }), el('th', { scope: 'col', text: '' })])]),
				body,
			])]));
		}

		box.append(content, status, folderInput, filesInput);
		render();
	}

	/* ---------- start ---------- */

	document.addEventListener('mdp:rendered', (event) => {
		if (!event.detail || event.detail.region !== 'main') return;
		const main = document.querySelector('main');
		const spec = SPECS[page];
		if (spec && spec.init) setUp(main, spec);
		const box = main.querySelector('[data-cfg-workspace]');
		if (box) setUpWorkspace(box);
	});
})();
