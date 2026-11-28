# holidays.json

Optional: named day lists, such as public or school holidays, that inbox
events use in *Additional dates* and *Except* (for example “every Saturday
except on `feiertage`”). Save the file as `holidays.json` in the instance
directory. Details:
[Day lists](https://docs.openlitfass.org/?page=inbox#day-lists-holidaysjson).

Easter is the only date openLitfass computes; which holidays apply is up to
the instance. If the file has a problem (an unknown entry, a list that
contains itself), the whole inbox fails for that run.

<div data-cfg-import></div>

## Day lists

:::form
List name* = ___
Days* = [___]:2
[[ Add list ]]
:::

## Result

<div data-cfg-output></div>
