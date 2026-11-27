# Imprint and privacy

Fill in who runs the instance, and this page writes its imprint
(*Impressum*) and privacy policy (*Datenschutzerklärung*) as German
Markdown pages: `site/pages/impressum.md` and `site/pages/datenschutz.md`.
openLitfass shows them at `seite.html?page=impressum` and
`seite.html?page=datenschutz` and links them in the footer once
`imprintUrl` and `privacyUrl` in `instance.json` point there; *Add to the
instance* sets both.

> **Templates, not legal advice.** They describe what openLitfass itself
> does: no cookies, settings kept in the browser, maps and event images
> loaded from other servers only on request. Check them, adapt them to your
> situation and add everything else your site does. Refine the wording
> afterwards on the [Pages](?page=pages) page.

<div data-cfg-legal-bar></div>

## Who runs the site

:::form
Name* = ___
Address* = [___]:3
E-mail* = ___:email
Phone = ___:tel
:::

## Responsible for the content

Only needed if the site publishes journalistic or editorial content of its
own, such as articles (§ 18 Abs. 2 MStV). Leave it empty for a plain
calendar.

:::form
Responsible person = ___
Responsible address = [___]:3
:::

## Hosting and statistics

:::form
Hosting = {github -> GitHub Pages, server -> A server of your own or a hosting company}
Hosting company = [___]:3
Statistics = ___
Supervisory authority = ___
:::

## Result

<div data-cfg-legal></div>
