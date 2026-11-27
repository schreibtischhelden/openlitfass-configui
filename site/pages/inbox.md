# Inbox event

A single event that arrives through no feed: a flyer, a phone call, a tip
from the neighbourhood. One file per event goes into the instance's
`inbox/` directory. Details:
[Event inbox](https://docs.openlitfass.org/?page=inbox).

<div data-cfg-import></div>

## Event

:::form
Title* = ___
Date = ___:date
Start time = ___:time
End time = ___:time
Category = ___
Description = [___]:4
Organizer = ___
Link = ___:url
Image = ___:url
:::

## Location

:::form
Location name = ___
Location address = ___
Place = ___
:::

## Price and attributes

:::form
Price = (x) free () paid () unknown
Amount in euros = ___:number
Marked as = [] Ticket required [] Registration required [] Family-friendly [] Cancelled
:::

## Recurring event

For opening hours, weekly classes and similar. Leave this empty for a
single event on the date above.

:::form
Weekdays = [] mo [] di [] mi [] do [] fr [] sa [] so
From = ___
Until = ___
Additional dates = ___
Except = ___
Days ahead = ___:number
:::

## File

:::form
File name* = ___
:::

## Result

<div data-cfg-output></div>
