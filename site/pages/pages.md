# Pages

Pages of the instance written in Markdown, such as the imprint or the
privacy policy. Each page goes into the instance directory twice:

- `site/<name>.html` is the page of the site, in the frame of the
  calendar's other pages: header, footer, the instance's styles,
  `js/settings.js` and, if the instance has one, `site/custom-script.js`.
  Link it as `<name>.html`.
- `site/pages/<name>.md` is the text, so the page can be edited here again.

The preview next to the text uses the same renderer, so the page looks the
same, apart from the instance's colours. Keep both files in the instance's
repository. When the instance is loaded, the config UI checks whether each
HTML page still matches its text; if one was edited by hand, the start page
and this page say so, and this page can write it anew. After loading, the
HTML follows the text as you edit it.

<div data-cfg-pages></div>
