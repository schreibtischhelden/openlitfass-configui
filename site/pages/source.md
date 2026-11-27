# Source

One source is one file in the instance's `sources/` directory: an
iCalendar export, an RSS feed, a JSON API, an HTML page or a WordPress
calendar. Choose the type first; the page shows only the fields that type
uses. Details: [Sources](https://docs.openlitfass.org/?page=sources) and
[Source types](https://docs.openlitfass.org/?page=source-types).

Prefer the types in this order: `ical` needs no mapping and breaks least,
`rss` and `json` need a field mapping, `html` reads the page layout and
breaks when it changes.

<div data-cfg-import></div>

## Preset

For platforms that many sites use, the core ships a preset: choose it and
fill in a few values instead of type, selectors and field mapping. Details:
[Presets](https://docs.openlitfass.org/?page=source-types#presets).

:::form
Preset = {(none -> No preset: configure the source yourself)}
:::

<div data-cfg-preset-params></div>

## Type and address

:::form
Type* = {(ical -> iCalendar export .ics), rss -> RSS feed, json -> JSON API, html -> HTML page, wcs -> WordPress Weekly Class Schedule}
URL* = ___:url
:::

## Name and display

:::form
Label = ___
Homepage = ___:url
Source name = ___
Priority = ___:number
Source disabled = [] skip this source
:::

## Options for iCalendar and WCS

:::form
Organizer = ___
Default location = ___
Family-friendly = [] every event
:::

## Options for iCalendar

:::form
UTC times as = ___
:::

## Options for WCS

:::form
WCS type IDs* = ___
:::

## Options for JSON

:::form
Items path = ___
Next page path = ___
Max pages = ___:number
:::

## Options for HTML

:::form
Item selector* = ___
Section selector = ___
:::

### Values from the page

Each value is read from every event container and can be used as a path
in the field mapping below.

:::form
Value name* = ___
Selector = ___
Attribute = ___
Extract options = [] inner HTML [] all matches
Skip = ___:number
Regex = ___
[[ Add value ]]
:::

## Field mapping

How one item of the source becomes an event: one rule per target field.
An event needs at least a title and a date. Details:
[Field mapping](https://docs.openlitfass.org/?page=field-mapping).

:::form
Target field* = {(title), sourceId, description, category, organizer, url, image, locationName, locationAddress, placeRef, start, end, date, startTime, endTime, ticketRequired, registrationRequired, familyFriendly, cancelled}
Path = ___
Template = ___
Regex = ___
Format = ___
Default = ___
Equals = ___
[[ Add rule ]]
:::

### Price

:::form
Amount path = ___
Free path = ___
Price unknown = [] if the amount is missing
Amount regex = ___
:::

## Filters

Filters apply after fetching and mapping. Past events are always dropped.

:::form
Days ahead = ___:number
Place = ___
Allowed categories = ___
Event images = [] keep the images the source provides
:::

### Category map

Translate the source's categories into the instance's categories.

:::form
Source category* = ___
Instance category* = ___
[[ Add translation ]]
:::

### Category rules

Set the category by pattern, for sources that file very different events
under one category (workshops, markets and tours all under “Extra”). The
rules are checked in order and the first match wins; without a match the
category stays as it is. A rule on *category* sees the value after the
category map.

:::form
Match field = {(title), location, organizer, category, description}
Match pattern* = ___
New category* = ___
[[ Add category rule ]]
:::

### Include and exclude rules

*Include* keeps only events where at least one include rule matches;
*exclude* drops events where any exclude rule matches. The field
*location* covers the venue name and the address.

:::form
Rule = (x) include () exclude
Field = {(title), location, organizer, category, description}
Pattern* = ___
[[ Add rule ]]
:::

## File

:::form
File name* = ___
:::

## Result

The `status` block that `fetch` writes into the file is left out; it is
written again on the next run.

<div data-cfg-output></div>
