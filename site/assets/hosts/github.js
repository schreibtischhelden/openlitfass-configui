/* openLitfass config: GitHub plugin for assets/repo.js. Lists the
   repository with one request to the API (git trees) and reads the files
   from raw.githubusercontent.com, which does not count towards the API
   limit of 60 requests per hour without signing in.
   Addresses: https://github.com/<owner>/<repo>[/tree/<branch>[/<folder>]] */
(function () {
	'use strict';
	window.OLRepo.register('github', {
		example: 'https://github.com/owner/repository',

		parse(parts) {
			if (parts.length < 2) return null;
			const repo = { project: parts[0] + '/' + parts[1].replace(/\.git$/, ''), ref: '', dir: '' };
			if (parts[2] === 'tree' && parts[3]) {
				repo.ref = parts[3];
				repo.dir = parts.slice(4).join('/');
			}
			return repo;
		},

		async list(repo, http) {
			const ref = repo.ref || 'HEAD';
			const tree = await http.json('https://api.github.com/repos/' + repo.project + '/git/trees/' + http.encodePath(ref) + '?recursive=1',
				'the repository ' + repo.project + (repo.ref ? ' with the branch ' + repo.ref : ''));
			if (!Array.isArray(tree.tree)) throw new Error('GitHub did not list the repository ' + repo.project + '.');
			if (tree.truncated) throw new Error('The repository ' + repo.project + ' is too large to be listed at once. Put the folder of the instance into the address (…/tree/<branch>/<folder>).');
			const prefix = repo.dir ? repo.dir + '/' : '';
			return tree.tree
				.filter((item) => item.type === 'blob' && item.path.indexOf(prefix) === 0)
				.map((item) => ({
					path: item.path.slice(prefix.length),
					read: () => http.text('https://raw.githubusercontent.com/' + repo.project + '/' + http.encodePath(ref) + '/' + http.encodePath(item.path), item.path),
				}));
		},
	});
})();
