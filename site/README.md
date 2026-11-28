# openLitfass config

Build the configuration files of an
[openLitfass](https://openlitfass.org) instance in the browser, then put
them into your instance directory.

> **Nothing leaves your browser.** The forms are never sent anywhere; the
> files are put together on this page. Imported files are only read
> locally; loading from a git repository only downloads its files.

## Your instance

Load the configuration of your instance to edit it as a whole: pick the
instance folder (the one with `instance.json`, `sources/` and `inbox/`),
single files or a ZIP, or load it from a public git repository on GitHub,
Codeberg, GitLab or a Forgejo or Gitea server. Then:

- every form page works on the loaded files, and the source and inbox
  pages can pick one of them;
- the category and place fields of sources and inbox events suggest the
  instance's categories and places and warn about unknown ones;
- the dates and exceptions of inbox events are checked against the day
  lists of `holidays.json`;
- renaming a category, a place id or a day list offers to change it in
  every file that uses it, and removing one tells you where it is still
  used;
- *Download all (ZIP)* gives you the whole configuration back, in the
  folder layout of the instance. Files you did not change come back
  exactly as they were.

Paste the repository's address as the browser shows it; an address that
points into a branch and a folder loads that folder. The branch is filled in
from the address, also when its name contains a slash, and can be changed.
A repository is read straight from its server, which has to allow pages
from other sites to read it (CORS). GitHub, Codeberg and gitlab.com do; on
a server of your own, that is up to its operator. Changes are not written
back: download the ZIP and commit the files yourself.

The files stay in this browser until you unload them; nothing is uploaded.
Only the configuration and the pages are read: `instance.json`,
`categories.json`, `places.json`, `holidays.json`, `sources/*.json`,
`inbox/*.json`, the pages `site/*.md` and `site/*.html`, and
`site/custom-script.js` (only to know whether the pages load it).

<div data-cfg-workspace></div>

## Single files

<div class="cards">
<a href="?page=instance"><strong>instance.json</strong>Name, texts, time zone, colour and links of the instance.</a>
<a href="?page=categories"><strong>categories.json</strong>Categories, their icons and groups.</a>
<a href="?page=places"><strong>places.json</strong>Place types and places for the tab “Orte”.</a>
<a href="?page=holidays"><strong>holidays.json</strong>Named day lists, such as holidays, for recurring inbox events.</a>
<a href="?page=inbox"><strong>Inbox event</strong>A single or recurring event added by hand.</a>
<a href="?page=source"><strong>Source</strong>An iCalendar, RSS, JSON, HTML or WordPress source with its field mapping and filters, or a preset of the core.</a>
<a href="?page=pages"><strong>Pages</strong>Pages in Markdown, such as the imprint and the privacy policy, with a preview.</a>
<a href="?page=legal"><strong>Imprint and privacy</strong>German templates for the imprint and the privacy policy, built from a few fields.</a>
</div>

## How it works

1. Pick a file in the sidebar.
2. Fill in the form, or import an existing file to change it. The JSON below
   the form follows every change.
3. *Download* the file or *copy* it (or download the whole loaded instance
   as a ZIP), and put it into your instance:

| File | Goes to |
|---|---|
| `instance.json` | the instance directory |
| `categories.json` | the instance directory |
| `places.json` | the instance directory |
| `holidays.json` | the instance directory |
| an inbox event | `inbox/<name>.json` |
| a source | `sources/<name>.json` |
| a page | `site/<name>.html`, its text next to it in `site/<name>.md` |

The next `fetch` or `serve` run picks the files up. Changes to
`instance.json` need a restart of `serve`.

What each field means is described in the
[configuration reference](https://docs.openlitfass.org/?page=configuration).
