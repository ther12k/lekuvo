/**
 * Original, code-native Lekuvo artwork. No images, fonts, filters or requests.
 * Each instance receives its own gradient / clipping IDs through `prefix`.
 */
export function createArtwork(prefix = 'instance') {
  const ns = `lekuvo-${String(prefix).replace(/[^a-zA-Z0-9_-]/g, '') || 'instance'}`;
  const ref = (name) => `${ns}-${name}`;
  return `<svg class="lekuvo-art" viewBox="0 0 320 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${ref('blue')}" x1="140" y1="70" x2="235" y2="262" gradientUnits="userSpaceOnUse"><stop stop-color="#A1B8FF"/><stop offset=".38" stop-color="#6389F5"/><stop offset="1" stop-color="#3454C9"/></linearGradient>
    <linearGradient id="${ref('face')}" x1="174" y1="75" x2="241" y2="185" gradientUnits="userSpaceOnUse"><stop stop-color="#91ACFF"/><stop offset=".5" stop-color="#5E82EE"/><stop offset="1" stop-color="#4063D6"/></linearGradient>
    <linearGradient id="${ref('tail')}" x1="53" y1="145" x2="123" y2="261" gradientUnits="userSpaceOnUse"><stop stop-color="#9EB6FF"/><stop offset=".38" stop-color="#5D80EC"/><stop offset="1" stop-color="#3652C3"/></linearGradient>
    <linearGradient id="${ref('butter')}" x1="156" y1="164" x2="192" y2="262" gradientUnits="userSpaceOnUse"><stop stop-color="#FFF3B7"/><stop offset=".58" stop-color="#FFE18A"/><stop offset="1" stop-color="#F5C65B"/></linearGradient>
    <linearGradient id="${ref('eye')}" x1="169" y1="105" x2="199" y2="159" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFDF2"/><stop offset="1" stop-color="#F1E7D2"/></linearGradient>
    <clipPath id="${ref('near-eye')}"><ellipse cx="179" cy="129" rx="30" ry="31" transform="rotate(-12 179 129)"/></clipPath>
    <clipPath id="${ref('far-eye')}"><ellipse cx="263" cy="111" rx="20" ry="26" transform="rotate(-19 263 111)"/></clipPath>
    <clipPath id="${ref('compact-eye')}"><ellipse cx="212" cy="137" rx="31" ry="29" transform="rotate(-10 212 137)"/></clipPath>
  </defs>

  <g class="full-art">
    <ellipse class="ground" cx="159" cy="276" rx="114" ry="8" fill="#293B82" opacity=".10"/>
    <g class="character">
      <g class="tail">
        <!-- A stroked spiral leaves its center genuinely open to the background. -->
        <path class="tail-outline" d="M148 244C113 272 56 265 43 228C27 185 52 145 91 145C127 145 151 171 145 201C139 232 108 246 85 228C64 212 72 184 92 181C102 179 111 182 113 189" stroke="url(#${ref('tail')})" stroke-width="32" stroke-linecap="round"/>
        <path d="M145 248C112 272 61 262 49 226C36 189 58 154 92 154C122 154 140 176 136 201C132 226 108 236 90 222C75 210 81 190 95 190C101 190 106 191 108 195" stroke="url(#${ref('butter')})" stroke-width="17" stroke-linecap="round"/>
        <path d="M39 204C36 177 55 150 82 145" stroke="#BCD0FF" stroke-width="5" stroke-linecap="round" opacity=".6"/>
      </g>

      <g class="torso">
        <path d="M127 169C112 172 106 161 112 152C116 146 124 147 130 150C123 138 129 127 138 129C145 130 148 136 150 142C155 134 167 135 171 145L185 174Z" fill="url(#${ref('blue')})"/>
        <path d="M150 151C121 162 115 188 122 222C119 248 135 267 167 266C194 268 221 257 225 235C231 205 213 174 189 161Z" fill="url(#${ref('blue')})"/>
        <path d="M183 165C185 184 170 194 162 211C153 230 154 251 168 265C193 266 214 254 219 235C225 214 212 183 197 171Z" fill="url(#${ref('butter')})"/>
        <path d="M137 176C126 189 128 214 132 221" stroke="#93AEFF" stroke-width="6" stroke-linecap="round" opacity=".5"/>
        <g class="back-foot"><path d="M209 248C220 246 233 253 232 262C232 268 226 271 211 269L198 267C196 258 200 251 209 248Z" fill="url(#${ref('face')})"/><path d="M221 258L222 266" stroke="#3452B9" stroke-width="2.5" stroke-linecap="round"/></g>
        <g class="front-foot"><path d="M141 250C152 245 170 250 174 260C177 269 168 274 152 272C137 273 130 267 133 259C134 255 137 252 141 250Z" fill="url(#${ref('face')})"/><path d="M149 260L150 270M161 260L162 270" stroke="#3554BA" stroke-width="2.5" stroke-linecap="round"/></g>
      </g>

      <g class="arm-rest"><path d="M213 208C223 210 229 219 237 224C246 224 252 229 250 235C249 243 237 246 231 241C217 237 208 225 205 217Z" fill="url(#${ref('blue')})"/><path d="M240 232L244 239" stroke="#3755BE" stroke-width="2.5" stroke-linecap="round"/></g>
      <g class="arm-gesture"><path d="M213 217C224 223 233 215 240 201C240 194 241 184 247 179C250 177 254 179 253 185L252 191C260 179 266 175 270 179C274 183 265 190 264 193C276 186 281 189 280 194C279 201 266 207 259 208C254 225 240 239 226 238C216 237 208 229 207 221Z" fill="url(#${ref('blue')})"/><path d="M246 202C251 198 257 198 260 201" stroke="#3655BC" stroke-width="2.5" stroke-linecap="round"/></g>
      <g class="arm-thinking"><path d="M210 221C219 224 226 217 229 207L232 187C230 181 232 176 237 176C242 176 243 180 242 185C248 179 252 182 251 187C250 193 246 196 241 198C243 219 232 237 220 237C212 236 207 231 207 225Z" fill="url(#${ref('blue')})"/></g>
      <g class="arm-front"><path d="M151 203C133 211 129 226 134 244C128 251 134 264 142 264C148 264 149 260 150 255C153 266 161 267 166 262C171 257 166 248 158 244C152 234 157 224 166 219C164 213 158 207 151 203Z" fill="url(#${ref('blue')})"/><path d="M146 249C149 252 149 258 147 261" stroke="#3758C4" stroke-width="2.7" stroke-linecap="round"/></g>

      <g class="head">
        <path d="M137 131C131 110 141 89 159 88C157 74 166 66 179 70C191 74 198 86 216 88C238 80 255 82 264 94C284 98 296 115 294 134C293 155 268 175 236 181C195 188 149 169 137 131Z" fill="url(#${ref('face')})"/>
        <path d="M151 156C176 174 220 175 253 162C270 155 283 147 293 133C295 153 271 175 236 181C205 187 171 177 151 156Z" fill="url(#${ref('butter')})"/>
        <path d="M164 85C174 80 184 87 190 92" stroke="#B5C9FF" stroke-width="5" stroke-linecap="round" opacity=".55"/>
        <ellipse cx="262" cy="110" rx="24" ry="30" transform="rotate(-19 262 110)" fill="url(#${ref('blue')})"/>
        <ellipse cx="178" cy="126" rx="36" ry="37" transform="rotate(-12 178 126)" fill="url(#${ref('blue')})"/>

        <g class="eye-open near-eye-open" clip-path="url(#${ref('near-eye')})">
          <ellipse cx="179" cy="129" rx="30" ry="31" transform="rotate(-12 179 129)" fill="url(#${ref('eye')})"/>
          <g class="pupil-look"><ellipse class="pupil" cx="190" cy="128" rx="13" ry="18" fill="#17234F"/><ellipse class="eye-glint" cx="194" cy="120" rx="4" ry="3" fill="white" opacity=".93"/></g>
          <path class="dizzy-pupil" d="M181 143C165 137 170 115 184 114C199 113 205 131 195 138C187 144 178 136 181 129C183 124 190 126 189 131" stroke="#233268" stroke-width="4.5" stroke-linecap="round"/>
          <path class="lid-lazy" d="M144 92H215V124C194 112 169 112 144 125Z" fill="url(#${ref('face')})"/><path class="lid-lazy lid-line" d="M148 124C169 112 191 111 209 121" stroke="#3656BE" stroke-width="2" stroke-linecap="round"/>
          <path class="lid-focus" d="M144 92H215V116C191 107 168 110 144 126Z" fill="url(#${ref('face')})"/><path class="lid-focus lid-line" d="M147 125C167 112 190 108 210 115" stroke="#3656BE" stroke-width="2" stroke-linecap="round"/>
        </g>
        <g class="eye-open far-eye-open" clip-path="url(#${ref('far-eye')})">
          <ellipse cx="263" cy="111" rx="20" ry="26" transform="rotate(-19 263 111)" fill="url(#${ref('eye')})"/>
          <g class="pupil-look"><ellipse class="pupil" cx="270" cy="109" rx="10" ry="15" fill="#17234F"/><ellipse class="eye-glint" cx="272" cy="101" rx="3" ry="2.5" fill="white" opacity=".93"/></g>
          <path class="dizzy-pupil" d="M261 123C249 119 249 102 261 100C273 98 279 112 272 118C267 123 260 118 262 112C264 108 269 110 268 113" stroke="#233268" stroke-width="3.5" stroke-linecap="round"/>
          <path class="lid-lazy" d="M238 77H288V108C273 96 257 95 238 108Z" fill="url(#${ref('face')})"/><path class="lid-lazy lid-line" d="M241 106C258 96 273 98 285 109" stroke="#3656BE" stroke-width="2" stroke-linecap="round"/>
          <path class="lid-focus" d="M238 77H288V101C273 91 255 95 238 109Z" fill="url(#${ref('face')})"/><path class="lid-focus lid-line" d="M241 107C255 95 272 93 285 102" stroke="#3656BE" stroke-width="2" stroke-linecap="round"/>
        </g>
        <g class="closed-eyes" stroke="#253669" stroke-width="4" stroke-linecap="round"><path d="M153 132C168 147 187 148 201 135"/><path d="M247 115C258 126 272 128 282 119"/></g>
        <g class="happy-eyes" stroke="#253669" stroke-width="4.5" stroke-linecap="round"><path d="M154 133C166 117 187 116 200 130"/><path d="M248 114C255 101 271 102 280 114"/></g>

        <path class="mouth-neutral" d="M220 151C233 159 247 153 253 146" stroke="#253669" stroke-width="3.7" stroke-linecap="round"/>
        <ellipse class="mouth-surprised" cx="239" cy="157" rx="8" ry="10" fill="#243467"/>
        <path class="mouth-thinking" d="M230 156C236 154 243 154 247 151" stroke="#253669" stroke-width="3.5" stroke-linecap="round"/>
        <g class="mouth-happy"><path d="M220 148C230 154 244 151 255 143C254 160 238 169 227 161C223 158 221 153 220 148Z" fill="#223166"/><path d="M231 160C235 155 242 154 247 157C242 163 236 164 231 160Z" fill="#EA9D9C"/></g>
        <path class="mouth-sleep" d="M229 157C232 159 236 159 239 157" stroke="#253669" stroke-width="3" stroke-linecap="round"/>
        <circle cx="282" cy="137" r="2.1" fill="#3455BC"/>
      </g>
    </g>
  </g>

  <!-- A dedicated small-size silhouette keeps the tail + eye identity at 24–32px. -->
  <g class="compact-art">
    <g class="compact-character">
      <g class="compact-tail"><path d="M166 219C139 255 80 251 59 221C35 189 51 148 88 142C121 136 146 161 138 188C133 209 109 219 94 205C82 194 89 177 102 177C108 177 112 181 112 185" stroke="#4D72DD" stroke-width="31" stroke-linecap="round"/><path d="M160 223C133 250 83 243 66 217C47 188 62 155 91 151C119 147 137 167 130 188C126 205 109 210 99 201C91 194 95 184 104 186" stroke="#FFE18A" stroke-width="17" stroke-linecap="round"/></g>
      <g class="compact-head"><path d="M137 161C128 141 136 117 154 111C151 97 164 91 175 99L184 108C212 96 243 107 256 126C271 129 281 139 277 153C269 180 226 190 185 183C164 180 148 175 137 161Z" fill="url(#${ref('face')})"/><path d="M149 165C187 180 241 181 274 150C271 175 234 192 189 184C168 181 156 175 149 165Z" fill="#FFE18A"/>
        <g class="eye-open compact-eye-open" clip-path="url(#${ref('compact-eye')})"><ellipse cx="212" cy="137" rx="31" ry="29" transform="rotate(-10 212 137)" fill="#FFF9E9"/><g class="pupil-look"><ellipse class="pupil" cx="225" cy="136" rx="13" ry="17" fill="#192853"/><circle class="eye-glint" cx="229" cy="129" r="3.5" fill="#FFF"/></g><path class="dizzy-pupil" d="M208 152C193 148 194 128 208 125C222 123 231 140 221 147C215 152 206 147 208 141C209 136 216 137 216 141" stroke="#233268" stroke-width="4.5" stroke-linecap="round"/><path class="lid-lazy" d="M176 104H251V134C226 121 200 120 176 136Z" fill="#6588EE"/><path class="lid-focus" d="M176 104H251V128C224 117 201 122 176 138Z" fill="#6588EE"/></g>
        <path class="closed-eyes" d="M185 139C201 153 220 154 237 139" stroke="#243568" stroke-width="5" stroke-linecap="round"/><path class="happy-eyes" d="M187 140C202 123 222 125 237 139" stroke="#243568" stroke-width="5" stroke-linecap="round"/>
        <path class="mouth-neutral" d="M249 161C255 164 263 160 267 155" stroke="#243568" stroke-width="3" stroke-linecap="round"/><ellipse class="mouth-surprised" cx="257" cy="164" rx="5" ry="6" fill="#243568"/><path class="mouth-thinking" d="M250 163L260 159" stroke="#243568" stroke-width="3" stroke-linecap="round"/><path class="mouth-happy" d="M248 157C254 161 261 157 268 152C266 164 252 170 248 157Z" fill="#243568"/><path class="mouth-sleep" d="M250 163L257 163" stroke="#243568" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>
  </g>

  <g class="accessories" stroke-linecap="round" stroke-linejoin="round">
    <g class="listening-signal" stroke="#6A8EFA" stroke-width="3.5"><path d="M297 106C303 113 303 122 299 128"/><path d="M304 98C314 111 314 124 307 136"/></g>
    <g class="music-notes" fill="#4667D4"><path d="M103 69V51L120 47V63C120 70 110 73 108 67C107 64 110 61 115 61V54L108 56V71C108 78 98 81 96 75C95 72 98 69 103 69Z"/><path d="M274 44V29L286 26V32L279 34V45C278 51 269 52 268 47C267 44 270 42 274 44Z"/></g>
    <g class="sleep-z" stroke="#4667B8" stroke-width="3.5"><path class="z-one" d="M268 70H278L267 81H279"/><path class="z-two" d="M284 46H299L283 62H300"/></g>
    <g class="thinking-dots" fill="#7E9DF7"><circle class="thought-one" cx="239" cy="56" r="3.5"/><circle class="thought-two" cx="252" cy="48" r="4.5"/><circle class="thought-three" cx="269" cy="43" r="6"/></g>
    <g class="dizzy-stars" fill="#F3C95E"><path class="star-one" d="M122 59L126 68L136 69L128 75L130 85L122 80L113 85L115 75L107 69L117 68Z"/><path class="star-two" d="M275 47L278 54L286 55L280 60L282 68L275 64L268 68L270 60L264 55L272 54Z"/></g>
    <g class="success-symbol"><circle cx="271" cy="57" r="15" fill="#E9F2FF"/><path d="M263 57L269 63L280 50" stroke="#4166D5" stroke-width="4"/><path d="M117 77V88M111.5 82.5H122.5M293 87V95M289 91H297" stroke="#F3CA61" stroke-width="3.5"/></g>
    <g class="alert-symbol"><path d="M277 41C279 36 285 36 287 41L301 66C303 71 301 76 295 76H269C263 76 261 71 264 66Z" fill="#FFE18A"/><path d="M282 48V59" stroke="#25376F" stroke-width="4"/><circle cx="282" cy="67" r="2.2" fill="#25376F"/></g>
  </g>
</svg>`;
}

