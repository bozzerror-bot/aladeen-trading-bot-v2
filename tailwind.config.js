/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#030712', panel: '#0a0f1a', elevated: '#111827', input: '#1a2235',
        accent: '#06b6d4', 'accent-light': '#22d3ee', bull: '#10b981', bear: '#ef4444',
        warning: '#f59e0b', muted: '#64748b', secondary: '#94a3b8',
      },
      fontFamily: {
        sans: ['Inter','ui-sans-serif','system-ui','sans-serif'],
        mono: ['JetBrains Mono','ui-monospace','monospace'],
      },
      animation: {
        scan: 'scan 3s linear infinite', pulseGlow: 'pulseGlow 2s ease-in-out infinite',
        fadeIn: 'fadeIn 0.3s ease-out', blink: 'blink 1s step-end infinite',
      },
      keyframes: {
        scan: { '0%':{transform:'translateX(-100%)'}, '100%':{transform:'translateX(400%)'} },
        pulseGlow: { '0%,100%':{boxShadow:'0 0 5px rgba(6,182,212,0.2)'}, '50%':{boxShadow:'0 0 25px rgba(6,182,212,0.4)'} },
        fadeIn: { from:{opacity:'0',transform:'translateY(10px)'}, to:{opacity:'1',transform:'translateY(0)'} },
        blink: { '0%,100%':{opacity:'1'}, '50%':{opacity:'0'} },
      },
    },
  },
  plugins: [],
};
