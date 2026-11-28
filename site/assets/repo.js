/* openLitfass config: load an instance's configuration from a public git
   repository. Every hosting API is a plugin in assets/hosts/<type>.js,
   loaded only when it is used; a preset is a plugin plus a server. The
   plugins list the repository and read files with plain GET requests, so
   the host has to allow cross-origin reads (CORS); whether it does is up to
   its operator. Nothing is sent to the host except these requests.
   A plugin registers { example, parse(parts), refs(repo, http), list(repo,
   http) }: parse splits the path of an address into the project and the
   rest after the branch marker (tree/, -/tree/, src/branch/), refs
   names the branches or tags the rest may start with (null: no lookup),
   list gives the files of repo.dir on repo.ref as [{ path, read }]:
	   those directly in it and those in repo.folders (e.g. site). */
(function () {
	'use strict';

	/* fixed presets name their server; the others take it from the URL */
	const PRESETS = [
		{ id: 'github', label: 'GitHub', type: 'github', server: 'https://github.com' },
		{ id: 'codeberg', label: 'Codeberg', type: 'forgejo', server: 'https://codeberg.org' },
		{ id: 'gitlab', label: 'GitLab', type: 'gitlab' },
		{ id: 'forgejo', label: 'Forgejo / Gitea', type: 'forgejo' },
	];
	const WANTED = /^(?:(?:instance|categories|places|holidays)\.json|(?:sources|inbox)\/[^/]+\.json|site\/[^/]+\.(?:md|html)|site\/custom-script\.js)$/i;
	const FOLDERS = ['sources', 'inbox', 'site'];
	const SEGMENT = /^[A-Za-z0-9_.-]+$/;
	const PARALLEL = 6;

	const plugins = {};
	const loading = {};

	function register(type, plugin) {
		plugins[type] = plugin;
	}

	function loadPlugin(type) {
		if (plugins[type]) return Promise.resolve(plugins[type]);
		if (!loading[type]) {
			loading[type] = new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src = 'assets/hosts/' + type + '.js';
				script.onload = () => (plugins[type] ? resolve(plugins[type]) : reject(new Error('The ' + type + ' support did not load.')));
				script.onerror = () => { loading[type] = null; reject(new Error('The ' + type + ' support did not load.')); };
				document.head.appendChild(script);
			});
		}
		return loading[type];
	}

	function preset(id) {
		return PRESETS.find((p) => p.id === id) || null;
	}

	function presetForHost(origin) {
		return PRESETS.find((p) => p.server === origin) || null;
	}

	function encodePath(path) {
		return path.split('/').map(encodeURIComponent).join('/');
	}

	async function request(url, what) {
		const host = new URL(url).host;
		let res;
		try {
			res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
		} catch (e) {
			throw new Error(host + ' did not answer, or it does not allow this page to read from it (CORS). Allowing that is up to the operator of the server; until then, load the files as a ZIP.');
		}
		if (res.ok) return res;
		if (res.status === 404 || res.status === 401) {
			throw new Error('Not found on ' + host + ': ' + what + '. Check the address and the branch; private repositories cannot be loaded.');
		}
		if ((res.status === 403 || res.status === 429) && host === 'api.github.com') {
			throw new Error('GitHub allows 60 requests per hour without signing in, and they are used up. Try again later.');
		}
		throw new Error(host + ' answered ' + res.status + ' for ' + what + '.');
	}

	const http = {
		json: async (url, what) => {
			const res = await request(url, what);
			try {
				return await res.json();
			} catch (e) {
				throw new Error(new URL(url).host + ' did not send JSON for ' + what + '. Is this the right kind of server?');
			}
		},
		text: async (url, what) => (await request(url, what)).text(),
		encodePath: encodePath,
	};

	/* { preset, url } → { plugin, server, project, ref, dir, url } or throws */
	function resolve(presetId, input) {
		let chosen = preset(presetId);
		let raw = String(input || '').trim();
		if (!raw) throw new Error('Enter the address of the repository.');
		if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
			if (!chosen || !chosen.server) throw new Error('Enter the full address of the repository, starting with https://.');
			raw = chosen.server + '/' + raw.replace(/^\/+/, '');
		}
		let url;
		try {
			url = new URL(raw);
		} catch (e) {
			throw new Error('That is not a valid address.');
		}
		if (url.protocol !== 'https:') throw new Error('Only https:// addresses can be loaded.');
		const fixed = presetForHost(url.origin);
		if (fixed) chosen = fixed;
		else if (!chosen || chosen.server) throw new Error(url.host + ' is not ' + (chosen ? chosen.label : 'a known host') + '. For another server, choose GitLab or Forgejo / Gitea.');
		const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent);
		return { preset: chosen, server: url.origin, parts: parts, url: url.origin + url.pathname.replace(/\/+$/, '') };
	}

	async function pool(items, work) {
		const results = new Array(items.length);
		let next = 0;
		async function worker() {
			while (next < items.length) {
				const index = next++;
				results[index] = await work(items[index]);
			}
		}
		await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
		return results;
	}

	function startsWith(parts, name) {
		const head = name.split('/');
		return head.length <= parts.length && head.every((s, i) => s === parts[i]);
	}

	/* Which branch and folder an address means. After …/tree/ the branch and
	   the folder are not told apart (feat/x/instance), so the branches and
	   tags are looked up, as the hosts' own web pages do: the longest name
	   the rest starts with is the branch. A branch given in its own field
	   wins; the folder stays the one the address names.
	   → { preset, plugin, repo: { server, project, ref, dir }, url, guessed } */
	async function analyse(presetId, input, branch) {
		const target = resolve(presetId, input);
		const plugin = await loadPlugin(target.preset.type);
		const repo = plugin.parse(target.parts);
		if (!repo || !repo.project.split('/').every((s) => SEGMENT.test(s))) {
			throw new Error('That address does not point to a repository. Example: ' + plugin.example.replace('{server}', target.preset.server || 'https://git.example.org'));
		}
		repo.server = target.server;
		const rest = repo.rest || [];
		const given = String(branch || '').trim();
		let inAddress = given && startsWith(rest, given) ? given : '';
		let guessed = false;
		if (!inAddress && rest.length > 1) {
			const names = await plugin.refs(repo, http);
			if (names) {
				inAddress = names.filter((name) => startsWith(rest, name)).sort((a, b) => b.length - a.length)[0] || '';
				guessed = !inAddress && !given;
			}
		}
		if (!inAddress && rest.length) inAddress = rest[0];
		repo.ref = given || inAddress;
		repo.dir = inAddress ? rest.slice(inAddress.split('/').length).join('/') : '';
		return { preset: target.preset, plugin: plugin, repo: repo, url: target.url, guessed: guessed };
	}

	/* → { entries: [{ path, read }], origin: { preset, url, ref, label } }
	   with every wanted file already read, so that a failure leaves the
	   loaded instance alone */
	async function load(presetId, input, branch) {
		const target = await analyse(presetId, input, branch);
		const plugin = target.plugin;
		const repo = target.repo;
		repo.folders = FOLDERS;
		const files = (await plugin.list(repo, http)).filter((f) => WANTED.test(f.path));
		if (!files.length) {
			throw new Error('No configuration files in ' + describe(target) + '. The repository (or the folder in the address) has to hold instance.json, sources/, inbox/ or site/.');
		}
		const texts = await pool(files, (f) => f.read());
		return {
			entries: files.map((f, i) => ({ path: f.path, read: () => Promise.resolve(texts[i]) })),
			origin: { preset: target.preset.id, url: target.url, ref: repo.ref, label: describe(target) },
		};
	}

	function describe(target) {
		const repo = target.repo;
		return new URL(repo.server).host + '/' + repo.project
			+ ', ' + (repo.ref ? 'branch ' + repo.ref : 'the default branch')
			+ (repo.dir ? ', folder ' + repo.dir : '');
	}

	window.OLRepo = {
		presets: () => PRESETS.slice(),
		preset: preset,
		register: register,
		analyse: analyse,
		describe: describe,
		load: load,
	};
})();