/** Styling belongs entirely to the component's shadow root. */
export const MASCOT_CSS = `
:host{display:inline-block;width:var(--lekuvo-size,160px);vertical-align:middle;contain:layout style;line-height:0;isolation:isolate}
.stage{display:grid;place-items:center;width:100%;aspect-ratio:32/30}
.lekuvo-art{display:block;width:100%;height:100%;overflow:visible}
.lekuvo-art *{transform-box:view-box}
/* Public palette: CSS overrides the SVG's fallback paint without changing geometry.
   Highlights / secondary shade stops stay fixed to preserve the illustrated finish. */
.lekuvo-art linearGradient[id$="-blue"] stop:nth-of-type(1),.lekuvo-art linearGradient[id$="-face"] stop:nth-of-type(1),.lekuvo-art linearGradient[id$="-tail"] stop:nth-of-type(1){stop-color:var(--lekuvo-blue-light,#87A3FF)}
.lekuvo-art linearGradient[id$="-blue"] stop:nth-of-type(2),.lekuvo-art linearGradient[id$="-face"] stop:nth-of-type(2),.lekuvo-art linearGradient[id$="-tail"] stop:nth-of-type(2){stop-color:var(--lekuvo-blue,#4361D7)}
.lekuvo-art linearGradient[id$="-blue"] stop:nth-of-type(3),.lekuvo-art linearGradient[id$="-face"] stop:nth-of-type(3),.lekuvo-art linearGradient[id$="-tail"] stop:nth-of-type(3){stop-color:var(--lekuvo-blue-shadow,#2B409A)}
.lekuvo-art linearGradient[id$="-butter"] stop:nth-of-type(2){stop-color:var(--lekuvo-butter,#FFE4A0)}
.lekuvo-art linearGradient[id$="-eye"] stop:nth-of-type(1){stop-color:var(--lekuvo-eye,#FFF7E8)}
.ground,.pupil,.mouth-surprised,.mouth-happy,.mouth-happy>path:first-of-type{fill:var(--lekuvo-ink,#19253D)}
.closed-eyes,.happy-eyes,.dizzy-pupil,.mouth-neutral,.mouth-thinking,.mouth-sleep{stroke:var(--lekuvo-ink,#19253D)}
.lid-line,.front-foot>path:nth-of-type(2),.back-foot>path:nth-of-type(2),.arm-rest>path:nth-of-type(2),.arm-gesture>path:nth-of-type(2),.arm-front>path:nth-of-type(2){stroke:var(--lekuvo-blue-shadow,#2B409A)}
.head>circle{fill:var(--lekuvo-blue-shadow,#2B409A)}
.compact-tail>path:first-of-type{stroke:var(--lekuvo-blue,#4361D7)}
.compact-tail>path:nth-of-type(2){stroke:var(--lekuvo-butter,#FFE4A0)}
.compact-head>path:nth-of-type(2){fill:var(--lekuvo-butter,#FFE4A0)}
.compact-eye-open>ellipse{fill:var(--lekuvo-eye,#FFF7E8)}
.compact-eye-open>.lid-lazy,.compact-eye-open>.lid-focus{fill:var(--lekuvo-blue,#4361D7)}
.listening-signal{stroke:var(--lekuvo-blue-light,#87A3FF)}
.music-notes{fill:var(--lekuvo-blue,#4361D7)}
.sleep-z{stroke:var(--lekuvo-blue-shadow,#2B409A)}
.thinking-dots{fill:var(--lekuvo-blue-light,#87A3FF)}
.dizzy-stars,.alert-symbol>path:first-of-type{fill:var(--lekuvo-butter,#FFE4A0)}
.alert-symbol>path:nth-of-type(2){stroke:var(--lekuvo-ink,#19253D)}
.alert-symbol>circle{fill:var(--lekuvo-ink,#19253D)}
.success-symbol>circle{fill:var(--lekuvo-eye,#FFF7E8)}
.success-symbol>path:first-of-type{stroke:var(--lekuvo-blue,#4361D7)}
.success-symbol>path:nth-of-type(2){stroke:var(--lekuvo-butter,#FFE4A0)}
.character{transform-origin:170px 262px}
.tail{transform-origin:144px 244px}
.head{transform-origin:202px 166px}
.arm-gesture{transform-origin:216px 221px}
.front-foot{transform-origin:154px 259px}
.back-foot{transform-origin:213px 259px}
.near-eye-open{transform-origin:179px 129px}
.far-eye-open{transform-origin:263px 111px}
.compact-eye-open{transform-origin:212px 137px}
.eye-open{animation:lekuvo-blink 7s ease-in-out infinite}
.pupil-look{transition:transform .22s ease}
.dizzy-pupil,.lid-lazy,.lid-focus,.closed-eyes,.happy-eyes,.mouth-surprised,.mouth-thinking,.mouth-happy,.mouth-sleep,.arm-gesture,.arm-thinking,.compact-art,.accessories>g{display:none}
.compact-character{transform-origin:161px 223px}
.compact-tail{transform-origin:160px 220px}
.compact-head{transform-origin:205px 169px}
:host([variant="compact"]) .full-art{display:none}
:host([variant="compact"]) .compact-art{display:inline}
:host([variant="compact"]) .accessories{transform:translate(3px,30px) scale(.92);transform-origin:160px 150px}

/* Static expressions remain distinct even with every animation disabled. */
:host([data-mood="lazy"]) .lid-lazy{display:inline}
:host([data-mood="lazy"]) .head{transform:rotate(3deg) translateY(3px)}
:host([data-mood="lazy"]) .compact-head{transform:rotate(3deg)}
:host([data-mood="lazy"]) .eye-open{animation-duration:9s}
:host([data-mood="awake"]) .character{animation:lekuvo-breathe 5.4s ease-in-out infinite}
:host([data-mood="awake"]) .pupil-look{animation:lekuvo-glance 8s ease-in-out infinite}
:host([data-mood="wave"]) .arm-rest,:host([data-mood="alert"]) .arm-rest,:host([data-mood="success"]) .arm-rest,:host([data-mood="thinking"]) .arm-rest{display:none}
:host([data-mood="wave"]) .arm-gesture,:host([data-mood="alert"]) .arm-gesture,:host([data-mood="success"]) .arm-gesture{display:inline}
:host([data-mood="wave"]) .arm-gesture{transform:rotate(-7deg);animation:lekuvo-wave 1.65s ease-in-out infinite}
:host([data-mood="wave"]) .head{transform:rotate(-3deg)}
:host([data-mood="wave"]) .compact-head{transform:rotate(-4deg);animation:lekuvo-compact-wave 1.65s ease-in-out infinite}
:host([data-mood="wave"]) .compact-tail{animation:lekuvo-tail-wag 1.65s ease-in-out infinite}
:host([data-mood="listening"]) .listening-signal{display:inline;animation:lekuvo-signal 1.8s ease-in-out infinite}
:host([data-mood="listening"]) .head{transform:rotate(-6deg) translateY(-2px)}
:host([data-mood="listening"]) .compact-head{transform:rotate(-6deg)}
:host([data-mood="listening"]) .pupil-look{transform:translate(3px,-2px)}
:host([data-mood="dance"]) .character,:host([data-mood="dance"]) .compact-character{animation:lekuvo-dance .9s ease-in-out infinite}
:host([data-mood="dance"]) .tail,:host([data-mood="dance"]) .compact-tail{animation:lekuvo-tail-dance .9s ease-in-out infinite}
:host([data-mood="dance"]) .head{animation:lekuvo-head-dance .9s ease-in-out infinite}
:host([data-mood="dance"]) .back-foot{animation:lekuvo-foot-tap .9s ease-in-out infinite}
:host([data-mood="dance"]) .music-notes{display:inline;animation:lekuvo-notes 1.8s ease-in-out infinite}
:host([data-mood="dance"]) .mouth-neutral,:host([data-mood="success"]) .mouth-neutral{display:none}
:host([data-mood="dance"]) .mouth-happy,:host([data-mood="success"]) .mouth-happy{display:inline}
:host([data-mood="sleep"]) .eye-open,:host([data-mood="success"]) .eye-open{display:none}
:host([data-mood="sleep"]) .closed-eyes{display:inline}
:host([data-mood="sleep"]) .mouth-neutral,:host([data-mood="surprised"]) .mouth-neutral,:host([data-mood="thinking"]) .mouth-neutral,:host([data-mood="alert"]) .mouth-neutral{display:none}
:host([data-mood="sleep"]) .mouth-sleep{display:inline}
:host([data-mood="sleep"]) .character{transform:translate(0,12px) scale(1,.94);animation:lekuvo-sleep-breathe 5s ease-in-out infinite}
:host([data-mood="sleep"]) .head{transform:rotate(9deg) translate(3px,7px)}
:host([data-mood="sleep"]) .compact-head{transform:rotate(8deg) translateY(5px)}
:host([data-mood="sleep"]) .sleep-z{display:inline}
:host([data-mood="sleep"]) .z-one{animation:lekuvo-snooze 3.6s ease-in-out infinite}
:host([data-mood="sleep"]) .z-two{animation:lekuvo-snooze 3.6s ease-in-out 1.2s infinite}
:host([data-mood="surprised"]) .mouth-surprised,:host([data-mood="alert"]) .mouth-surprised{display:inline}
:host([data-mood="surprised"]) .head{transform:translateY(-5px) rotate(-3deg)}
:host([data-mood="surprised"]) .compact-head{transform:translateY(-5px) rotate(-3deg)}
:host([data-mood="surprised"]) .pupil{transform-box:fill-box;transform-origin:center;transform:scale(.68)}
:host([data-mood="surprised"]) .eye-glint{display:none}
:host([data-mood="surprised"]) .character{animation:lekuvo-startle .48s ease-out 1}
:host([data-mood="dizzy"]) .pupil-look{display:none}
:host([data-mood="dizzy"]) .dizzy-pupil{display:inline}
:host([data-mood="dizzy"]) .head,:host([data-mood="dizzy"]) .compact-head{transform:rotate(5deg);animation:lekuvo-dizzy 2.3s ease-in-out infinite}
:host([data-mood="dizzy"]) .dizzy-stars{display:inline;animation:lekuvo-stars 2.3s ease-in-out infinite}
:host([data-mood="dizzy"]) .eye-open{animation:none}
:host([data-mood="focus"]) .lid-focus{display:inline}
:host([data-mood="focus"]) .head{transform:translate(3px,3px) rotate(2deg)}
:host([data-mood="focus"]) .pupil-look{transform:translate(1px,3px)}
:host([data-mood="focus"]) .eye-open{animation-duration:10s}
:host([data-mood="thinking"]) .arm-thinking,:host([data-mood="thinking"]) .mouth-thinking,:host([data-mood="thinking"]) .thinking-dots{display:inline}
:host([data-mood="thinking"]) .head,:host([data-mood="thinking"]) .compact-head{transform:rotate(-4deg)}
:host([data-mood="thinking"]) .pupil-look{transform:translate(-3px,-6px)}
:host([data-mood="thinking"]) .thought-one{animation:lekuvo-thought 1.8s ease-in-out infinite}
:host([data-mood="thinking"]) .thought-two{animation:lekuvo-thought 1.8s ease-in-out .2s infinite}
:host([data-mood="thinking"]) .thought-three{animation:lekuvo-thought 1.8s ease-in-out .4s infinite}
:host([data-mood="success"]) .happy-eyes,:host([data-mood="success"]) .success-symbol{display:inline}
:host([data-mood="success"]) .arm-gesture{transform:rotate(-11deg)}
:host([data-mood="success"]) .character,:host([data-mood="success"]) .compact-character{animation:lekuvo-celebrate 1.65s ease-in-out infinite}
:host([data-mood="success"]) .success-symbol{animation:lekuvo-confirm 1.65s ease-in-out infinite;transform-origin:271px 57px}
:host([data-mood="alert"]) .alert-symbol{display:inline;animation:lekuvo-alert 2.2s ease-in-out infinite;transform-origin:282px 57px}
:host([data-mood="alert"]) .arm-gesture{transform:rotate(-10deg)}
:host([data-mood="alert"]) .pupil-look{transform:translate(2px,-2px)}

@keyframes lekuvo-blink{0%,43%,46%,94%,97%,100%{transform:scaleY(1)}44.5%,95.5%{transform:scaleY(.06)}}
@keyframes lekuvo-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes lekuvo-glance{0%,62%,100%{transform:translate(0,0)}68%,77%{transform:translate(-3px,-1px)}84%,91%{transform:translate(1px,0)}}
@keyframes lekuvo-wave{0%,52%,100%{transform:rotate(-7deg)}14%,38%{transform:rotate(-23deg)}26%{transform:rotate(6deg)}}
@keyframes lekuvo-compact-wave{0%,52%,100%{transform:rotate(-4deg)}15%,38%{transform:rotate(-9deg)}26%{transform:rotate(3deg)}}
@keyframes lekuvo-tail-wag{0%,55%,100%{transform:rotate(0)}18%{transform:rotate(-8deg)}36%{transform:rotate(5deg)}}
@keyframes lekuvo-signal{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes lekuvo-dance{0%,100%{transform:rotate(-2deg) translateY(0)}25%{transform:rotate(0) translateY(-5px)}50%{transform:rotate(2deg) translateY(0)}75%{transform:rotate(0) translateY(-3px)}}
@keyframes lekuvo-tail-dance{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}
@keyframes lekuvo-head-dance{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes lekuvo-foot-tap{0%,45%,100%{transform:translateY(0)}65%,80%{transform:translateY(-6px) rotate(-5deg)}}
@keyframes lekuvo-notes{0%,100%{opacity:.7;transform:translateY(1px)}50%{opacity:1;transform:translateY(-4px)}}
@keyframes lekuvo-sleep-breathe{0%,100%{transform:translate(0,12px) scale(1,.94)}50%{transform:translate(0,10px) scale(1,.945)}}
@keyframes lekuvo-snooze{0%,100%{opacity:.5;transform:translateY(2px)}50%{opacity:1;transform:translateY(-4px)}}
@keyframes lekuvo-startle{0%{transform:translateY(0)}35%{transform:translateY(-9px)}70%{transform:translateY(1px)}100%{transform:translateY(0)}}
@keyframes lekuvo-dizzy{0%,100%{transform:rotate(5deg)}50%{transform:rotate(-5deg)}}
@keyframes lekuvo-stars{0%,100%{transform:translate(-3px,0)}50%{transform:translate(4px,2px)}}
@keyframes lekuvo-thought{0%,100%{opacity:.4;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
@keyframes lekuvo-celebrate{0%,50%,100%{transform:translateY(0)}20%{transform:translateY(-6px)}35%{transform:translateY(1px)}}
@keyframes lekuvo-confirm{0%,55%,100%{transform:scale(1)}22%{transform:scale(1.08)}}
@keyframes lekuvo-alert{0%,30%,100%{transform:rotate(0)}8%{transform:rotate(-6deg)}16%{transform:rotate(6deg)}24%{transform:rotate(-3deg)}}

/* Pausing keeps the current frame. Turning motion off keeps the static mood. */
:host([data-paused]) .lekuvo-art *{animation-play-state:paused!important}
:host([motion="off"]) .lekuvo-art *{animation:none!important;transition:none!important}
@media(prefers-reduced-motion:reduce){:host(:not([motion="on"])) .lekuvo-art *{animation:none!important;transition:none!important}}
`;
