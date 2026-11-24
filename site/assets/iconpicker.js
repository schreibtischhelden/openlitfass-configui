/* openLitfass config: icon picker for the icon fields. Searches the outline
   icons of Tabler Icons (assets/icons/tabler-outline.json, built by
   scripts/build-icon-index.mjs) by name and tags. The tags are English;
   German words of the category or type name are translated with the list
   below. The index is only loaded when the picker is opened. */
(function () {
	'use strict';

	const INDEX_URL = 'assets/icons/tabler-outline.json';
	const PAGE_SIZE = 48;

	/* German word (or the start of a compound, without umlauts) -> English
	   search terms; the terms are matched against icon names and tags */
	const SYNONYMS = {
		kultur: ['palette', 'masks-theater', 'building-arch'],
		kino: ['movie', 'video', 'device-tv'], film: ['movie', 'video'],
		theater: ['masks-theater'], buehne: ['masks-theater', 'microphone-2'], schauspiel: ['masks-theater'],
		oper: ['music', 'masks-theater'], kabarett: ['masks-theater', 'mood-happy'], comedy: ['mood-happy'], zirkus: ['tent', 'balloon'],
		musik: ['music', 'guitar', 'microphone'], konzert: ['music', 'microphone-2', 'guitar'], chor: ['music', 'microphone'],
		lied: ['music'], singen: ['microphone', 'music'], band: ['guitar', 'music'], jazz: ['music'], disco: ['disc', 'music'],
		kunst: ['palette', 'brush', 'artboard'], ausstellung: ['photo', 'building-museum', 'palette'], galerie: ['photo', 'palette'],
		malen: ['brush', 'palette'], malerei: ['brush', 'palette'], zeichnen: ['pencil', 'brush'], foto: ['camera', 'photo'],
		museum: ['building-museum'], denkmal: ['building-monument'], geschichte: ['history', 'building-monument'], gedenk: ['building-monument', 'flower'],
		sport: ['ball-football', 'run', 'barbell'], fitness: ['barbell', 'stretching'], bewegung: ['run', 'stretching', 'walk'],
		fussball: ['ball-football'], basketball: ['ball-basketball'], volleyball: ['ball-volleyball'], tennis: ['ball-tennis'],
		schwimm: ['swimming'], bad: ['swimming'], yoga: ['yoga'], tanz: ['music', 'shoe'], lauf: ['run'], rad: ['bike'], fahrrad: ['bike'],
		wander: ['trekking', 'walk', 'mountain'], spaziergang: ['walk'], klettern: ['mountain'], schach: ['chess'],
		kulinarik: ['tools-kitchen-2', 'chef-hat', 'salad'], essen: ['tools-kitchen-2', 'salad'], kochen: ['chef-hat', 'cooker'],
		backen: ['cake', 'bread'], kuchen: ['cake'], restaurant: ['tools-kitchen-2'], cafe: ['coffee'], kaffee: ['coffee'],
		bier: ['beer'], wein: ['glass'], fruehstueck: ['coffee', 'egg-fried'], grill: ['grill'],
		natur: ['tree', 'leaf', 'plant'], garten: ['plant', 'shovel', 'flower'], park: ['trees', 'tree'], baum: ['tree'], wald: ['trees'],
		pflanze: ['plant'], blume: ['flower'], tier: ['paw'], zoo: ['paw'], hund: ['dog'], katze: ['cat'], vogel: ['feather'], pferd: ['horse'],
		umwelt: ['leaf', 'recycle', 'world'], klima: ['temperature', 'world'], nachhaltig: ['recycle', 'leaf'],
		wasser: ['droplet'], see: ['ripple', 'swimming'], strand: ['beach'], spielplatz: ['horse-toy', 'swing'], outdoor: ['tent', 'trees'],
		markt: ['shopping-cart', 'shopping-bag', 'building-store', 'basket'], flohmarkt: ['shopping-bag', 'building-store'], basar: ['building-store'],
		troedel: ['shopping-bag'], einkauf: ['shopping-cart'], laden: ['building-store'], mode: ['shirt'], kleidung: ['shirt'],
		beratung: ['messages', 'message-circle', 'help', 'users'], hilfe: ['help', 'lifebuoy'], sprechstunde: ['message-circle', 'clock'],
		sozial: ['heart-handshake', 'users'], ehrenamt: ['heart-handshake'], spende: ['heart-handshake', 'coin'],
		gesundheit: ['heart', 'stethoscope', 'first-aid-kit'], medizin: ['stethoscope', 'pill'], arzt: ['stethoscope'], pflege: ['heart'],
		kind: ['mood-kid', 'horse-toy', 'baby-carriage'], kinder: ['mood-kid', 'horse-toy', 'baby-carriage'], baby: ['baby-carriage', 'baby-bottle'],
		familie: ['friends', 'users-group', 'home-heart'], kita: ['horse-toy', 'mood-kid'], jugend: ['school', 'skateboard'], senioren: ['old'],
		buch: ['book', 'books'], buecher: ['books'], bibliothek: ['books', 'building'], literatur: ['book'], lesung: ['book', 'microphone'],
		vortrag: ['presentation', 'microphone'], seminar: ['presentation', 'school'], workshop: ['tool', 'users'], kurs: ['school', 'chalkboard'],
		bildung: ['school'], schule: ['school'], lernen: ['school', 'book'], sprache: ['language'], diskussion: ['messages'],
		kirche: ['building-church'], gottesdienst: ['building-church'], religion: ['building-church'], moschee: ['building-mosque'],
		fest: ['confetti', 'balloon'], feier: ['confetti', 'glass-full'], party: ['confetti', 'balloon'], festival: ['confetti', 'tent'],
		weihnacht: ['christmas-tree'], advent: ['christmas-tree', 'candle'], ostern: ['egg'], halloween: ['pumpkin-scary'], silvester: ['fireworks'],
		politik: ['speakerphone', 'building-bank'], demo: ['speakerphone'], versammlung: ['users-group'], wahl: ['checkbox'],
		nachbarschaft: ['users-group', 'home'], kiez: ['building-community', 'map-pin'], treff: ['users-group', 'coffee'], begegnung: ['users-group'],
		verein: ['users'], gemeinschaft: ['users-group'], digital: ['device-laptop'], computer: ['device-laptop'], technik: ['cpu', 'settings'],
		spiel: ['puzzle', 'dice'], spiele: ['puzzle', 'dice'], handwerk: ['hammer', 'tool'], basteln: ['scissors', 'tool'], reparatur: ['tool'],
		sonstig: ['dots', 'tag'], allgemein: ['tag'], unkategorisiert: ['tag', 'category'], kategorie: ['category'],
		ort: ['map-pin'], orte: ['map-pin'], platz: ['map-pin'], gebaeude: ['building'], haus: ['home'], stadtteilzentrum: ['building-community'],
		bauernhof: ['tractor', 'pig', 'horse'], bahnhof: ['train'], bus: ['bus'], parkplatz: ['parking'], friedhof: ['grave'], schloss: ['building-castle'], bruecke: ['building-bridge'],
		radio: ['radio'], podcast: ['microphone'], zeitung: ['news'], kalender: ['calendar'], termin: ['calendar-event'],
	};

	function fold(text) {
		return String(text || '').toLowerCase()
			.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
			.normalize('NFD').replace(/[̀-ͯ]/g, '');
	}

	/* search terms for a text: its words, plus the English terms of every
	   German word that is the word itself or the start or end of a compound */
	function terms(text) {
		const words = fold(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
		const out = [];
		const add = (t) => { if (out.indexOf(t) < 0) out.push(t); };
		words.forEach((word) => {
			// a word in the list is not split further (Spielplatz, not Spiel + Platz)
			if (SYNONYMS[word]) {
				SYNONYMS[word].forEach(add);
				return;
			}
			Object.keys(SYNONYMS).forEach((key) => {
				const hit = word === key || (key.length >= 4 && (word.indexOf(key) === 0 || word.slice(-key.length) === key));
				if (hit) SYNONYMS[key].forEach(add);
			});
		});
		words.forEach(add);
		return out;
	}

	let index = null;
	function loadIndex() {
		if (!index) {
			index = fetch(INDEX_URL).then((response) => {
				if (!response.ok) throw new Error('HTTP ' + response.status);
				return response.json();
			}).then((data) => data.icons.map(([name, tags, paths]) => ({ name: name, tags: ' ' + tags + ' ', parts: name.split('-'), paths: paths })))
				.catch((e) => { index = null; throw e; });
		}
		return index;
	}

	function search(icons, list) {
		const scored = [];
		icons.forEach((icon) => {
			let score = 0;
			list.forEach((term, i) => {
				const weight = list.length - i;
				// the named icons first, then icons tagged with the word, then
				// variants such as shopping-cart-x
				if (icon.name === term) score += 1000 + weight;
				else if (icon.tags.indexOf(' ' + term + ' ') >= 0) score += 10 * weight;
				else if (icon.parts.indexOf(term) >= 0) score += 8 * weight;
				else if (icon.name.indexOf(term + '-') === 0) score += 3 * weight;
				else if (term.length >= 4 && (icon.name.indexOf(term) >= 0 || icon.tags.indexOf(term) >= 0)) score += 1;
			});
			if (score) scored.push({ icon: icon, score: score });
		});
		scored.sort((a, b) => b.score - a.score || a.icon.name.length - b.icon.name.length || (a.icon.name < b.icon.name ? -1 : 1));
		return scored.map((s) => s.icon);
	}

	function svgOf(paths) {
		const ns = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('class', 'cfg-icon');
		svg.setAttribute('aria-hidden', 'true');
		paths.forEach((d) => {
			const path = document.createElementNS(ns, 'path');
			path.setAttribute('d', d);
			svg.appendChild(path);
		});
		return svg;
	}

	/* opens the picker below anchor; onPick(paths, name) */
	function open(anchor, initial, onPick) {
		const existing = anchor.parentNode.querySelector('.cfg-picker');
		if (existing) {
			existing.remove();
			return;
		}
		const panel = document.createElement('div');
		panel.className = 'cfg-picker';
		panel.setAttribute('role', 'group');
		panel.setAttribute('aria-label', 'Icon picker');
		const input = document.createElement('input');
		input.type = 'search';
		input.placeholder = 'Search, e.g. Musik, Markt, tree';
		input.setAttribute('aria-label', 'Search icons');
		input.value = initial || '';
		const info = document.createElement('p');
		info.className = 'cfg-picker-info';
		info.setAttribute('role', 'status');
		const grid = document.createElement('div');
		grid.className = 'cfg-picker-grid';
		const more = document.createElement('button');
		more.type = 'button';
		more.className = 'cfg-button';
		more.textContent = 'Show more';
		more.hidden = true;
		const close = document.createElement('button');
		close.type = 'button';
		close.className = 'cfg-link';
		close.textContent = 'Close';
		close.addEventListener('click', () => panel.remove());
		const credit = document.createElement('p');
		credit.className = 'cfg-picker-info';
		credit.appendChild(document.createTextNode('Outline icons of '));
		const link = document.createElement('a');
		link.href = 'https://github.com/tabler/tabler-icons';
		link.target = '_blank';
		link.rel = 'noopener';
		link.textContent = 'Tabler Icons';
		credit.appendChild(link);
		credit.appendChild(document.createTextNode(' (MIT Licence), without brand logos. '));
		credit.appendChild(close);
		panel.append(input, info, grid, more, credit);
		anchor.insertAdjacentElement('afterend', panel);

		let results = [];
		let shown = 0;
		let icons = null;

		function show(count) {
			results.slice(shown, shown + count).forEach((icon) => {
				const choice = document.createElement('button');
				choice.type = 'button';
				choice.className = 'cfg-picker-icon';
				choice.title = icon.name;
				choice.setAttribute('aria-label', icon.name);
				choice.appendChild(svgOf(icon.paths));
				const label = document.createElement('span');
				label.textContent = icon.name;
				choice.appendChild(label);
				choice.addEventListener('click', () => {
					onPick(icon.paths, icon.name);
					panel.remove();
				});
				grid.appendChild(choice);
			});
			shown = Math.min(results.length, shown + count);
			more.hidden = shown >= results.length;
		}

		function run() {
			if (!icons) return;
			grid.textContent = '';
			shown = 0;
			const list = terms(input.value);
			results = list.length ? search(icons, list) : [];
			info.textContent = !list.length ? 'Type a word to search ' + icons.length + ' icons.'
				: results.length ? results.length + (results.length === 1 ? ' icon' : ' icons') + ' for ' + list.slice(0, 6).join(', ') + (list.length > 6 ? ', …' : '') + '.'
					: 'No icon found. Try an English word, e.g. music, market, tree.';
			show(PAGE_SIZE);
		}

		let timer = null;
		input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 150); });
		input.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); if (event.key === 'Escape') panel.remove(); });
		more.addEventListener('click', () => show(PAGE_SIZE));
		info.textContent = 'Loading the icons…';
		loadIndex().then((list) => {
			icons = list;
			run();
		}, (e) => { info.textContent = 'The icons could not be loaded (' + e.message + ').'; });
		input.focus();
	}

	window.OLIconPicker = { open: open, terms: terms };
})();
