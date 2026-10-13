/* LANGKAH. brand marks. The symbol is a run of steps with a diagonal stride
   beneath it: every step moves work forward. */

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M4 21v-6h6V9h6V4h12v10" stroke="var(--gold)" strokeWidth="3.2" strokeLinejoin="miter" strokeLinecap="square" />
      <path d="M4.5 27.5 22.5 9.5l3 3-18 18z" fill="var(--gold)" />
    </svg>
  )
}

export function Wordmark({ tagline = true }: { tagline?: boolean }) {
  return (
    <span className="wordmark">
      <span className="wordmarkName">LANGKAH<b>.</b></span>
      {tagline && <span className="wordmarkTag">Plan / Track / Deliver</span>}
    </span>
  )
}

export type Art = 'projects' | 'cards' | 'timeline' | 'team'

/** Line illustrations for empty states: charcoal panels, gold and green strokes. */
export function Illustration({ art }: { art: Art }) {
  const panel = { fill: 'var(--surface)', stroke: 'var(--line-strong)', strokeWidth: 1.5 }
  const gold = { stroke: 'var(--gold)', strokeWidth: 1.5, fill: 'none' }
  const sparks = (x: number, y: number) => (
    <g stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round">
      <path d={`M${x} ${y}v-9`} /><path d={`M${x + 7} ${y + 6}l7-6`} /><path d={`M${x + 9} ${y + 15}h8`} />
    </g>
  )
  return (
    <svg className="art" width="240" height="150" viewBox="0 0 240 150" aria-hidden="true">
      <path d="M20 140h200" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
      {art === 'projects' && (
        <g>
          <rect x="52" y="36" width="96" height="104" rx="8" {...panel} />
          <rect x="70" y="24" width="96" height="116" rx="8" {...panel} />
          <path d="M84 44h68M84 54h52" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <path d="M60 64h34l10 10h62a6 6 0 0 1 6 6v54a6 6 0 0 1-6 6H66a6 6 0 0 1-6-6z" {...gold} fill="var(--surface)" />
          <path d="M104 116v-8h8v-8h8v-6h14v12" {...gold} strokeWidth="2.5" />
          <path d="M102 124l26-24" stroke="var(--gold)" strokeWidth="4" />
          {sparks(186, 34)}
        </g>
      )}
      {art === 'cards' && (
        <g>
          {[36, 92, 148].map((x, i) => (
            <g key={x}>
              <rect x={x} y="30" width="54" height="110" rx="7" {...panel} stroke={i === 1 ? 'var(--gold)' : 'var(--line-strong)'} />
              <rect x={x + 7} y="38" width="3" height="12" rx="1.5" fill={i === 1 ? 'var(--gold)' : 'var(--accent)'} />
              <rect x={x + 14} y="38" width="33" height="12" rx="3" fill="none" stroke="var(--line-strong)" />
              {i !== 1 && <rect x={x + 7} y="60" width="40" height="24" rx="4" fill="none" stroke="var(--line-strong)" />}
              {i !== 1 && <rect x={x + 7} y="92" width="40" height="24" rx="4" fill="none" stroke="var(--line-strong)" />}
            </g>
          ))}
          <rect x="99" y="62" width="40" height="40" rx="5" {...gold} strokeDasharray="4 3" />
          <path d="M119 74v16M111 82h16" stroke="var(--gold)" strokeWidth="1.8" />
          {sparks(126, 22)}
        </g>
      )}
      {art === 'timeline' && (
        <g>
          <rect x="34" y="28" width="164" height="110" rx="9" {...panel} stroke="var(--gold)" />
          {[48, 58, 68].map((x) => <circle key={x} cx={x} cy="40" r="3" {...gold} />)}
          <path d="M42 54h148" stroke="var(--line-strong)" />
          <rect x="50" y="72" width="54" height="9" rx="4.5" fill="var(--accent)" />
          <rect x="88" y="92" width="64" height="9" rx="4.5" fill="var(--bar-track)" />
          <rect x="88" y="92" width="28" height="9" rx="4.5" fill="var(--accent)" />
          <rect x="120" y="112" width="56" height="9" rx="4.5" fill="var(--bar-track)" />
          <path d="M124 54v84" stroke="var(--gold)" strokeDasharray="3 3" />
          <path d="M124 44l7 7-7 7-7-7z" fill="var(--surface)" stroke="var(--gold)" strokeWidth="1.5" />
          {sparks(204, 22)}
        </g>
      )}
      {art === 'team' && (
        <g>
          <circle cx="140" cy="70" r="16" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
          <path d="M112 140v-14a28 28 0 0 1 56 0v14" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
          <circle cx="108" cy="60" r="20" {...gold} fill="var(--surface)" />
          <path d="M72 140v-16a36 36 0 0 1 72 0v16" {...gold} fill="var(--surface)" />
          {sparks(164, 40)}
        </g>
      )}
    </svg>
  )
}
