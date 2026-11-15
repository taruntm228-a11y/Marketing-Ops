/* Original flat illustrations. Caricature proportions: oversized heads on small
   bodies, no facial detail beyond eyes, everyone wearing a badge. Palette is the
   five brief colours and nothing else. */

const PEACH = "#FFC6B0";
const CORAL = "#FF9F80";
const PAPER = "#FFF3EC";
const SAND = "#F2D7C6";
const TEAL = "#4E7C79";
const INK = "#22403E";

type FigureProps = {
  x: number;
  y: number;
  s?: number;
  body?: string;
  skin?: string;
  /** standing | walking | greeting (arm out) | seated */
  pose?: "standing" | "walking" | "greeting" | "seated";
  flip?: boolean;
  badge?: string;
};

/** One person. Head is deliberately ~40% of total height. */
function Figure({
  x,
  y,
  s = 1,
  body = TEAL,
  skin = PEACH,
  pose = "standing",
  flip = false,
  badge = CORAL,
}: FigureProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {/* legs */}
      {pose === "seated" ? (
        <>
          <rect x="-9" y="0" width="7" height="16" rx="3.5" fill={INK} />
          <rect x="2" y="0" width="7" height="16" rx="3.5" fill={INK} />
        </>
      ) : pose === "walking" ? (
        <>
          <rect x="-10" y="-2" width="7" height="24" rx="3.5" fill={INK} transform="rotate(-11 -6 -2)" />
          <rect x="3" y="-2" width="7" height="24" rx="3.5" fill={INK} transform="rotate(13 6 -2)" />
        </>
      ) : (
        <>
          <rect x="-9" y="-2" width="7" height="24" rx="3.5" fill={INK} />
          <rect x="2" y="-2" width="7" height="24" rx="3.5" fill={INK} />
        </>
      )}

      {/* torso */}
      <path d="M-13 -34 q0 -9 13 -9 q13 0 13 9 l0 34 l-26 0 z" fill={body} />

      {/* lanyard cord + badge */}
      <path d="M-6 -41 L0 -24 L6 -41" fill="none" stroke={PAPER} strokeWidth="2.2" opacity="0.85" />
      <rect x="-5" y="-25" width="10" height="7" rx="1.6" fill={badge} />

      {/* arms */}
      {pose === "greeting" ? (
        <rect x="9" y="-36" width="6.5" height="22" rx="3.2" fill={body} transform="rotate(-58 12 -36)" />
      ) : (
        <rect x="11" y="-36" width="6.5" height="22" rx="3.2" fill={body} transform="rotate(-6 14 -36)" />
      )}
      <rect x="-17.5" y="-36" width="6.5" height="22" rx="3.2" fill={body} transform="rotate(6 -14 -36)" />

      {/* head */}
      <circle cx="0" cy="-56" r="15" fill={skin} />
      <circle cx="-5" cy="-58" r="1.9" fill={INK} />
      <circle cx="5" cy="-58" r="1.9" fill={INK} />
    </g>
  );
}

/* ---------------------------------------------------------------------------
   Hero: a trade show aisle. Two booths are quiet. The teal one — yours — has a
   conversation happening at a table and a board of booked slots behind it.
   That contrast is the whole pitch.
   --------------------------------------------------------------------------- */
export function FloorScene({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 760 400"
      className={className}
      role="img"
      aria-label="A trade show aisle. Two quiet booths either side of a busier one, where two people are meeting at a table under a board of booked time slots."
    >
      <rect x="0" y="0" width="760" height="400" fill={PAPER} />

      {/* floor */}
      <rect x="0" y="295" width="760" height="105" fill={SAND} opacity="0.5" />
      <line x1="0" y1="295" x2="760" y2="295" stroke={SAND} strokeWidth="3.5" />

      {/* hanging banner over the centre booth */}
      <line x1="300" y1="0" x2="300" y2="16" stroke={SAND} strokeWidth="3" />
      <line x1="460" y1="0" x2="460" y2="16" stroke={SAND} strokeWidth="3" />
      <rect x="282" y="14" width="196" height="44" rx="9" fill={TEAL} />
      <rect x="300" y="29" width="104" height="8" rx="4" fill={PAPER} opacity="0.9" />
      <rect x="300" y="42" width="60" height="7" rx="3.5" fill={CORAL} />

      {/* ---- left booth: quiet ---- */}
      <rect x="22" y="124" width="178" height="171" rx="10" fill={PEACH} />
      <rect x="44" y="148" width="88" height="9" rx="4.5" fill={PAPER} opacity="0.85" />
      <rect x="44" y="165" width="54" height="8" rx="4" fill={PAPER} opacity="0.55" />
      <rect x="44" y="246" width="134" height="49" rx="7" fill={SAND} />
      <rect x="62" y="261" width="40" height="22" rx="4" fill={PAPER} opacity="0.8" />
      <Figure x={158} y={295} s={1.0} body={TEAL} skin={SAND} pose="standing" />

      {/* ---- centre booth: yours, busy ---- */}
      <rect x="240" y="72" width="280" height="223" rx="12" fill={TEAL} />
      <rect x="266" y="98" width="118" height="11" rx="5.5" fill={PAPER} />
      <rect x="266" y="118" width="78" height="9" rx="4.5" fill={CORAL} />

      {/* board of booked slots — the product, on the wall */}
      <rect x="400" y="96" width="98" height="86" rx="7" fill={PAPER} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={410} y={108 + i * 18} width="20" height="8" rx="4" fill={SAND} />
          <rect
            x={436}
            y={108 + i * 18}
            width="52"
            height="8"
            rx="4"
            fill={i === 3 ? SAND : CORAL}
          />
        </g>
      ))}

      {/* meeting table */}
      <rect x="296" y="246" width="168" height="11" rx="5.5" fill={SAND} />
      <rect x="310" y="257" width="9" height="38" rx="4" fill={SAND} />
      <rect x="441" y="257" width="9" height="38" rx="4" fill={SAND} />
      <rect x="358" y="226" width="40" height="22" rx="3" fill={PAPER} />
      <rect x="350" y="248" width="56" height="5" rx="2.5" fill={PEACH} />

      {/* the two people meeting */}
      <Figure x={282} y={292} s={1.0} body={CORAL} skin={PEACH} pose="greeting" />
      <Figure x={478} y={292} s={1.0} body={PAPER} skin={SAND} pose="greeting" flip badge={TEAL} />

      {/* ---- right booth: quiet ---- */}
      <rect x="560" y="134" width="178" height="161" rx="10" fill={SAND} />
      <rect x="582" y="158" width="80" height="9" rx="4.5" fill={PAPER} opacity="0.9" />
      <rect x="582" y="175" width="48" height="8" rx="4" fill={PAPER} opacity="0.55" />
      <rect x="582" y="248" width="134" height="47" rx="7" fill={PEACH} />

      {/* aisle traffic, foreground */}
      <Figure x={96} y={382} s={1.4} body={CORAL} skin={SAND} pose="walking" badge={PAPER} />
      <Figure x={222} y={396} s={1.5} body={TEAL} skin={PEACH} pose="walking" badge={CORAL} />
      <Figure x={636} y={388} s={1.45} body={PEACH} skin={SAND} pose="walking" flip badge={TEAL} />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   The five stations, drawn as badges hanging from a cord.
   --------------------------------------------------------------------------- */

