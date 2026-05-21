<script lang="ts">
  import { activeTool } from '../lib/stores/buildToolStore';
  import { governancePanelOpen } from '../lib/stores/governanceStore';
  import { BUILDING_DEFS } from '../lib/game/buildings';
  import type { BuildingCategory, BuildingType, ToolId } from '../lib/game/types';

  type ToolEntry = { id: ToolId; label: string; emoji: string };

  const sections: { title: string; tools: ToolEntry[] }[] = [
    {
      title: 'Resources',
      tools: buildToolsForCategory('natural_extractor'),
    },
    {
      title: 'Production',
      tools: [
        ...buildToolsForCategory('farm'),
        ...buildToolsForCategory('factory'),
        ...buildToolsForCategory('storage'),
      ],
    },
    {
      title: 'Civic',
      tools: [
        ...buildToolsForCategory('housing'),
        ...buildToolsForCategory('civic'),
        ...buildToolsForCategory('road'),
        ...buildToolsForCategory('decorative'),
        { id: 'erase', label: 'Erase', emoji: '🧹' },
      ],
    },
    {
      title: 'Governance',
      tools: [...buildToolsForCategory('religion'), ...buildToolsForCategory('trade')],
    },
  ];

  function buildToolsForCategory(category: BuildingCategory): ToolEntry[] {
    return (Object.values(BUILDING_DEFS) as (typeof BUILDING_DEFS)[BuildingType][])
      .filter((d) => d.category === category)
      .map((d) => ({ id: d.type, label: d.label, emoji: d.emoji }));
  }

  function selectTool(id: ToolId): void {
    activeTool.set(id);
  }
</script>

<nav
  class="border-stone-dark/30 bg-stone-dark/90 flex max-h-[38vh] shrink-0 flex-col gap-0 overflow-y-auto border-t backdrop-blur-sm"
  aria-label="Build tools"
>
  <div class="border-stone/20 flex justify-end border-b px-2 py-1">
    <button
      type="button"
      class="rounded px-2 py-1 text-xs {$governancePanelOpen
        ? 'bg-terracotta text-white'
        : 'bg-stone/20 text-stone hover:bg-stone/30'}"
      aria-pressed={$governancePanelOpen}
      onclick={() => governancePanelOpen.update((v) => !v)}
    >
      ⚖️ Governance
    </button>
  </div>
  {#each sections as section (section.title)}
    <div class="px-2 pt-2 pb-0.5">
      <span class="text-stone/70 mb-1 block px-1 text-[10px] font-semibold tracking-wide uppercase"
        >{section.title}</span
      >
      <div
        class="flex flex-wrap items-center gap-1.5 pb-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
      >
        {#each section.tools as tool (tool.id)}
          <button
            type="button"
            class="flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-lg px-2.5 py-2 text-sm transition-colors {$activeTool ===
            tool.id
              ? 'bg-terracotta text-white shadow-md'
              : 'bg-stone/80 text-stone-dark hover:bg-stone'}"
            aria-pressed={$activeTool === tool.id}
            aria-label={tool.label}
            onclick={() => selectTool(tool.id)}
          >
            <span class="text-lg leading-none" aria-hidden="true">{tool.emoji}</span>
            <span class="mt-0.5 max-w-16 truncate text-[10px] sm:text-xs">{tool.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/each}
</nav>
