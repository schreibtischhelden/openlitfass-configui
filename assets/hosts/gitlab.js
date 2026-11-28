/* openLitfass config: GitLab plugin for assets/repo.js (gitlab.com or a
   server of its own). Lists the instance folder and the folders the
   config UI reads (repo.folders: sources/, inbox/, site/) through
   the repository tree API and reads the files through the API.
   Addresses: <server>/<group>[/<subgroup>…]/<project>[/-/tree/<branch>[/<folder>]] */
(function () {
	'use strict';
	const PER_PAGE = 100;

	window.OLRepo.register('gitlab', {
		example: '{server}/group/project',

		parse(parts) {
			const dash = parts.indexOf('-');
			const path = dash >= 0 ? parts.slice(0, dash) : parts;
			if (path.length < 2) return null;
			path[path.length - 1] = path[path.length - 1].replace(/\.git$/, '');
			return { project: path.join('/'), rest: dash >= 0 && parts[dash + 1] === 'tree' ? parts.slice(dash + 2) : [] };
		},

		/* branches, then tags, whose names start with the first part */
		async refs(repo, http) {
			const api = repo.server + '/api/v4/projects/' + encodeURIComponent(repo.project) + '/repository/';
			for (const kind of ['branches', 'tags']) {
				const items = await http.json(api + kind + '?per_page=' + PER_PAGE + '&search=' + encodeURIComponent('^' + repo.rest[0]), 'the branches of ' + repo.project);
				const names = (Array.isArray(items) ? items : []).map((item) => String(item.name));
				if (names.length) return names;
			}
			return [];
		},

		async list(repo, http) {
			const api = repo.server + '/api/v4/projects/' + encodeURIComponent(repo.project) + '/repository';
			const ref = repo.ref ? '&ref=' + encodeURIComponent(repo.ref) : '';
			const base = repo.dir ? repo.dir + '/' : '';
			const folder = async (rel) => {
				const path = (base + rel).replace(/\/$/, '');
				const all = [];
				for (let page = 1; ; page++) {
					const items = await http.json(api + '/tree?per_page=' + PER_PAGE + '&page=' + page + (path ? '&path=' + encodeURIComponent(path) : '') + ref,
						rel ? rel : 'the project ' + repo.project + (repo.ref ? ' with the branch ' + repo.ref : '') + (repo.dir ? ' and the folder ' + repo.dir : ''));
					if (!Array.isArray(items)) throw new Error('GitLab did not list ' + (path || repo.project) + '.');
					all.push.apply(all, items);
					if (items.length < PER_PAGE) return all;
				}
			};
			const file = (rel) => ({
				path: rel,
				read: () => http.text(api + '/files/' + encodeURIComponent(base + rel) + '/raw' + (repo.ref ? '?ref=' + encodeURIComponent(repo.ref) : ''), rel),
			});

			const listed = { '': await folder('') };
			const out = listed[''].filter((item) => item.type === 'blob').map((item) => file(item.name));
			// each wanted folder only if its parent has it, one request per level
			for (const wanted of repo.folders || ['sources', 'inbox']) {
				let dir = '';
				for (const name of wanted.split('/')) {
					if (dir === null) break;
					const hit = listed[dir].find((item) => item.type === 'tree' && item.name.toLowerCase() === name);
					dir = hit ? (dir ? dir + '/' : '') + hit.name : null;
					if (dir !== null && !listed[dir]) listed[dir] = await folder(dir);
				}
				if (dir) listed[dir].filter((item) => item.type === 'blob').forEach((item) => out.push(file(dir + '/' + item.name)));
			}
			return out;
		},
	});
})();
