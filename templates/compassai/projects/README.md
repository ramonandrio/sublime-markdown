# Outputs

All generated work lives here. Two naming conventions to know:

## Initiatives

Each initiative has a PRD file and a resources folder with the same name:

```
[PRD][Producto]Nombre de la iniciativa.md
[Recursos][Producto]Nombre de la iniciativa/
├── research.md      ← user research, interviews, competitive notes
├── launch.md        ← launch plan, GTM, release notes
├── learnings.md     ← post-launch results and retrospective
├── meetings.md      ← meeting notes specific to this initiative
└── prototypes/      ← generated prototypes (.html) and their specs (.md)
```

**Example:**
```
[PRD][App]Dark mode.md
[Recursos][App]Dark mode/
├── research.md
├── launch.md
├── learnings.md
├── meetings.md
└── prototypes/
    ├── dark-mode-v1.html
    └── dark-mode-v1.md
```

## Ops

Cross-cutting operational outputs not tied to a specific initiative:

```
ops/
├── weekly-plans/
├── weekly-reviews/
├── status-updates/
└── slack-messages/
```
