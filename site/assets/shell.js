/* openLitfass config: sidebar navigation, menu toggle and theme switch on
   top of markdown-pages.js, which fills <header>, <main> and <footer>
   asynchronously and announces each region with the event "mdp:rendered". */
(function () {
	'use strict';

	var THEME_KEY = 'ol-config-theme';
	var currentPage = new URLSearchParams(window.location.search).get('page') || '';

	function onRendered(region, callback) {
		document.addEventListener('mdp:rendered', function (event) {
			if (event.detail && event.detail.region === region) callback(document.querySelector(region), event.detail.page);
		});
	}

	function pageOf(href) {
		if (href === '.' || href === './') return '';
		var match = /[?&]page=([^&#]+)/.exec(href || '');
		return match ? decodeURIComponent(match[1]) : null;
	}

	function systemTheme() {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	function enhanceSidebar(header) {
		var nav = document.createElement('nav');
		nav.setAttribute('aria-label', 'Config files');
		Array.prototype.slice.call(header.children).forEach(function (child) {
			if (child.tagName === 'H4' || child.tagName === 'UL') nav.appendChild(child);
		});
		header.appendChild(nav);
		nav.querySelectorAll('a').forEach(function (link) {
			if (pageOf(link.getAttribute('href')) === currentPage) link.setAttribute('aria-current', 'page');
		});

		var toggle = document.createElement('button');
		toggle.type = 'button';
		toggle.className = 'theme-toggle';
		function label() {
			var theme = document.documentElement.getAttribute('data-theme') || systemTheme();
			toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
		}
		toggle.addEventListener('click', function () {
			var next = (document.documentElement.getAttribute('data-theme') || systemTheme()) === 'dark' ? 'light' : 'dark';
			if (next === systemTheme()) {
				document.documentElement.removeAttribute('data-theme');
				try { localStorage.removeItem(THEME_KEY); } catch (e) {}
			} else {
				document.documentElement.setAttribute('data-theme', next);
				try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
			}
			label();
		});
		label();
		header.appendChild(toggle);
	}

	var button = document.querySelector('.menu-toggle');
	var sidebar = document.querySelector('header');
	if (button && sidebar) {
		button.addEventListener('click', function () {
			var open = sidebar.classList.toggle('open');
			button.setAttribute('aria-expanded', String(open));
		});
	}

	onRendered('header', enhanceSidebar);
})();
