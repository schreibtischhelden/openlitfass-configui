# Pages

Pages of the instance written in Markdown, such as the imprint or the
privacy policy. Each page goes into the instance directory twice:

- `site/<name>.html` is the page of the site, in the frame of the
  calendar's other pages: header, footer, the instance's styles,
  `js/settings.js` and, if the instance has one, `site/custom-script.js`.
  Link it as `<name>.html`.
- `site/pages/<name>.md` is the text, so the page can be edited here again.

The preview next to the text uses the same renderer, so the page looks the
same, apart from the instance's colours. When a loaded instance has an HTML
page that no longer matches its text (edited by hand, or the name or the
links in `instance.json` changed), this page says so and can write it anew.

<div data-cfg-pages></div>
