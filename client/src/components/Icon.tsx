type IconName =
  | 'list' | 'book' | 'graph' | 'dash' | 'msg' | 'search' | 'chevR' | 'chevL'
  | 'upload' | 'sun' | 'moon' | 'close' | 'menu' | 'sidebar'
  | 'send' | 'paperclip' | 'filter' | 'plus' | 'sparkle' | 'refresh'
  | 'ext' | 'check' | 'arrowUpRight' | 'eye' | 'trash';

export default function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  const stroke = 'currentColor';
  const sw = 1.6;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };
  switch (name) {
    case 'list':
      return (<svg {...common}><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>);
    case 'book':
      return (<svg {...common}><path d="M4 19V6a2 2 0 0 1 2-2h12v15"/><path d="M6 17h12"/><path d="M6 21h12a2 2 0 0 1-2-2"/></svg>);
    case 'graph':
      return (<svg {...common}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><line x1="7.7" y1="7.4" x2="11" y2="16.4"/><line x1="16.3" y1="7.4" x2="13" y2="16.4"/></svg>);
    case 'dash':
      return (<svg {...common}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>);
    case 'msg':
      return (<svg {...common}><path d="M21 12a8 8 0 0 1-11.4 7.2L4 21l1.8-5.6A8 8 0 1 1 21 12Z"/></svg>);
    case 'search':
      return (<svg {...common}><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>);
    case 'chevR':
      return (<svg {...common}><polyline points="9 6 15 12 9 18"/></svg>);
    case 'chevL':
      return (<svg {...common}><polyline points="15 6 9 12 15 18"/></svg>);
    case 'upload':
      return (<svg {...common}><path d="M12 17V5"/><polyline points="6 11 12 5 18 11"/><path d="M5 19h14"/></svg>);
    case 'sun':
      return (<svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>);
    case 'moon':
      return (<svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>);
    case 'close':
      return (<svg {...common}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>);
    case 'menu':
      return (<svg {...common}><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>);
    case 'sidebar':
      return (<svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="5.5" y1="8.5" x2="7" y2="8.5"/><line x1="5.5" y1="12" x2="7" y2="12"/><line x1="5.5" y1="15.5" x2="7" y2="15.5"/></svg>);
    case 'send':
      return (<svg {...common}><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>);
    case 'paperclip':
      return (<svg {...common}><path d="M21 11.5 12 20a5 5 0 1 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 1 1-3-3l8-8"/></svg>);
    case 'filter':
      return (<svg {...common}><path d="M3 5h18l-7 9v6l-4-2v-4Z"/></svg>);
    case 'plus':
      return (<svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
    case 'sparkle':
      return (<svg {...common}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>);
    case 'refresh':
      return (<svg {...common}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>);
    case 'ext':
      return (<svg {...common}><path d="M14 4h6v6"/><line x1="10" y1="14" x2="20" y2="4"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>);
    case 'check':
      return (<svg {...common}><polyline points="4 12 10 18 20 6"/></svg>);
    case 'arrowUpRight':
      return (<svg {...common}><line x1="6" y1="18" x2="18" y2="6"/><polyline points="9 6 18 6 18 15"/></svg>);
    case 'eye':
      return (<svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>);
    case 'trash':
      return (<svg {...common}><polyline points="3 6 5 6 21 6"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>);
    default:
      return null;
  }
}
