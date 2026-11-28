/*!
 * markdown-pages-editor - lightweight, configurable Markdown editor with live preview
 * https://github.com/schreibtischhelden/markdown-pages-editor
 * MIT License
 *
 * A <textarea> with a toolbar and an optional preview. It has no
 * dependencies and does not convert Markdown itself: the preview uses the
 * render function you pass (e.g. Showdown + DOMPurify), so it looks exactly
 * like your site. Nothing is sent anywhere.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else if (typeof define === 'function' && define.amd) {
		define([], factory);
	} else {
		root.markdownPagesEditor = factory();
	}
})(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	// ---------------------------------------------------------------------
	// Text commands (pure, unit tested)
	// ---------------------------------------------------------------------
	//
	// A command gets the text and the selection { value, start, end } and
	// returns one edit { from, to, text } plus the new selection
	// { start, end }. Applying a single edit keeps the browser's undo history.

	function lineStart(value, index) {
		return value.lastIndexOf('\n', index - 1) + 1;
	}

	function lineEnd(value, index) {
		var end = value.indexOf('\n', index);
		return end < 0 ? value.length : end;
	}

	/** full lines touched by the selection; a selection ending at the start of a line does not include it */
	function selectedLines(state) {
		var end = state.end > state.start && state.value.charAt(state.end - 1) === '\n' ? state.end - 1 : state.end;
		var from = lineStart(state.value, state.start);
		var to = lineEnd(state.value, end);
		return { from: from, to: to, lines: state.value.slice(from, to).split('\n') };
	}

	/** wraps the selection in before/after, or removes them if they are already there */
	function wrap(state, before, after, placeholder) {
		var value = state.value;
		var selected = value.slice(state.start, state.end);
		var outer = state.start >= before.length
			&& value.slice(state.start - before.length, state.start) === before
			&& value.slice(state.end, state.end + after.length) === after;
		if (outer) {
			return {
				from: state.start - before.length,
				to: state.end + after.length,
				text: selected,
				start: state.start - before.length,
				end: state.end - before.length,
			};
		}
		var inner = selected.length >= before.length + after.length
			&& selected.slice(0, before.length) === before
			&& selected.slice(selected.length - after.length) === after;
		if (inner) {
			var stripped = selected.slice(before.length, selected.length - after.length);
			return { from: state.start, to: state.end, text: stripped, start: state.start, end: state.start + stripped.length };
		}
		var text = selected || placeholder;
		return {
			from: state.start,
			to: state.end,
			text: before + text + after,
			start: state.start + before.length,
			end: state.start + before.length + text.length,
		};
	}

	/** replaces the selected lines with mapLines(lines) and selects them */
	function editLines(state, mapLines) {
		var range = selectedLines(state);
		var text = mapLines(range.lines).join('\n');
		var single = range.lines.length === 1 && state.start === state.end;
		var cursor = single ? range.from + text.length : range.from;
		return { from: range.from, to: range.to, text: text, start: cursor, end: range.from + text.length };
	}

	/** adds a prefix to every selected line, or removes it if all lines have it */
	function prefixLines(state, prefix) {
		return editLines(state, function (lines) {
			var all = lines.every(function (line) {
				return line.slice(0, prefix.length) === prefix;
			});
			return lines.map(function (line) {
				return all ? line.slice(prefix.length) : prefix + line;
			});
		});
	}

	var NUMBERED = /^\d+\.\s/;

	function numberedList(state) {
		return editLines(state, function (lines) {
			var all = lines.every(function (line) {
				return NUMBERED.test(line);
			});
			return lines.map(function (line, index) {
				return all ? line.replace(NUMBERED, '') : (index + 1) + '. ' + line;
			});
		});
	}

	/** cycles the heading level of the selected lines: none -> ## -> ### -> none */
	function heading(state) {
		return editLines(state, function (lines) {
			var match = /^(#{1,6}) /.exec(lines[0]);
			var level = match ? match[1].length : 0;
			var next = level === 0 ? 2 : level >= 3 ? 0 : level + 1;
			return lines.map(function (line) {
				var text = line.replace(/^#{1,6} /, '');
				return next ? new Array(next + 1).join('#') + ' ' + text : text;
			});
		});
	}

	function link(state) {
		var selected = state.value.slice(state.start, state.end);
		if (/^(https?:\/\/|mailto:|\?|\.\/)\S*$/.test(selected)) {
			// the selection is the address: ask for the text
			return {
				from: state.start,
				to: state.end,
				text: '[link text](' + selected + ')',
				start: state.start + 1,
				end: state.start + 10,
			};
		}
		var text = selected || 'link text';
		var url = 'https://';
		var urlStart = state.start + text.length + 3;
		return {
			from: state.start,
			to: state.end,
			text: '[' + text + '](' + url + ')',
			start: urlStart,
			end: urlStart + url.length,
		};
	}

	/** inline code, or a fenced block when the selection spans lines */
	function code(state) {
		var selected = state.value.slice(state.start, state.end);
		if (selected.indexOf('\n') < 0) {
			return wrap(state, '`', '`', 'code');
		}
		var from = lineStart(state.value, state.start);
		var to = selectedLines(state).to;
		var body = state.value.slice(from, to);
		var text = '```\n' + body + '\n```';
		return { from: from, to: to, text: text, start: from + 4, end: from + 4 + body.length };
	}

	/** image: like link, with "!" and alt text */
	function image(state) {
		var selected = state.value.slice(state.start, state.end);
		if (/^(https?:\/\/|\.\/|\/)\S*$/.test(selected)) {
			return { from: state.start, to: state.end, text: '![alt text](' + selected + ')', start: state.start + 2, end: state.start + 10 };
		}
		var alt = selected || 'alt text';
		var urlStart = state.start + alt.length + 4;
		return { from: state.start, to: state.end, text: '![' + alt + '](https://)', start: urlStart, end: urlStart + 8 };
	}

	/** fenced code block around the selected lines, or removes the fences if they are already there */
	function codeBlock(state) {
		var range = selectedLines(state);
		var lines = range.lines;
		if (lines.length >= 2 && /^ {0,3}```/.test(lines[0]) && /^ {0,3}```\s*$/.test(lines[lines.length - 1])) {
			var inner = lines.slice(1, -1).join('\n');
			return { from: range.from, to: range.to, text: inner, start: range.from, end: range.from + inner.length };
		}
		var body = state.start === state.end && !lines.join('').trim() ? 'code' : lines.join('\n');
		var text = '```\n' + body + '\n```';
		return { from: range.from, to: range.to, text: text, start: range.from + 4, end: range.from + 4 + body.length };
	}

	/** inserts a block after the line of the cursor, separated by a blank line; selects [selectFrom, selectTo) of block */
	function insertBlock(state, block, selectFrom, selectTo) {
		var at = lineEnd(state.value, state.end);
		var before = at > 0 ? (state.value.slice(lineStart(state.value, at), at).trim() ? '\n\n' : '\n') : '';
		var text = before + block + '\n';
		var offset = at + before.length;
		return { from: at, to: at, text: text, start: offset + selectFrom, end: offset + selectTo };
	}

	/** horizontal rule after the line of the cursor */
	function rule(state) {
		var edit = insertBlock(state, '---', 0, 0);
		edit.start = edit.end = edit.from + edit.text.length;
		return edit;
	}

	/**
	 * Table. Selected lines become rows (cells split at tabs, as pasted from
	 * a spreadsheet, or at "|"); otherwise a 2x2 template is inserted.
	 */
	function table(state) {
		var range = selectedLines(state);
		var rows = state.start === state.end ? [] : range.lines.filter(function (line) {
			return line.trim();
		}).map(function (line) {
			return (line.indexOf('\t') >= 0 ? line.split('\t') : line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')).map(function (cell) {
				return cell.trim();
			});
		});
		if (!rows.length) {
			var template = '| Column 1 | Column 2 |\n| --- | --- |\n| Text | Text |';
			return insertBlock(state, template, 2, 10);
		}
		var columns = rows.reduce(function (max, row) { return Math.max(max, row.length); }, 1);
		var line = function (cells) {
			var all = cells.slice();
			while (all.length < columns) {
				all.push('');
			}
			return '| ' + all.join(' | ') + ' |';
		};
		var separator = [];
		while (separator.length < columns) {
			separator.push('---');
		}
		var lines = [line(rows[0]), line(separator)];
		rows.slice(1).forEach(function (row) {
			lines.push(line(row));
		});
		var text = lines.join('\n');
		return { from: range.from, to: range.to, text: text, start: range.from, end: range.from + text.length };
	}

	/** footnote reference at the cursor and the note at the end of the text, with the next free number */
	function footnote(state) {
		var value = state.value;
		var number = 1;
		while (value.indexOf('[^' + number + ']') >= 0) {
			number++;
		}
		var ref = '[^' + number + ']';
		var selected = value.slice(state.start, state.end);
		var note = ref + ': ' + (selected || 'footnote text');
		var tail = value.slice(state.end);
		// right after existing notes, otherwise after a blank line
		var notesAtEnd = /(^|\n)\[\^[^\]\n]+\]:[^\n]*\n?$/.test(value);
		var separator = /\n\n$/.test(value) ? '' : /\n$/.test(value) ? (notesAtEnd ? '' : '\n') : (notesAtEnd ? '\n' : '\n\n');
		// one edit from the cursor to the end keeps undo in one step
		var text = ref + tail + separator + note + '\n';
		var noteStart = state.start + ref.length + tail.length + separator.length + ref.length + 2;
		return { from: state.start, to: value.length, text: text, start: noteStart, end: noteStart + (selected || 'footnote text').length };
	}

	/**
	 * 16x16 outline icons: [tag, attributes] per shape, drawn with
	 * stroke="currentColor". Used for the mode buttons and commands with
	 * an icon.
	 */
	var ICONS = {
		write: [['path', { d: 'M2.5 13.5l.8-3.2L10.8 2.8a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2l-7.5 7.5z' }], ['path', { d: 'M9.5 4l2.5 2.5' }]],
		split: [['rect', { x: '1.5', y: '2.5', width: '13', height: '11', rx: '1.5' }], ['path', { d: 'M8 2.5v11' }]],
		preview: [['path', { d: 'M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z' }], ['circle', { cx: '8', cy: '8', r: '2' }]],
		link: [['path', { d: 'M6.8 9.2a2.8 2.8 0 0 0 4 0l2.2-2.2a2.8 2.8 0 0 0-4-4l-.9.9' }], ['path', { d: 'M9.2 6.8a2.8 2.8 0 0 0-4 0L3 9a2.8 2.8 0 0 0 4 4l.9-.9' }]],
		image: [['rect', { x: '1.5', y: '2.5', width: '13', height: '11', rx: '1.5' }], ['circle', { cx: '5.5', cy: '6', r: '1.2' }], ['path', { d: 'M14.5 10.5l-3.5-3.5-7 6.5' }]],
		code: [['path', { d: 'M5.5 4.5L2 8l3.5 3.5' }], ['path', { d: 'M10.5 4.5L14 8l-3.5 3.5' }]],
		codeBlock: [['rect', { x: '1.5', y: '2.5', width: '13', height: '11', rx: '1.5' }], ['path', { d: 'M6.5 6L4.5 8l2 2' }], ['path', { d: 'M9.5 6l2 2-2 2' }]],
		table: [['rect', { x: '1.5', y: '2.5', width: '13', height: '11', rx: '1.5' }], ['path', { d: 'M1.5 6.2h13M1.5 9.8h13M8 6.2v7.3' }]],
		tasks: [['rect', { x: '1.5', y: '2', width: '5', height: '5', rx: '1' }], ['path', { d: 'M2.8 4.5l1 1 1.7-2' }], ['rect', { x: '1.5', y: '9', width: '5', height: '5', rx: '1' }], ['path', { d: 'M9 4.5h5.5M9 11.5h5.5' }]],
		help: [['circle', { cx: '8', cy: '8', r: '6.5' }], ['path', { d: 'M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4' }], ['path', { d: 'M8 11.6v.1' }]],
	};

	/**
	 * Built-in commands. text: visible button text, icon: shapes from ICONS
	 * (shown instead of the text unless icons are switched off), label:
	 * accessible name (see LABELS), shortcut: key with Ctrl/Cmd.
	 */
	var COMMANDS = {
		bold: { text: 'B', shortcut: 'b', run: function (state) { return wrap(state, '**', '**', 'bold text'); } },
		italic: { text: 'I', shortcut: 'i', run: function (state) { return wrap(state, '_', '_', 'italic text'); } },
		strikethrough: { text: 'S', run: function (state) { return wrap(state, '~~', '~~', 'text'); } },
		heading: { text: 'H', run: heading },
		link: { text: 'Link', icon: ICONS.link, shortcut: 'k', run: link },
		image: { text: 'Img', icon: ICONS.image, run: image },
		code: { text: '</>', icon: ICONS.code, run: code },
		codeBlock: { text: '{ }', icon: ICONS.codeBlock, run: codeBlock },
		quote: { text: '“', run: function (state) { return prefixLines(state, '> '); } },
		list: { text: '•', run: function (state) { return prefixLines(state, '- '); } },
		numbered: { text: '1.', run: numberedList },
		tasks: { text: '☐', icon: ICONS.tasks, run: function (state) { return prefixLines(state, '- [ ] '); } },
		table: { text: 'Tbl', icon: ICONS.table, run: table },
		rule: { text: '—', run: rule },
		// extended syntax that not every renderer supports - not in the default toolbar
		highlight: { text: 'M', run: function (state) { return wrap(state, '==', '==', 'text'); } },
		subscript: { text: 'x₂', run: function (state) { return wrap(state, '~', '~', 'text'); } },
		superscript: { text: 'x²', run: function (state) { return wrap(state, '^', '^', 'text'); } },
		footnote: { text: '¹', run: footnote },
		definition: { text: 'DL', run: function (state) { return prefixLines(state, ': '); } },
	};

	var DEFAULT_TOOLBAR = ['bold', 'italic', 'strikethrough', 'heading', '|', 'link', 'image', 'code', 'codeBlock', '|', 'quote', 'list', 'numbered', 'tasks', 'table'];
	var MODES = ['write', 'split', 'preview'];

	var LABELS = {
		toolbar: 'Formatting',
		bold: 'Bold',
		italic: 'Italic',
		strikethrough: 'Strikethrough',
		heading: 'Heading',
		link: 'Link',
		image: 'Image',
		code: 'Code',
		codeBlock: 'Code block',
		quote: 'Quote',
		list: 'Bulleted list',
		numbered: 'Numbered list',
		tasks: 'Task list',
		table: 'Table',
		rule: 'Horizontal rule',
		highlight: 'Highlight',
		subscript: 'Subscript',
		superscript: 'Superscript',
		footnote: 'Footnote',
		definition: 'Definition',
		write: 'Write',
		preview: 'Preview',
		split: 'Side by side',
		download: 'Download',
		downloadMarkdown: 'Markdown (.md)',
		downloadHtml: 'HTML (.html)',
		input:'Markdown',
		empty: 'Nothing to preview yet.',
		help: 'Markdown help',
	};

	/** applies an edit to a plain string */
	function applyEdit(value, edit) {
		return value.slice(0, edit.from) + edit.text + value.slice(edit.to);
	}

	/**
	 * File name for downloads: no folders, no characters that are invalid on
	 * common systems, ends in .md (or .markdown). With format "html" it ends
	 * in .html (or .htm); a .md / .markdown extension is replaced.
	 */
	function safeFileName(name, format) {
		var html = format === 'html';
		var base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]+/g, '').trim();
		base = base.replace(/^\.+/, '');
		if (html) {
			base = base.replace(/\.(md|markdown)$/i, '');
		}
		if (!base) {
			base = 'document';
		}
		if (html) {
			return /\.html?$/i.test(base) ? base : base + '.html';
		}
		return /\.(md|markdown)$/i.test(base) ? base : base + '.md';
	}

	function escapeHtml(text) {
		return String(text).replace(/[&<>"']/g, function (char) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[char];
		});
	}

	/**
	 * Text of the first level 1 heading ("# Title" or "Title" + "===") outside
	 * code blocks, without inline Markdown marks; "" if there is none.
	 */
	function documentTitle(markdown) {
		var lines = String(markdown || '').split(/\r?\n/);
		var fence = null;
		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];
			var marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
			if (fence) {
				if (marker && marker[1].charAt(0) === fence.charAt(0) && marker[1].length >= fence.length) {
					fence = null;
				}
				continue;
			}
			if (marker) {
				fence = marker[1];
				continue;
			}
			var text = null;
			if (/^ {0,3}#([ \t]|$)/.test(line)) {
				text = atxText(line);
			} else if (/^ {0,3}=+[ \t]*$/.test(lines[i + 1] || '') && /\S/.test(line) && !/^( {4}|\t)/.test(line)) {
				text = line;
			}
			if (text !== null) {
				text = stripLinks(text)
					.replace(/(\*\*|__|\*|_|~~|`)([^*_~`]+)\1/g, '$2')
					.replace(/\s+/g, ' ')
					.trim();
				if (text) {
					return text;
				}
			}
		}
		return '';
	}

	// the helpers below avoid regular expressions with nested repetition, so
	// long lines cannot make them slow (ReDoS)

	function trimEnd(text) {
		var end = text.length;
		while (end > 0 && /\s/.test(text.charAt(end - 1))) {
			end--;
		}
		return text.slice(0, end);
	}

	/** text of an ATX heading line: without the leading "#" and an optional closing "#" sequence */
	function atxText(line) {
		var text = trimEnd(line.slice(line.indexOf('#') + 1));
		var end = text.length;
		while (end > 0 && text.charAt(end - 1) === '#') {
			end--;
		}
		// closing hashes count only after a space (or if the heading is empty)
		if (end < text.length && (end === 0 || /[ \t]/.test(text.charAt(end - 1)))) {
			text = text.slice(0, end);
		}
		return text.trim();
	}

	/** "[text](url)" and "![alt](url)" become their text */
	function stripLinks(text) {
		var out = '';
		var index = 0;
		while (index < text.length) {
			var open = text.indexOf('[', index);
			var close = open < 0 ? -1 : text.indexOf(']', open + 1);
			var end = close < 0 || text.charAt(close + 1) !== '(' ? -1 : text.indexOf(')', close + 2);
			if (end < 0) {
				return out + text.slice(index);
			}
			var start = open > index && text.charAt(open - 1) === '!' ? open - 1 : open;
			out += text.slice(index, start) + text.slice(open + 1, close);
			index = end + 1;
		}
		return out;
	}

	/**
	 * Wraps rendered HTML in a complete document. options: title, lang and
	 * head (extra HTML for <head>, inserted as is, e.g. a stylesheet link).
	 */
	function htmlDocument(body, options) {
		options = options || {};
		var lang = String(options.lang || '').replace(/[^A-Za-z0-9-]/g, '');
		return '<!doctype html>\n' +
			'<html' + (lang ? ' lang="' + lang + '"' : '') + '>\n' +
			'<head>\n' +
			'<meta charset="utf-8">\n' +
			'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
			'<title>' + escapeHtml(options.title || 'Document') + '</title>\n' +
			(options.head ? trimEnd(String(options.head)) + '\n' : '') +
			'</head>\n' +
			'<body>\n' +
			trimEnd(String(body || '')) + '\n' +
			'</body>\n' +
			'</html>\n';
	}

	// ---------------------------------------------------------------------
	// Comparing HTML documents (pure, unit tested)
	// ---------------------------------------------------------------------
	//
	// A small tokenizer instead of DOMParser, so it also runs without a DOM.
	// It is written with indexOf loops (no regular expressions with nested
	// repetition), so long or broken input stays fast.

	var VOID_ELEMENTS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];
	var RAW_TEXT_ELEMENTS = ['script', 'style', 'textarea', 'title'];
	var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

	function decodeEntities(text) {
		return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, function (all, code) {
			if (code.charAt(0) === '#') {
				var number = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
				return number > 0 && number < 0x110000 ? String.fromCodePoint ? String.fromCodePoint(number) : String.fromCharCode(number) : all;
			}
			return ENTITIES.hasOwnProperty(code.toLowerCase()) ? ENTITIES[code.toLowerCase()] : all;
		});
	}

	function isSpace(char) {
		return char === ' ' || char === '\n' || char === '\t' || char === '\f' || char === '\r';
	}

	/** index after the ">" that ends the tag starting at "<" (quotes respected), or -1 */
	function tagEnd(html, from) {
		var quote = '';
		for (var i = from + 1; i < html.length; i++) {
			var char = html.charAt(i);
			if (quote) {
				if (char === quote) {
					quote = '';
				}
			} else if (char === '"' || char === '\'') {
				quote = char;
			} else if (char === '>') {
				return i + 1;
			}
		}
		return -1;
	}

	/** { name, closing, attributes } of the tag source "<…>" */
	function parseTag(source) {
		var i = 1;
		var closing = source.charAt(1) === '/';
		if (closing) {
			i++;
		}
		var start = i;
		while (i < source.length && !isSpace(source.charAt(i)) && source.charAt(i) !== '>' && source.charAt(i) !== '/') {
			i++;
		}
		var tag = { name: source.slice(start, i).toLowerCase(), closing: closing, attributes: {} };
		while (i < source.length) {
			while (i < source.length && (isSpace(source.charAt(i)) || source.charAt(i) === '/')) {
				i++;
			}
			if (i >= source.length || source.charAt(i) === '>') {
				break;
			}
			start = i;
			while (i < source.length && !isSpace(source.charAt(i)) && '=>/'.indexOf(source.charAt(i)) < 0) {
				i++;
			}
			var name = source.slice(start, i).toLowerCase();
			var value = '';
			while (i < source.length && isSpace(source.charAt(i))) {
				i++;
			}
			if (source.charAt(i) === '=') {
				i++;
				while (i < source.length && isSpace(source.charAt(i))) {
					i++;
				}
				var quote = source.charAt(i);
				if (quote === '"' || quote === '\'') {
					var close = source.indexOf(quote, i + 1);
					close = close < 0 ? source.length : close;
					value = source.slice(i + 1, close);
					i = close + 1;
				} else {
					start = i;
					while (i < source.length && !isSpace(source.charAt(i)) && source.charAt(i) !== '>') {
						i++;
					}
					value = source.slice(start, i);
				}
			}
			if (name && !tag.attributes.hasOwnProperty(name)) {
				tag.attributes[name] = decodeEntities(value);
			}
		}
		return tag;
	}

	function normalizeText(text) {
		return decodeEntities(text).replace(/\s+/g, ' ').trim();
	}

	/**
	 * Tokens of an HTML string: { type: 'open' | 'close' | 'text', name,
	 * attributes, text }. Comments and the doctype are dropped, whitespace is
	 * collapsed (kept inside <pre>), entities are decoded.
	 */
	function tokenizeHtml(html) {
		html = String(html || '');
		var lower = null; // lower-case copy, made once when a raw text element needs it
		var tokens = [];
		var pre = 0;
		var i = 0;
		var pending = ''; // text is collected until the next tag, so "a < b" stays one text
		function addText(text) {
			pending += text;
		}
		function flushText() {
			var value = pre ? decodeEntities(pending) : normalizeText(pending);
			pending = '';
			if (value) {
				tokens.push({ type: 'text', text: value });
			}
		}
		while (i < html.length) {
			var lt = html.indexOf('<', i);
			if (lt < 0) {
				addText(html.slice(i));
				break;
			}
			if (lt > i) {
				addText(html.slice(i, lt));
			}
			if (html.slice(lt, lt + 4) === '<!--') {
				var commentEnd = html.indexOf('-->', lt + 4);
				i = commentEnd < 0 ? html.length : commentEnd + 3;
				continue;
			}
			var next = html.charAt(lt + 1);
			if (next !== '!' && next !== '?' && next !== '/' && !/[A-Za-z]/.test(next)) {
				addText('<');
				i = lt + 1;
				continue;
			}
			var end = tagEnd(html, lt);
			if (end < 0) {
				addText(html.slice(lt));
				break;
			}
			i = end;
			if (next === '!' || next === '?') {
				continue; // doctype, CDATA, processing instruction
			}
			flushText();
			var tag = parseTag(html.slice(lt, end));
			if (tag.closing) {
				if (VOID_ELEMENTS.indexOf(tag.name) < 0) {
					tokens.push({ type: 'close', name: tag.name });
					if (tag.name === 'pre' && pre) {
						pre--;
					}
				}
				continue;
			}
			tokens.push({ type: 'open', name: tag.name, attributes: tag.attributes });
			if (tag.name === 'pre') {
				pre++;
			}
			if (RAW_TEXT_ELEMENTS.indexOf(tag.name) >= 0) {
				lower = lower || html.toLowerCase();
				var closeAt = lower.indexOf('</' + tag.name, i);
				closeAt = closeAt < 0 ? html.length : closeAt;
				var raw = html.slice(i, closeAt);
				var text = tag.name === 'script' || tag.name === 'style' ? raw.replace(/\r\n?/g, '\n').trim() : normalizeText(raw);
				if (text) {
					tokens.push({ type: 'text', text: text });
				}
				var rawEnd = closeAt < html.length ? tagEnd(html, closeAt) : -1;
				tokens.push({ type: 'close', name: tag.name });
				i = rawEnd < 0 ? html.length : rawEnd;
			}
		}
		flushText();
		return tokens;
	}

	/** a token as text, attributes sorted, class names sorted */
	function tokenText(token) {
		if (token.type === 'text') {
			return token.text;
		}
		if (token.type === 'close') {
			return '</' + token.name + '>';
		}
		var attributes = Object.keys(token.attributes).sort().map(function (name) {
			var value = token.attributes[name];
			if (name === 'class') {
				value = value.split(/\s+/).filter(Boolean).sort().join(' ');
			}
			return value === '' ? name : name + '="' + escapeHtml(value) + '"';
		});
		return '<' + token.name + (attributes.length ? ' ' + attributes.join(' ') : '') + '>';
	}

	/** lang, title, head tokens (without the title) and body tokens of a document or fragment */
	function splitDocument(html) {
		var tokens = tokenizeHtml(html);
		var result = { lang: '', title: null, head: [], body: [] };
		var part = 'body';
		var hasBody = tokens.some(function (token) { return token.type === 'open' && token.name === 'body'; });
		for (var i = 0; i < tokens.length; i++) {
			var token = tokens[i];
			var name = token.name;
			if (token.type === 'open' && name === 'html') {
				result.lang = token.attributes.lang || '';
			} else if (name === 'html') {
				continue;
			} else if (token.type === 'open' && name === 'head') {
				part = 'head';
			} else if (token.type === 'close' && name === 'head') {
				part = hasBody ? 'between' : 'body';
			} else if (token.type === 'open' && name === 'body') {
				part = 'body';
			} else if (token.type === 'close' && name === 'body') {
				part = 'after';
			} else if (token.type === 'open' && name === 'title' && part !== 'body') {
				var text = tokens[i + 1] && tokens[i + 1].type === 'text' ? tokens[i + 1].text : '';
				result.title = text;
				i += text ? 2 : 1;
			} else if (part === 'head' || part === 'body') {
				result[part].push(token);
			}
		}
		return result;
	}

	/** parses "tag", "#id", ".class", "tag#id" or "tag.class" */
	function parseSelector(selector) {
		var match = /^([a-z][a-z0-9-]*)?(?:#([\w-]+)|\.([\w-]+))?$/i.exec(String(selector || '').trim());
		return match && (match[1] || match[2] || match[3]) ? { name: (match[1] || '').toLowerCase(), id: match[2] || '', className: match[3] || '' } : null;
	}

	function matchesSelector(token, selector) {
		if (token.type !== 'open' || (selector.name && token.name !== selector.name)) {
			return false;
		}
		if (selector.id && token.attributes.id !== selector.id) {
			return false;
		}
		return !selector.className || (' ' + (token.attributes['class'] || '').replace(/\s+/g, ' ') + ' ').indexOf(' ' + selector.className + ' ') >= 0;
	}

	/** the tokens inside the first element matching selector, or null */
	function selectTokens(tokens, selector) {
		for (var i = 0; i < tokens.length; i++) {
			if (!matchesSelector(tokens[i], selector)) {
				continue;
			}
			var name = tokens[i].name;
			var depth = 0;
			for (var j = i + 1; j < tokens.length; j++) {
				if (tokens[j].name === name && tokens[j].type === 'open') {
					depth++;
				} else if (tokens[j].name === name && tokens[j].type === 'close') {
					if (!depth) {
						return tokens.slice(i + 1, j);
					}
					depth--;
				}
			}
			return tokens.slice(i + 1);
		}
		return null;
	}

	function shorten(text) {
		return text.length > 120 ? text.slice(0, 117) + '…' : text;
	}

	/** first difference of two token lists, with the path of open elements where it is */
	function firstDifference(part, expected, actual) {
		var path = [];
		var length = Math.max(expected.length, actual.length);
		for (var i = 0; i < length; i++) {
			var a = expected[i] ? tokenText(expected[i]) : null;
			var b = actual[i] ? tokenText(actual[i]) : null;
			if (a !== b) {
				return {
					part: part,
					path: path.join(' > '),
					expected: a === null ? null : shorten(a),
					actual: b === null ? null : shorten(b),
				};
			}
			if (expected[i].type === 'open' && VOID_ELEMENTS.indexOf(expected[i].name) < 0) {
				path.push(expected[i].name);
			} else if (expected[i].type === 'close' && path[path.length - 1] === expected[i].name) {
				path.pop();
			}
		}
		return null;
	}

	/**
	 * Compares two HTML documents (or fragments) by content: whitespace,
	 * line endings, comments, attribute and class order and entity spelling
	 * do not count. options.select ("main", "#id", ".class", "tag#id",
	 * "tag.class") compares only the content of that element of the body.
	 * Returns { same, differences: [{ part: 'lang' | 'title' | 'head' |
	 * 'body', path, expected, actual }] } - one entry per differing part,
	 * with the first difference in it.
	 */
	function compareHtml(expected, actual, options) {
		options = options || {};
		var a = splitDocument(expected);
		var b = splitDocument(actual);
		var differences = [];
		if (a.lang !== b.lang) {
			differences.push({ part: 'lang', path: '', expected: a.lang, actual: b.lang });
		}
		if ((a.title || '') !== (b.title || '')) {
			differences.push({ part: 'title', path: '', expected: a.title, actual: b.title });
		}
		var head = firstDifference('head', a.head, b.head);
		if (head) {
			differences.push(head);
		}
		var bodyA = a.body;
		var bodyB = b.body;
		var selector = options.select ? parseSelector(options.select) : null;
		if (options.select && !selector) {
			throw new Error('markdown-pages-editor: unsupported selector "' + options.select + '"');
		}
		if (selector) {
			// a generated document without that element counts as its content
			bodyA = selectTokens(bodyA, selector) || bodyA;
			bodyB = selectTokens(bodyB, selector);
			if (!bodyB) {
				differences.push({ part: 'body', path: '', expected: options.select, actual: null });
				bodyA = null;
			}
		}
		var body = bodyA && firstDifference('body', bodyA, bodyB);
		if (body) {
			differences.push(body);
		}
		return { same: !differences.length, differences: differences };
	}
	/**
	 * Resolves the options to plain lists: toolbar items (command names and
	 * "|"), commands by name, modes and the start mode. Pure, unit tested.
	 */
	function resolveOptions(options) {
		options = options || {};
		var commands = {};
		Object.keys(COMMANDS).forEach(function (name) {
			commands[name] = COMMANDS[name];
		});
		Object.keys(options.commands || {}).forEach(function (name) {
			var command = options.commands[name];
			if (command && typeof command.run === 'function') {
				commands[name] = command;
			}
		});

		var toolbar = (Array.isArray(options.toolbar) ? options.toolbar : options.toolbar === false ? [] : DEFAULT_TOOLBAR)
			.filter(function (item) {
				return item === '|' || commands.hasOwnProperty(item);
			})
			// no separators at the start, the end or twice in a row
			.reduce(function (list, item) {
				if (item !== '|' || (list.length && list[list.length - 1] !== '|')) {
					list.push(item);
				}
				return list;
			}, []);
		if (toolbar[toolbar.length - 1] === '|') {
			toolbar.pop();
		}

		var preview = typeof options.render === 'function';
		var modes = (Array.isArray(options.modes) ? options.modes : MODES).filter(function (mode, index, list) {
			return MODES.indexOf(mode) >= 0 && list.indexOf(mode) === index && (preview || mode === 'write');
		});
		if (!modes.length) {
			modes = [preview ? 'split' : 'write'];
		}
		var mode = modes.indexOf(options.mode) >= 0 ? options.mode : modes.indexOf('split') >= 0 ? 'split' : modes[0];

		return {
			toolbar: toolbar,
			commands: commands,
			modes: modes,
			mode: mode,
			download: Boolean(options.fileName) && options.download !== false,
			saveHtml: Boolean(options.fileName) && preview && options.saveHtml === true,
			shortcuts: options.shortcuts !== false,
			icons: options.icons !== false,
			helpUrl: options.helpUrl === false ? null : safeHelpUrl(options.helpUrl === undefined ? HELP_URL : options.helpUrl),
		};
	}

	var HELP_URL = 'https://markdownguide.offshoot.io/';

	/** only http(s) and relative URLs, so the link can never run script */
	function safeHelpUrl(url) {
		url = String(url || '').trim();
		return url && /^(https?:\/\/|\/|\.{0,2}\/|\?|#)|^[^:]*$/i.test(url) ? url : null;
	}

	// ---------------------------------------------------------------------
	// Browser part
	// ---------------------------------------------------------------------

	var counter = 0;

	function element(tag, className, attributes) {
		var node = document.createElement(tag);
		if (className) {
			node.className = className;
		}
		Object.keys(attributes || {}).forEach(function (name) {
			node.setAttribute(name, attributes[name]);
		});
		return node;
	}

	function icon(shapes) {
		var ns = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(ns, 'svg');
		var attributes = { viewBox: '0 0 16 16', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', 'class': 'markdown-pages-editor-icon' };
		Object.keys(attributes).forEach(function (name) {
			svg.setAttribute(name, attributes[name]);
		});
		shapes.forEach(function (shape) {
			var node = document.createElementNS(ns, shape[0]);
			Object.keys(shape[1]).forEach(function (name) {
				node.setAttribute(name, shape[1][name]);
			});
			svg.appendChild(node);
		});
		return svg;
	}

	function button(className, text, label) {
		var node = element('button', className, { type: 'button' });
		node.textContent = text;
		if (label && label !== text) {
			node.setAttribute('aria-label', label);
			node.title = label;
		}
		return node;
	}

	/**
	 * Gives every id below root a prefix and rewrites "for" and "#id" links
	 * to match, so preview content never clashes with ids of the page.
	 */
	function prefixIds(root, prefix) {
		root.querySelectorAll('[id]').forEach(function (node) {
			node.id = prefix + node.id;
		});
		root.querySelectorAll('[for]').forEach(function (node) {
			node.setAttribute('for', prefix + node.getAttribute('for'));
		});
		root.querySelectorAll('a[href^="#"]').forEach(function (node) {
			var target = node.getAttribute('href').slice(1);
			if (target) {
				node.setAttribute('href', '#' + prefix + target);
			}
		});
	}

	function storage() {
		try {
			return typeof localStorage !== 'undefined' ? localStorage : null;
		} catch (e) {
			return null; // blocked
		}
	}

	function readDraft(key) {
		try {
			return key && storage() ? storage().getItem(key) : null;
		} catch (e) {
			return null;
		}
	}

	function writeDraft(key, value) {
		try {
			if (key && storage()) {
				if (value === null) {
					storage().removeItem(key);
				} else {
					storage().setItem(key, value);
				}
			}
		} catch (e) {
			// storage full or blocked - the text stays in the editor
		}
	}

	/**
	 * Creates an editor.
	 *
	 * @param {Element} target a <textarea> to enhance (it keeps its name, so it
	 *   still works in forms) or a container the editor is appended to
	 * @param {object} [options] see README
	 */
	function markdownPagesEditor(target, options) {
		options = options || {};
		var config = resolveOptions(options);
		var labels = {};
		Object.keys(LABELS).forEach(function (key) {
			labels[key] = LABELS[key];
		});
		Object.keys(config.commands).forEach(function (name) {
			labels[name] = config.commands[name].label || labels[name] || name;
		});
		Object.keys(options.labels || {}).forEach(function (key) {
			labels[key] = options.labels[key];
		});
		var id = 'markdown-pages-editor-' + (++counter);

		var isTextarea = target.tagName === 'TEXTAREA';
		var root = element('div', 'markdown-pages-editor');
		var input = isTextarea ? target : element('textarea', '', { 'aria-label': labels.input });
		if (isTextarea) {
			target.parentNode.insertBefore(root, target);
		} else {
			target.appendChild(root);
		}
		input.classList.add('markdown-pages-editor-input');
		input.id = input.id || id + '-input';

		var toolbar = element('div', 'markdown-pages-editor-toolbar', { role: 'toolbar', 'aria-label': labels.toolbar, 'aria-controls': input.id });
		var format = element('div', 'markdown-pages-editor-format');
		config.toolbar.forEach(function (name) {
			if (name === '|') {
				format.appendChild(element('span', 'markdown-pages-editor-separator', { 'aria-hidden': 'true' }));
				return;
			}
			var command = config.commands[name];
			var withIcon = config.icons && Array.isArray(command.icon);
			var node = button('markdown-pages-editor-button markdown-pages-editor-' + name, withIcon ? '' : command.text || labels[name], labels[name]);
			if (withIcon) {
				node.appendChild(icon(command.icon));
			}
			node.setAttribute('data-command', name);
			format.appendChild(node);
		});
		if (config.toolbar.length) {
			toolbar.appendChild(format);
		}
		if (config.helpUrl) {
			var help = element('a', 'markdown-pages-editor-help', { href: config.helpUrl, target: '_blank', rel: 'noopener noreferrer', title: labels.help, 'aria-label': labels.help });
			if (config.icons) {
				help.appendChild(icon(ICONS.help));
			} else {
				help.textContent = labels.help;
			}
			toolbar.appendChild(help);
		}

		var modeButtons = {};
		if (config.modes.length > 1) {
			var switcher = element('div', 'markdown-pages-editor-modes');
			config.modes.forEach(function (name) {
				var node;
				if (config.icons) {
					node = button('markdown-pages-editor-mode', '', labels[name]);
					node.appendChild(icon(ICONS[name]));
				} else {
					node = button('markdown-pages-editor-mode', labels[name]);
				}
				node.setAttribute('data-mode', name);
				modeButtons[name] = node;
				switcher.appendChild(node);
			});
			toolbar.appendChild(switcher);
		}
		// one format: a plain button; two: a menu button with a ▾ arrow
		var formats = [];
		if (config.download) {
			formats.push('markdown');
		}
		if (config.saveHtml) {
			formats.push('html');
		}
		var downloadButton = null;
		var downloadGroup = null;
		var downloadMenu = null;
		if (formats.length === 1) {
			downloadButton = button('markdown-pages-editor-download', labels.download);
			downloadButton.setAttribute('data-format', formats[0]);
			toolbar.appendChild(downloadButton);
		} else if (formats.length > 1) {
			downloadGroup = element('div', 'markdown-pages-editor-download-group');
			downloadButton = button('markdown-pages-editor-download', labels.download);
			downloadButton.appendChild(element('span', 'markdown-pages-editor-arrow', { 'aria-hidden': 'true' })).textContent = '▾';
			downloadButton.setAttribute('aria-haspopup', 'menu');
			downloadButton.setAttribute('aria-expanded', 'false');
			downloadButton.setAttribute('aria-controls', id + '-download-menu');
			downloadMenu = element('div', 'markdown-pages-editor-download-menu', { role: 'menu', id: id + '-download-menu', 'aria-label': labels.download });
			downloadMenu.hidden = true;
			formats.forEach(function (format) {
				var item = button('markdown-pages-editor-download-item', labels[format === 'html' ? 'downloadHtml' : 'downloadMarkdown']);
				item.setAttribute('role', 'menuitem');
				item.setAttribute('tabindex', '-1');
				item.setAttribute('data-format', format);
				downloadMenu.appendChild(item);
			});
			downloadGroup.appendChild(downloadButton);
			downloadGroup.appendChild(downloadMenu);
			toolbar.appendChild(downloadGroup);
		}

		var panes = element('div', 'markdown-pages-editor-panes');
		var preview = element('div', 'markdown-pages-editor-preview', { role: 'region', 'aria-label': labels.preview, 'aria-live': 'polite' });
		if (toolbar.childNodes.length) {
			root.appendChild(toolbar);
		}
		panes.appendChild(input);
		panes.appendChild(preview);
		root.appendChild(panes);

		var initial = options.value !== undefined ? String(options.value) : input.value;
		var draft = readDraft(options.storageKey);
		input.value = draft !== null ? draft : initial;
		var saved = initial;
		var timer = null;
		var mode = null;
		var renderCount = 0;
		var shortcuts = {};
		Object.keys(config.commands).forEach(function (name) {
			var key = config.commands[name].shortcut;
			if (key && (config.toolbar.indexOf(name) >= 0 || (options.commands && options.commands[name]))) {
				shortcuts[String(key).toLowerCase()] = name;
			}
		});

		var api = {
			element: root,
			textarea: input,
			preview: preview,
			getValue: function () { return input.value; },
			setValue: function (value) {
				input.value = String(value);
				changed();
			},
			/** marks the current text as saved: isDirty() is false again and the draft is removed */
			markSaved: function () {
				saved = input.value;
				writeDraft(options.storageKey, null);
			},
			isDirty: function () { return input.value !== saved; },
			setMode: setMode,
			getMode: function () { return mode; },
			render: renderPreview,
			exec: exec,
			download: download,
			getHtml: getHtml,
			saveHtml: saveHtml,
			checkHtml: checkHtml,
			focus: function () { input.focus(); },
			destroy: destroy,
		};

		function changed() {
			writeDraft(options.storageKey, input.value !== saved ? input.value : null);
			if (typeof options.onChange === 'function') {
				options.onChange(input.value, api);
			}
			schedule();
		}

		function schedule() {
			if (mode === 'write') {
				return;
			}
			clearTimeout(timer);
			timer = setTimeout(renderPreview, options.delay !== undefined ? options.delay : 200);
		}

		function renderPreview() {
			clearTimeout(timer);
			if (typeof options.render !== 'function') {
				return Promise.resolve();
			}
			var current = ++renderCount;
			var markdown = input.value;
			return Promise.resolve().then(function () {
				return markdown.trim() ? options.render(markdown, preview) : null;
			}).then(function (html) {
				if (current !== renderCount) {
					return false; // a newer render has started
				}
				if (!markdown.trim()) {
					preview.innerHTML = '';
					var hint = element('p', 'markdown-pages-editor-empty');
					hint.textContent = labels.empty;
					preview.appendChild(hint);
				} else if (typeof html === 'string') {
					// the render function is responsible for sanitizing
					preview.innerHTML = html;
				}
				return typeof options.afterRender === 'function' ? options.afterRender(preview, api) : null;
			}).then(function (result) {
				if (result === false || current !== renderCount) {
					return;
				}
				if (options.prefixIds !== false) {
					prefixIds(preview, id + '-');
				}
				preview.dispatchEvent(new CustomEvent('markdown-pages-editor:preview', { bubbles: true, detail: { editor: api } }));
			}).catch(function (error) {
				console.error('markdown-pages-editor:', error);
			});
		}

		function setMode(next) {
			if (config.modes.indexOf(next) < 0 || next === mode) {
				return;
			}
			mode = next;
			root.setAttribute('data-mode', mode);
			Object.keys(modeButtons).forEach(function (name) {
				modeButtons[name].setAttribute('aria-pressed', name === mode ? 'true' : 'false');
			});
			input.hidden = mode === 'preview';
			preview.hidden = mode === 'write';
			format.querySelectorAll('button').forEach(function (node) {
				node.disabled = mode === 'preview';
			});
			if (mode !== 'write') {
				renderPreview();
			}
		}

		function exec(name) {
			var command = config.commands[name];
			if (!command || input.disabled || input.readOnly) {
				return;
			}
			var edit = command.run({ value: input.value, start: input.selectionStart, end: input.selectionEnd });
			if (!edit) {
				return;
			}
			input.focus();
			input.setSelectionRange(edit.from, edit.to);
			// execCommand keeps the undo history; setRangeText is the fallback
			var done = false;
			try {
				done = edit.text
					? document.execCommand('insertText', false, edit.text)
					: (edit.from === edit.to || document.execCommand('delete'));
			} catch (e) {
				done = false;
			}
			if (!done || input.value.slice(edit.from, edit.from + edit.text.length) !== edit.text) {
				input.setRangeText(edit.text, edit.from, edit.to, 'end');
				changed();
			}
			input.setSelectionRange(edit.start, edit.end);
		}

		function saveFile(content, type, fileName) {
			var blob = new Blob([content], { type: type + ';charset=utf-8' });
			var url = URL.createObjectURL(blob);
			var anchor = element('a', '', { href: url, download: fileName });
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
		}

		function download(name) {
			saveFile(input.value, 'text/markdown', safeFileName(name || options.fileName));
		}

		/**
		 * The text as a complete HTML document, rendered with the render
		 * function into a detached element (afterRender and prefixIds do not
		 * apply, so ids and links stay as written).
		 */
		function getHtml(name) {
			if (typeof options.render !== 'function') {
				return Promise.reject(new Error('markdown-pages-editor: saving HTML needs a render function'));
			}
			var markdown = input.value;
			var container = element('div');
			return Promise.resolve().then(function () {
				return options.render(markdown, container);
			}).then(function (html) {
				var fileName = safeFileName(name || options.fileName, 'html');
				var head = typeof options.htmlHead === 'function' ? options.htmlHead(markdown, api) : options.htmlHead;
				return htmlDocument(typeof html === 'string' ? html : container.innerHTML, {
					title: documentTitle(markdown) || fileName.replace(/\.html?$/i, ''),
					lang: options.htmlLang !== undefined ? options.htmlLang : document.documentElement.lang,
					head: head,
				});
			});
		}

		function saveHtml(name) {
			return getHtml(name).then(function (html) {
				saveFile(html, 'text/html', safeFileName(name || options.fileName, 'html'));
			});
		}

		/**
		 * Compares an HTML file with what getHtml() gives for the current text.
		 * checkOptions: fileName (for the title fallback), select (compare only
		 * that element, e.g. "main"), expected (function (html) wrapping or
		 * replacing the generated document, e.g. a site layout).
		 */
		function checkHtml(html, checkOptions) {
			checkOptions = checkOptions || {};
			return getHtml(checkOptions.fileName).then(function (generated) {
				return typeof checkOptions.expected === 'function' ? checkOptions.expected(generated, input.value) : generated;
			}).then(function (expected) {
				return compareHtml(expected, html, { select: checkOptions.select });
			});
		}

		function onToolbarClick(event) {
			var node = event.target.closest('button');
			if (!node || node.disabled) {
				return;
			}
			if (node.hasAttribute('data-command')) {
				exec(node.getAttribute('data-command'));
			} else if (node.hasAttribute('data-mode')) {
				setMode(node.getAttribute('data-mode'));
			} else if (node === downloadButton && downloadMenu) {
				toggleMenu(downloadMenu.hidden);
			} else if (node.hasAttribute('data-format')) {
				if (downloadMenu) {
					toggleMenu(false, true);
				}
				if (node.getAttribute('data-format') === 'html') {
					saveHtml().catch(function (error) {
						console.error('markdown-pages-editor:', error);
					});
				} else {
					download();
				}
			}
		}

		function menuItems() {
			return Array.prototype.slice.call(downloadMenu.querySelectorAll('[role="menuitem"]'));
		}

		/** opens or closes the download menu; focusItem: index of the item to focus, true: focus the button */
		function toggleMenu(open, focusItem) {
			downloadMenu.hidden = !open;
			downloadButton.setAttribute('aria-expanded', open ? 'true' : 'false');
			if (open) {
				document.addEventListener('click', onDocumentClick, true);
				menuItems()[typeof focusItem === 'number' ? focusItem : 0].focus();
			} else {
				document.removeEventListener('click', onDocumentClick, true);
				if (focusItem === true) {
					downloadButton.focus();
				}
			}
		}

		function onDocumentClick(event) {
			if (!downloadGroup.contains(event.target)) {
				toggleMenu(false);
			}
		}

		function onMenuKeyDown(event) {
			var items = menuItems();
			var index = items.indexOf(document.activeElement);
			if (event.target === downloadButton) {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault();
					toggleMenu(true, event.key === 'ArrowUp' ? items.length - 1 : 0);
				} else if (event.key === 'Escape' && !downloadMenu.hidden) {
					event.preventDefault();
					toggleMenu(false, true);
				}
				return;
			}
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
			} else if (event.key === 'Home' || event.key === 'End') {
				event.preventDefault();
				items[event.key === 'Home' ? 0 : items.length - 1].focus();
			} else if (event.key === 'Escape') {
				event.preventDefault();
				toggleMenu(false, true);
			} else if (event.key === 'Tab') {
				toggleMenu(false);
			}
		}

		function onKeyDown(event) {
			if (config.shortcuts && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
				var name = shortcuts[String(event.key).toLowerCase()];
				if (name) {
					event.preventDefault();
					exec(name);
				}
			}
		}

		// the preview is only a view: links do not navigate away from unsaved
		// text, forms are not submitted and do not reach the page's handlers
		function onPreviewClick(event) {
			var anchor = event.target.closest('a[href]');
			if (anchor && anchor.getAttribute('href').charAt(0) !== '#') {
				event.preventDefault();
			}
		}

		function onPreviewSubmit(event) {
			event.preventDefault();
			event.stopPropagation();
		}

		toolbar.addEventListener('click', onToolbarClick);
		input.addEventListener('input', changed);
		input.addEventListener('keydown', onKeyDown);
		preview.addEventListener('click', onPreviewClick);
		preview.addEventListener('submit', onPreviewSubmit);
		if (downloadGroup) {
			downloadGroup.addEventListener('keydown', onMenuKeyDown);
		}

		function destroy() {
			clearTimeout(timer);
			renderCount++;
			document.removeEventListener('click', onDocumentClick, true);
			input.removeEventListener('input', changed);
			input.removeEventListener('keydown', onKeyDown);
			if (isTextarea) {
				input.classList.remove('markdown-pages-editor-input');
				input.hidden = false;
				root.parentNode.insertBefore(input, root);
			}
			root.remove();
		}

		setMode(config.mode);
		return api;
	}

	markdownPagesEditor.commands = COMMANDS;
	markdownPagesEditor.labels = LABELS;
	markdownPagesEditor.icons = ICONS;
	markdownPagesEditor.defaultToolbar = DEFAULT_TOOLBAR;
	markdownPagesEditor.resolveOptions = resolveOptions;
	markdownPagesEditor.applyEdit = applyEdit;
	markdownPagesEditor.safeFileName = safeFileName;
	markdownPagesEditor.prefixIds = prefixIds;
	markdownPagesEditor.documentTitle = documentTitle;
	markdownPagesEditor.htmlDocument = htmlDocument;
	markdownPagesEditor.compareHtml = compareHtml;
	markdownPagesEditor.helpers = { wrap: wrap, prefixLines: prefixLines, editLines: editLines };
	markdownPagesEditor.default = markdownPagesEditor;

	return markdownPagesEditor;
});