type BadgeArt = "person" | "pin" | "list" | "star" | "calendar";

function BadgeGlyph({ kind }: { kind: BadgeArt }) {
  switch (kind) {
    case "person":
      return (
        <g>
          <circle cx="0" cy="-8" r="9" fill={PEACH} />
          <path d="M-14 12 q0 -13 14 -13 q14 0 14 13 z" fill={TEAL} />
        </g>
      );
    case "pin":
      return (
        <g>
          <path d="M0 14 C-11 2 -13 -4 -13 -9 A13 13 0 0 1 13 -9 C13 -4 11 2 0 14 Z" fill={CORAL} />
          <circle cx="0" cy="-9" r="5" fill={PAPER} />
        </g>
      );
    case "list":
      return (
        <g>
          {[-11, -1, 9].map((y, i) => (
            <g key={y}>
              <rect x="-15" y={y} width="7" height="7" rx="2" fill={i === 1 ? CORAL : SAND} />
              <rect x="-4" y={y + 1.5} width="19" height="4.5" rx="2.2" fill={TEAL} opacity={i === 1 ? 1 : 0.4} />
            </g>
          ))}
        </g>
      );
    case "star":
      return (
        <g>
          <path
            d="M0 -15 L4.6 -5.2 L15 -3.9 L7.4 3.4 L9.3 14 L0 9 L-9.3 14 L-7.4 3.4 L-15 -3.9 L-4.6 -5.2 Z"
            fill={CORAL}
          />
        </g>
      );
    case "calendar":
      return (
        <g>
          <rect x="-15" y="-12" width="30" height="26" rx="4" fill={PAPER} stroke={TEAL} strokeWidth="2.5" />
          <rect x="-15" y="-12" width="30" height="8" rx="4" fill={TEAL} />
          <rect x="-10" y="0" width="8" height="5" rx="1.6" fill={CORAL} />
          <rect x="2" y="0" width="8" height="5" rx="1.6" fill={CORAL} />
          <rect x="-10" y="8" width="8" height="5" rx="1.6" fill={CORAL} />
          <rect x="2" y="8" width="8" height="5" rx="1.6" fill={SAND} />
        </g>
      );
  }
}

/** A badge on a clip, tilted a little, as if actually hanging. */
export function HangingBadge({
  kind,
  tilt = 0,
  className = "",
}: {
  kind: BadgeArt;
  tilt?: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 110 136" className={className} aria-hidden="true">
      <g transform={`rotate(${tilt} 55 10)`}>
        {/* cord */}
        <path d={`M55 0 L47 26 M55 0 L63 26`} stroke={SAND} strokeWidth="3.5" fill="none" />
        {/* clip */}
        <rect x="47" y="24" width="16" height="8" rx="3" fill={TEAL} />
        {/* card */}
        <rect x="13" y="30" width="84" height="98" rx="11" fill={PAPER} stroke={SAND} strokeWidth="3" />
        <rect x="13" y="30" width="84" height="15" rx="11" fill={PEACH} />
        <rect x="13" y="38" width="84" height="7" fill={PEACH} />
        <g transform="translate(55 82)">
          <BadgeGlyph kind={kind} />
        </g>
        <rect x="28" y="108" width="54" height="5" rx="2.5" fill={SAND} />
      </g>
    </svg>
  );
}

/** The wordmark: a badge, because that is what the product is called. */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 32" className={className} aria-hidden="true">
      <path d="M14 0 L9 7 M14 0 L19 7" stroke={SAND} strokeWidth="2.6" fill="none" />
      <rect x="9" y="5" width="10" height="5" rx="2" fill={TEAL} />
      <rect x="2" y="9" width="24" height="22" rx="6" fill={CORAL} />
      <circle cx="14" cy="17" r="4" fill={PAPER} />
      <path d="M7 28 q0 -6 7 -6 q7 0 7 6 z" fill={PAPER} />
    </svg>
  );
}
