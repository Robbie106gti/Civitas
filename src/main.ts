import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initSupabaseAuth } from './lib/auth/initSupabaseAuth';
import { initPerfFromUrl } from './lib/perf/perfMonitor';

initPerfFromUrl();
initSupabaseAuth();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
