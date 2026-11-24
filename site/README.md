# openLitfass config

Build the configuration files of an
[openLitfass](https://openlitfass.org) instance in the browser, then put
them into your instance directory.

> **Nothing leaves your browser.** The forms are never sent anywhere; the
> files are put together on this page. Imported files are only read
> locally.

## How it works

1. Pick a file in the sidebar.
2. Fill in the form, or import an existing file to change it. The JSON below
   the form follows every change.
3. *Download* the file or *copy* it, and put it into your instance:

| File | Goes to |
|---|---|
| `instance.json` | the instance directory |
| `categories.json` | the instance directory |
| `places.json` | the instance directory |
| an inbox event | `inbox/<name>.json` |
| a source | `sources/<name>.json` |

The next `fetch` or `serve` run picks the files up. Changes to
`instance.json` need a restart of `serve`.

What each field means is described in the
[configuration reference](https://docs.openlitfass.org/?page=configuration).
