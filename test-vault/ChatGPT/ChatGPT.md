---
title: Contents
created: 2024-01-25T08:00:00+00:00
updated: 2024-01-25T09:00:00+00:00
---

# Contents

```base
formulas:
  title: file.asLink(title)
  updated: updated.format("YYYY-MM-DD HH:mm:ss")
  created: created.format("YYYY-MM-DD HH:mm:ss")
properties:
  formula.title:
    displayName: Title
  formula.updated:
    displayName: Updated
  formula.created:
    displayName: Created
views:
  - type: table
    name: Table
    filters:
      and:
        - file.folder == this.file.folder
        - file.name != file.folder
    order:
      - formula.title
      - formula.updated
      - formula.created
    sort:
      - property: formula.created
        direction: DESC
    columnSize:
      formula.title: 286
      formula.updated: 156
      formula.created: 159
```
