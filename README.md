# openLitfass config UI

Source of the config UI at <https://config.openlitfass.org> for
[openLitfass](https://github.com/schreibtischhelden/openlitfass), the
self-hosted static events calendar: forms that build an instance's
configuration files in the browser.

Like the [documentation](https://github.com/schreibtischhelden/openlitfass-docs),
this repository holds only the content. The pages are Markdown with
`:::form` blocks, rendered in the browser by
[markdown-pages.js](https://github.com/schreibtischhelden/markdown-pages.js);
`assets/configui.js` turns the forms into JSON files. Nothing is sent to a
server, and the site loads nothing from other hosts.

## Layout

```
site/
  README.md            start page
  pages/<name>.md      one page per config file, reachable as ?page=<name>
  header.md            sidebar: logo, navigation
  footer.md            footer
  404.md               shown for an unknown ?page=
  index.html           page shell with the Content Security Policy
  404.html             GitHub Pages' page for unknown paths
  assets/
    setup.js           renderer options and saved theme, before rendering
    shell.js           navigation, menu toggle, theme switch
    workspace.js       the loaded instance: read, check, rename, ZIP
    configui.js        page specs: form fields ↔ JSON keys
    configui.css       layout and colours
    img/               icons
    lib/               JSZip (loaded only for ZIP files), with its licence
scripts/
  assemble.sh          renderer + site/ → finished site
  preview.sh           local preview at http://localhost:8001 (Docker)
.github/workflows/pages.yml
```

## Editing

- Write in British English. Field names and JSON keys are those of
  openLitfass; keep German example values as they are.
- The rendered HTML is sanitised with DOMPurify, and the Content Security
  Policy in `index.html` allows scripts from this site only. Put behaviour
  into `assets/` scripts, not into the Markdown.

## Preview

```sh
scripts/preview.sh
```

clones markdown-pages.js into `.renderer/` once (delete the folder to update
it), assembles the site into `.preview/` and serves it with nginx in Docker.
After editing, `scripts/preview.sh assemble` refreshes `.preview/` while the
server keeps running.

## Publishing

`.github/workflows/pages.yml` runs on every push to `main` that touches
`site/`: it checks out markdown-pages.js, assembles the site and pushes it to
the branch `pages`, served by GitHub Pages at `config.openlitfass.org`.

## Licence

MIT, see [LICENSE](LICENSE). markdown-pages.js and its libraries keep their
own licences, which are published with the site. [JSZip](https://github.com/Stuk/jszip)
3.10.1 in `site/assets/lib/` is used under its MIT licence
(`LICENSE-jszip.txt`, dual MIT/GPLv3).
