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
        background: 'var(--bg)', /* alias que streamdown espera (bg-background) */
        foreground: 'var(--fg)',
        'muted-foreground': 'var(--fg-3)',
        muted: 'var(--bg-2)',
        border: 'var(--line)',
        sidebar: 'var(--bg-1)',
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
  // ── Safelist ──
  // streamdown genera classes de Tailwind en su bundle externo (@streamdown/mermaid,
  // @streamdown/code). Como Tailwind JIT escanea el source del proyecto pero no
  // encuentra estas clases (están en el sidecar pre-bundleado), deben listarse aquí
  // para que se incluyan en el CSS final.
  safelist: [
    // ── Layout & positioning ──
    'fixed', 'inset-0', 'top-2', 'top-4', 'right-4', 'bottom-2', 'bottom-4', 'left-2', 'left-4',
    'z-10', 'z-50',
    'h-full', 'w-full', 'size-full', 'h-8', 'min-h-28',
    'flex-1', 'shrink-0',
    '-mt-10',
    'my-4',
    'gap-2',
    'px-1.5', 'py-1', 'p-1.5', 'p-2',
    'justify-end',
    // ── Visual ──
    'rounded-xl', 'rounded',
    'backdrop-blur-sm',
    // ── Tipografía ──
    'text-xs', 'font-mono', 'lowercase', 'ml-1',
    // ── Transiciones/efectos ──
    'origin-center', 'duration-150', 'ease-out',
    'group',
    // ── Arbitrary variants ──
    '[&_svg]:h-auto', '[&_svg]:w-auto',
    // ── Patrones para colores streamdown (incluye variantes hover) ──
    { pattern: /^bg-(background|muted|sidebar)$/ },
    // Opacidad de fondo (safelist explícito porque el pattern con / no siempre casa)
    'bg-background/80', 'bg-background/95', 'bg-sidebar/80', 'bg-sidebar/70',
    { pattern: /^text-(muted-foreground|foreground)$/ },
    { pattern: /^border-(border|sidebar)$/ },
    // ── Hover / disabled states ──
    { pattern: /^(bg-muted|text-foreground|cursor-not-allowed|opacity-50)$/, variants: ['hover', 'disabled'] },
    // ── Soporte backdrop-filter ──
    { pattern: /^bg-(background|sidebar)\/70$/, variants: ['supports-[backdrop-filter]'] },
    // ── Transiciones ──
    { pattern: /^transition-(colors|all|transform)$/ },
  ],
};
