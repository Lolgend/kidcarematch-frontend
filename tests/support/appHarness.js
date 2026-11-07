import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach } from 'vitest';
let App;

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
});

export async function renderApp() {
  App ??= (await import('../../src/main.jsx')).App;
  return render(React.createElement(App));
}
