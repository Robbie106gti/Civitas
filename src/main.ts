import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initPerfFromUrl } from './lib/perf/perfMonitor';

initPerfFromUrl();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
