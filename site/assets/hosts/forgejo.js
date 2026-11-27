/* openLitfass config: Forgejo and Gitea plugin for assets/repo.js (also
   Codeberg). Lists the instance folder, sources/ and inbox/ through the
   contents API and reads the files through the API as well: the plain
   /raw/ addresses of the web interface are not readable cross-origin.
   Addresses: <server>/<owner>/<repo>[/src/branch/<branch>[/<folder>]] */
(function () {
	'use strict';
	const PER_PAGE = 50;
	const REF_PAGES = 20;

	window.OLRepo.register('forgejo', {
		example: '{server}/owner/repository',

		parse(parts) {
			if (parts.length < 2) return null;
			const kind = parts[2] === 'src' && ['branch', 'tag', 'commit'].indexOf(parts[3]) >= 0 ? parts[3] : '';
			return { project: parts[0] + '/' + parts[1].replace(/\.git$/, ''), kind: kind, rest: kind ? parts.slice(4) : [] };
		},

		/* all branches or all tags, as the address says; the API has no
		   search, so they are read page by page */
		async refs(repo, http) {
			if (repo.kind === 'commit') return null;
			const api = repo.server + '/api/v1/repos/' + repo.project + (repo.kind === 'tag' ? '/tags' : '/branches');
			const names = [];
			for (let page = 1; page <= REF_PAGES; page++) {
				const items = await http.json(api + '?limit=' + PER_PAGE + '&page=' + page, 'the branches of ' + repo.project);
				if (!Array.isArray(items)) break;
				items.forEach((item) => names.push(String(item.name)));
				if (items.length < PER_PAGE) break;
			}
			return names;
		},

		async list(repo, http) {
			const api = repo.server + '/api/v1/repos/' + repo.project;
			const query = repo.ref ? '?ref=' + encodeURIComponent(repo.ref) : '';
			const base = repo.dir ? repo.dir + '/' : '';
			const folder = async (rel) => {
				const items = await http.json(api + '/contents/' + http.encodePath(base + rel) + query,
					rel ? rel : 'the repository ' + repo.project + (repo.ref ? ' with the branch ' + repo.ref : '') + (repo.dir ? ' and the folder ' + repo.dir : ''));
				if (!Array.isArray(items)) throw new Error((base + rel || repo.project) + ' is not a folder.');
				return items;
			};
			const file = (rel) => ({
				path: rel,
				read: () => http.text(api + '/raw/' + http.encodePath(base + rel) + query, rel),
			});

			const root = await folder('');
			const out = root.filter((item) => item.type === 'file').map((item) => file(item.name));
			const subfolders = root.filter((item) => item.type === 'dir' && /^(sources|inbox)$/i.test(item.name));
			for (const sub of subfolders) {
				(await folder(sub.name)).filter((item) => item.type === 'file').forEach((item) => out.push(file(sub.name + '/' + item.name)));
			}
			return out;
		},
	});
})();
