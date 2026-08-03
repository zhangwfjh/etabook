/**
 * Emoji shortcode resolver — shared by the export serializer and the
 * live-preview widget so `:smile:` renders identically everywhere.
 *
 * Covers the common GitHub shortcodes. Unknown shortcodes fall back to the
 * literal `:name:` text (never silently dropped). Characters are stored as
 * literal UTF-8 so there are no codepoint-escape mistakes.
 */

const EMOJI: Record<string, string> = {
  '+1': '👍', '-1': '👎', '100': '💯',
  smile: '😄', laugh: '😆', smiley: '😃', blush: '😊',
  wink: '😉', joy: '😂', rofl: '🤣', relaxed: '☺️',
  grin: '😁', smirk: '😏', heart_eyes: '😍', kissing_heart: '😘',
  kissing: '😗', kissing_closed_eyes: '😚', kissing_smiling_eyes: '😙',
  stuck_out_tongue: '😛', stuck_out_tongue_winking_eye: '😜',
  stuck_out_tongue_closed_eyes: '😝', money_mouth: '🤑',
  neutral_face: '😐', expressionless: '😑', no_mouth: '😶',
  rolling_eyes: '🙄', smirk_cat: '😺', scream: '😱',
  flushed: '😳', disappointed: '😞', worried: '😟',
  angry: '😠', rage: '😡', pensive: '😔', confused: '😕',
  persevere: '😣', weary: '😩', triumphant: '😤',
  open_mouth: '😮', cry: '😢', sob: '😭', sweating: '😓',
  sweat: '😓', sleepy: '😪', sleeping: '😴', mask: '😷',
  dizzy: '💫', astonished: '😲', frowning: '☹️',
  confounded: '😖', slight_smile: '🙂', upside_down: '🙃',
  thinking: '🤔', zipper_mouth: '🤐', nerd: '🤓',
  sunglasses: '😎', star_struck: '🤩', clap: '👏',
  wave: '👋', thumbsup: '👍', thumbsdown: '👎',
  point_up: '☝️', point_down: '👇', point_left: '👈', point_right: '👉',
  ok_hand: '👌', v: '✌️', raised_hands: '🙌', pray: '🙏',
  handshake: '🤝', muscle: '💪', ear: '👂', eye: '👁️',
  eyes: '👀', brain: '🧠', heart: '❤️', orange_heart: '🧡',
  yellow_heart: '💛', green_heart: '💚', blue_heart: '💙', purple_heart: '💜',
  black_heart: '🖤', broken_heart: '💔', heartpulse: '💗', sparkles: '✨',
  star: '⭐', star2: '🌟', fire: '🔥', boom: '💥',
  alarm_clock: '⏰', hourglass: '⏳', clock12: '🕛',
  checkered_flag: '🏁', crossed_flags: '🎌', flag_white: '🏳️',
  rocket: '🚀', helicopter: '🚁', airplane: '✈️', bullettrain_side: '🚄',
  car: '🚗', taxi: '🚕', bus: '🚌', ambulance: '🚑',
  sun: '☀️', moon: '🌙', cloud: '☁️', umbrella: '☔️',
  zap: '⚡️', snowflake: '❄️', rainbow: '🌈', ocean: '🌊',
  coffee: '☕️', tea: '🍵', beer: '🍺', wine_glass: '🍷',
  fork_and_knife: '🍴', pizza: '🍕', hamburger: '🍔', fries: '🍟',
  apple: '🍎', banana: '🍌', watermelon: '🍉', strawberry: '🍓',
  cake: '🍰', icecream: '🍦', cookie: '🍪',
  book: '📖', books: '📚', pencil: '✏️', memo: '📝', bulb: '💡',
  guitar: '🎸', microphone: '🎤', headphones: '🎧',
  computer: '💻', desktop: '🖥️', phone: '📱', telephone: '☎️',
  mailbox: '📬', email: '✉️', envelope: '✉️',
  heavy_check_mark: '✔️', heavy_multiplication_x: '✖️',
  white_check_mark: '✅', ballot_box_with_check: '☑️',
  x: '❌', negative_squared_cross_mark: '❎',
  question: '❓', grey_question: '❔', grey_exclamation: '❕', exclamation: '❗️',
  bangbang: '‼️', interrobang: '⁉️', part_alternation_mark: '〽️',
  warning: '⚠️', children_crossing: '🚸', no_entry: '⛔️',
  no_entry_sign: '🚫', no_bicycles: '🚳', no_smoking: '🚭',
  copyright: '©️', registered: '®️', tm: '™️',
  information_source: 'ℹ️', m: 'Ⓜ️', name_badge: '📛',
  hash: '#️⃣', asterisk: '*️⃣',
  zero: '0️⃣', one: '1️⃣', two: '2️⃣', three: '3️⃣', four: '4️⃣',
  five: '5️⃣', six: '6️⃣', seven: '7️⃣', eight: '8️⃣', nine: '9️⃣',
  ten: '🔟',
  arrow_up: '⬆️', arrow_down: '⬇️', arrow_left: '⬅️', arrow_right: '➡️',
  arrows_clockwise: '🔄', arrows_counterclockwise: '🔁',
  recycle: '♻️', anchor: '⚓️', gear: '⚙️', gem: '💎',
  gift: '🎁', balloon: '🎈', tada: '🎉', confetti_ball: '🎊',
  trophy: '🏆', medal: '🏅', ribbon: '🎗️',
  stopwatch: '⏱️', thermometer: '🌡️', weight: '⚖️'
}

/** Resolve a `:shortcode:` name to its glyph, or return the original `:name:`. */
export function resolveEmoji(name: string): string {
  return EMOJI[name] ?? `:${name}:`
}
