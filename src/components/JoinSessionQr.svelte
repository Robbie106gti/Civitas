<!-- Online-2: QR code for session join on primary device. -->
<script lang="ts">
  interface Props {
    joinCode?: string;
  }

  let { joinCode = '------' }: Props = $props();
</script>

<div class="rounded-lg bg-white/90 p-4 text-center shadow">
  <p class="text-stone-dark text-sm">Session join code</p>
  <p class="text-terracotta font-mono text-2xl tracking-widest">{joinCode}</p>
  <p class="text-stone-dark/70 mt-2 text-xs">QR placeholder — Online-2</p>
</div>
