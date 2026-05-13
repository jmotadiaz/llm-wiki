/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@streamdown/code/dist/*.js",
    "./node_modules/streamdown/dist/*.js",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-1': 'var(--bg-1)',
        'bg-2': 'var(--bg-2)',
        'bg-3': 'var(--bg-3)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        fg: 'var(--fg)',
        'fg-1': 'var(--fg-1)',
        'fg-2': 'var(--fg-2)',
        'fg-3': 'var(--fg-3)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-line': 'var(--accent-line)',
        cyan: 'var(--cyan)',
        'cyan-soft': 'var(--cyan-soft)',
        green: 'var(--green)',
        'green-soft': 'var(--green-soft)',
        violet: 'var(--violet)',
        'violet-soft': 'var(--violet-soft)',
        red: 'var(--red)',
        'red-soft': 'var(--red-soft)',
        amber: 'var(--amber)',
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      spacing: {
        sidebar: '248px',
        toc: '220px',
        topbar: '64px',
      },
      maxWidth: {
        shell: '1320px',
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '70ch',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
