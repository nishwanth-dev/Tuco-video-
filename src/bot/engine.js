import { TOPICS } from './kb.js';
import { EXAMPLES } from './examples.js';

// ---- text clean-up: lowercase, drop punctuation, map everyday and Hinglish words onto the words the topics use ----
const STOP = new Set('a an the i me my we you your our is are am was be it its this that these those to of in on at for from with by and or but so as do does did can could would should will shall may might please pls want wanna need like how what when where why which who whom there here some any just also very really tell show explain steps step way kaise kese kya kyu kyun hai ho hain h ka ki ke ko se me mein par pe karna karne karu karun karein kare kar'.split(' '));
const SYN = {
  clip: 'video', clips: 'video', reel: 'video', reels: 'video', film: 'video', films: 'video', vid: 'video', vids: 'video', movie: 'video', youtube: 'video',
  photo: 'poster', photos: 'poster', picture: 'poster', pic: 'poster', image: 'poster', thumbnail: 'poster', thumbnails: 'poster', cover: 'poster',
  item: 'product', items: 'product', sku: 'product', goods: 'product',
  website: 'store', site: 'store', shopify: 'store', webpage: 'store', page: 'page',
  phone: 'mobile', phones: 'mobile', android: 'mobile', iphone: 'mobile', laptop: 'desktop', computer: 'desktop', pc: 'desktop', mac: 'desktop',
  round: 'corners', rounded: 'corners', curve: 'corners', curves: 'corners', curved: 'corners', corner: 'corners', radius: 'corners', circle: 'corners', pill: 'corners',
  bigger: 'size', smaller: 'size', big: 'size', small: 'size', large: 'size', huge: 'size', tiny: 'size', tall: 'size', wide: 'size', height: 'size', width: 'size', resize: 'size', dimensions: 'size', chota: 'size', chhota: 'size', bada: 'size', bara: 'size',
  remove: 'delete', erase: 'delete', trash: 'delete', bin: 'delete', hatao: 'delete', hata: 'delete', delet: 'delete',
  publish: 'live', activate: 'live', release: 'live',
  enable: 'on', disable: 'off', pause: 'off', stop: 'off',
  upload: 'upload', uploading: 'upload', uploded: 'upload', linking: 'tag', tagging: 'tag', tagged: 'tag',
  create: 'create', make: 'create', build: 'create', banao: 'create', banana: 'create', bana: 'create', setup: 'create',
  add: 'add', insert: 'add', put: 'add', place: 'add', paste: 'add', daal: 'add', daalna: 'add', daalne: 'add', dalo: 'add', dalna: 'add', lagao: 'add', lagana: 'add', lagau: 'add', daalu: 'add',
  change: 'change', edit: 'change', modify: 'change', update: 'change', customise: 'change', customize: 'change', badlo: 'change', badal: 'change', badalna: 'change', adjust: 'change', tweak: 'change',
  nahi: 'not', nhi: 'not', nai: 'not', dont: 'not', doesnt: 'not', cant: 'not', cannot: 'not', wont: 'not', isnt: 'not', never: 'not', no: 'not',
  dikh: 'show', dikha: 'show', dikhta: 'show', dikhe: 'show', dikhai: 'show', visible: 'show', display: 'show', appear: 'show', appearing: 'show', showing: 'show', shows: 'show', displayed: 'show',
  chal: 'play', chalta: 'play', chalu: 'play', playing: 'play', plays: 'play', raha: '', rahi: '', rahe: '',
  broken: 'problem', issue: 'problem', error: 'problem', bug: 'problem', fail: 'problem', failed: 'problem', failing: 'problem', wrong: 'problem', stuck: 'problem', crash: 'problem', fix: 'problem', trouble: 'problem', problem: 'problem',
  quick: 'fast', quickly: 'fast', faster: 'fast', speed: 'fast', slow: 'fast', lag: 'fast', laggy: 'fast', heavy: 'fast', optimise: 'fast', optimize: 'fast', compress: 'fast', shrink: 'fast', reduce: 'fast',
  stats: 'analytics', statistics: 'analytics', numbers: 'analytics', report: 'analytics', reports: 'analytics', metrics: 'analytics', views: 'analytics', performance: 'analytics', insights: 'analytics',
  money: 'sales', revenue: 'sales', earnings: 'sales', orders: 'sales', order: 'sales', purchase: 'sales', purchases: 'sales',
  code: 'embed', snippet: 'embed', script: 'embed', install: 'embed', installation: 'embed',
  password: 'token', passcode: 'token', login: 'signin', 'log': 'signin', signin: 'signin', signup: 'signin', logout: 'signin', signout: 'signin',
  save: 'save', saved: 'save', saving: 'save',
  instagram: 'instagram', insta: 'instagram', ig: 'instagram',
  whatmore: 'whatmore', migrate: 'whatmore', migration: 'whatmore', switch: 'whatmore', transfer: 'whatmore', shift: 'whatmore', replace: 'whatmore', move: 'whatmore',
  collections: 'collection', categories: 'collection', category: 'collection',
  widgets: 'widget', blocks: 'widget', block: 'widget', section: 'section', sections: 'section',
  videos: 'video', products: 'product', posters: 'poster', buttons: 'button', colours: 'color', colors: 'color', colour: 'color', fonts: 'font',
  nothing: 'empty', blank: 'empty', missing: 'empty',
  hello: 'help', hi: 'help', hey: 'help', namaste: 'help', helpp: 'help', hlp: 'help',
};
// Trim a common ending only when a real word stem (4+ letters) is left, so 'embed' and 'speed' stay whole.
const lightStem = (w) => (w.length > 5 && /(ing|ed)$/.test(w) && w.replace(/(ing|ed)$/, '').length >= 4 ? w.replace(/(ing|ed)$/, '') : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

// Everyday multi-word phrasings, rewritten into the plain words the topics use before anything else happens.
const PHRASES = [
  [/back(ing)? ?up\b/g, ' backup '],
  [/you ?tube|yt video/g, ' youtube '],
  [/throw(ing)? (it |them )?away|get(ting)? rid of|take (it |them )?down|discard|dont want (to see )?(it|this|these).*anymore|no longer need/g, ' delete remove '],
  [/(hide|put away|keep).{0,30}(might|may|could|maybe) need.{0,12}(later|again)|undo (a )?delete|restore (a |an )?(deleted|archived)/g, ' archive restore '],
  [/turn(ed|ing)? (it |this |the \w+ )?off|switch(ed|ing)? (it |this |the \w+ )?off|stop showing|take (it )?off( the)? (site|store|website)|temporar(il)?y (stop|hide)/g, ' disable widget off '],
  [/turn(ed|ing)? (it |this |the \w+ )?(back )?on|switch(ed|ing)? (it |this |the \w+ )?(back )?on/g, ' enable widget on '],
  [/go(ing)? (live|public)|make (it )?(public|visible)|(world|people|customers|shoppers|everyone) (can|could|to) see|visible to (everyone|customers)|show(ing)? as (a )?draft|draft status/g, ' publish live draft '],
  [/look and feel|design settings|branding|brand (look|style)|style (of )?(the )?widgets?|match (the )?(widget )?to (our )?brand/g, ' customize color font look '],
  [/(how )?(large|big|heavy|long) (can|should|must)\b|recommended (video )?size|what size should|size limit|file size|cap on/g, ' maximum limit size '],
  [/(pull|bring|get|fetch|import|sync|copy|connect)\b.{0,25}\b(insta(gram)?|meta|ig)\b|\b(insta(gram)?|meta)\b.{0,25}\b(posts?|reels?|videos?|account)\b|every monday/g, ' instagram reels sync '],
  [/what (does|do) the .{0,12}button says?|change what .{0,20}says|button says|text (of|on) (the )?(buy|shop|red|yellow)? ?button|red button/g, ' button text shop now '],
  [/plan(ning)? (videos?|content)|festive|festival|diwali|sale season|go live time|auto(matically)? (remove|hide|expire)|next month|start (and|or) end|until (a )?date|expire/g, ' schedule start end date '],
  [/how many (shoppers|people|customers|users|visitors) (watched|viewed|saw)|results of|click and play|watched my/g, ' analytics views stats '],
  [/(change|edit|set).{0,15}width of|width of each|(gap|space|spacing|distance) (between|around)|(bigger|wider|taller|smaller|narrower|thinner|skinny|fatter) (card|tile|box|video)s?|tiles? (are|is) too (skinny|wide|narrow|small|big)/g, ' size gap width tile '],
  [/(round|rounder|square|sharp|curved|curve|pill|circle)\w*\b.{0,20}(card|tile|box|corner|video|thumbnail)s?|(card|tile|box)s?.{0,15}(round|corner|curve)|box ko round/g, ' corners round size tile '],
  [/(hero|top|main|home(page)?) (video|banner)s?.{0,40}(covers?|takes?|fills?|whole|entire|full) (the )?(whole |entire |full )?(screen|page|phone)|too (short|tall)/g, ' banner size height '],
  [/only (on|for|in) (the )?(\w+ ){0,3}(page|collection)|one page only|specific page/g, ' collection page target only '],
  [/what kinds? of|types? of (video )?(blocks?|widgets?)|kya hota hai|difference between|vs\b|versus/g, ' widget types explain '],
  [/walk me through|set up (a )?new|make (a |the )?(new )?(banner|carousel|story|stories|widget)|add (a )?(video )?(row|section|block)/g, ' create widget '],
  [/only my \d+|hand ?pick|choose (the )?videos?|favou?rite videos?|select which|pick (which|some|specific)/g, ' pick videos widget choose '],
  [/which (html|code)|what (code|html|do i paste)|copy the (code|html)|paste (the )?(code|html)/g, ' embed code paste '],
  [/(per|each|every|separate)( ?)section|section (settings|by section)|theme customi[sz]er|app block|loopy (block|section)/g, ' theme editor section '],
  [/(blank|empty|white) (space|strip|gap|area|section|box)|(kuch|kucch) (dikh|dikha)|only white|nothing (is )?(showing|appearing|there)|(page|home|site|store) (is )?blank/g, ' widget not show empty '],
  [/(wont|doesnt|not|cant|never|nahi) (start|play|load|work)|freezes?|frozen|spinner|buffer(ing)?|not loading|autoplay/g, ' video not play problem '],
  [/still frame|preview (image|picture)|first frame|cover (image|picture)/g, ' poster thumbnail '],
  [/newest on the (left|first)|(put|move|make).{0,25}\b(first|top|last)\b|\bfirst position|drag to (reorder|move)|\bsequence\b/g, ' arrange order reorder '],
  [/untagged|no products?|without products?|came from (instagram|insta)|sort (by )?(oldest|newest)|oldest first|newest first/g, ' filter sort untagged '],
  [/(export|download|copy|save|get).{0,15}(all |of )?(my |the )?(loopy )?(data|everything)/g, ' backup export data '],
  [/(storage|r2|connection|connected|working properly|health|system).{0,20}(ok|working|connected|status|check|red|properly)|something is red|is loopy (connected|working|ok)/g, ' system check health '],
  [/story circles?|story ring|ring color|round (story|thumbnail)/g, ' stories '],
  [/follows? (the )?scroll|corner video|pop ?up video|(bottom|top) (left|right)|stays? in (the )?corner|behind (my )?(bottom )?menu/g, ' spotlight floating corner '],
  [/(cart|buy|checkout|add to cart).{0,25}(nothing|not|doesnt|wont|isnt|cant)|nothing (is )?added|not updating/g, ' cart problem '],
  [/what all can you|what can you answer|what can i ask/g, ' help topics '],
  [/overview of|what is this (tool|platform|app|thing)|tell me about loopy/g, ' what is loopy '],
  [/complete beginner|guide me|where (do|should) i (start|begin)|new here/g, ' getting started first steps '],
  [/different (settings|look|style|size).{0,20}(than|from) (the )?(rest|others?|other)|widget.?specific|only this widget/g, ' one widget override appearance '],
  [/(how|where).{0,20}(login|log in|sign ?in|sign ?out|log ?out)|forgot.{0,10}(login|password|token)|token reset/g, ' sign in token '],
  [/drag (a )?file|drop (a )?file|load (them|it|videos?) into|get (them|it|my videos?) into|insert (a )?clip|add \d+ reels?|add (many|lots of) (videos?|reels?)/g, ' add upload video '],
  [/says r2|r2 (something|error)|attach (a )?file|\d+ ?mb (video|file)|stops (halfway|midway)|progress stops/g, ' upload problem storage file '],
  [/sell (several|many|multiple) products?|buy (the )?\w+ (from|in) (this|the) (reel|video|clip)|mention which (items|products)|which items appear/g, ' tag products video '],
];
const rewrite = (s) => { let t = ' ' + String(s || '').toLowerCase().replace(/[’']/g, '') + ' '; for (const [re, rep] of PHRASES) t = t.replace(re, rep); return t; };

export function tokens(text) {
  text = rewrite(text);
  const raw = text.replace(/[^a-z0-9\s/]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const w0 of raw) {
    let w = SYN[w0] !== undefined ? SYN[w0] : w0;
    if (w === '') continue;
    w = lightStem(w);
    if (SYN[w] !== undefined && SYN[w] !== '') w = lightStem(SYN[w]);
    if (STOP.has(w) || STOP.has(w0)) continue;
    out.push(w);
  }
  return out;
}

// small typo tolerance: a word one edit away from a known word counts as that word
const editClose = (a, b) => {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

// ---- index: every example question, plus each topic's title, keys and answer, becomes a small document ----
// A document is a bag of words plus 3-letter spelling pieces, so "vidoe" still resembles "video".
const feats = (text) => {
  const f = new Map();
  for (const w of tokens(text)) {
    f.set('w:' + w, (f.get('w:' + w) || 0) + 1);
    const p = `^${w}$`;
    for (let i = 0; i + 3 <= p.length; i++) f.set('c:' + p.slice(i, i + 3), (f.get('c:' + p.slice(i, i + 3)) || 0) + 0.35);
  }
  return f;
};
const DOCS = [];
for (const t of TOPICS) {
  DOCS.push({ t, kind: 'title', f: feats(t.title + ' ' + t.keys) });
  for (const ex of EXAMPLES[t.id] || []) DOCS.push({ t, kind: 'example', f: feats(ex) });
}
const DF = new Map();
for (const d of DOCS) for (const k of d.f.keys()) DF.set(k, (DF.get(k) || 0) + 1);
const idf = (k) => Math.log(1 + DOCS.length / (DF.get(k) || 0.5));
const weigh = (f) => { const w = new Map(); let n = 0; for (const [k, v] of f) { const x = (1 + Math.log(v)) * idf(k); w.set(k, x); n += x * x; } return { w, n: Math.sqrt(n) || 1 }; };
for (const d of DOCS) Object.assign(d, weigh(d.f));
const cosine = (a, b) => { let dot = 0; const [s, l] = a.w.size < b.w.size ? [a, b] : [b, a]; for (const [k, v] of s.w) { const o = l.w.get(k); if (o) dot += v * o; } return dot / (a.n * b.n); };

// A few phrasings point so clearly at one topic that they are boosted directly (added to the 0 to 1 similarity).
const BOOSTS = [
  [/\bhow many\b|\bmaximum\b|\bmax\b|\blimit\b|\bquota\b/, 'limits', 0.25],
  [/^(what('?s| is| are| does)|explain|meaning of|difference)\b.*\b(carousel|stories|story|banner|spotlight|floating|gallery)\b/, 'widget-types', 0.5],
  [/\bwhatmore\b/, 'whatmore', 0.2],
  [/\bapp block\b|\bshopify app\b|\bapp embed\b|\bapps? section\b/, 'app-block', 0.3],
  [/\bbutton (text|label|link)\b|\bshop now\b|\bcall to action\b|\bcta\b/, 'cta', 0.2],
  [/\buntagged\b|\bsearch (for )?video|\bfind (a )?video|\bfilter\b/, 'filter', 0.15],
];

export function rank(query) {
  const q = String(query || '');
  const qd = weigh(feats(q));
  const best = new Map();
  for (const d of DOCS) {
    const s = cosine(qd, d) * (d.kind === 'example' ? 1 : 0.85);
    const cur = best.get(d.t.id) || { t: d.t, top: 0, second: 0 };
    if (s > cur.top) { cur.second = cur.top; cur.top = s; } else if (s > cur.second) cur.second = s;
    best.set(d.t.id, cur);
  }
  const ranked = [...best.values()].map((x) => {
    let boost = 0;
    for (const [re, id, add] of BOOSTS) if (x.t.id === id && re.test(q.toLowerCase())) boost += add;
    return { t: x.t, score: (x.top * 0.8 + x.second * 0.2) + boost, hits: 1, coverage: 1 };
  }).filter((x) => x.score > 0.05).sort((a, b) => b.score - a.score);
  return { ranked, tokens: tokens(q) };
}

// ---- intent shortcuts ----
const has = (s, re) => re.test(s.toLowerCase());
export function intent(msg) {
  const m = msg.trim();
  if (!m) return { type: 'empty' };
  if (has(m, /^(hi|hello|hey|hii+|namaste|yo|good (morning|afternoon|evening))\b[\s!.]*$/)) return { type: 'greet' };
  if (has(m, /^(thanks|thank you|thx|ty|great|awesome|perfect|ok thanks|okay thanks|got it|shukriya|dhanyavad)\b[\s!.]*$/)) return { type: 'thanks' };
  if (has(m, /\b(check|diagnose|scan|audit|verify|inspect|look at|test)\b.*\b(setup|loopy|everything|my (store|widgets?|videos?|account))\b|\bwhat'?s wrong\b|\bany problems?\b|\bis (everything|loopy) (ok|okay|working|fine)\b/)) return { type: 'diagnose' };
  if (has(m, /^(clear|reset|start over|new chat)\b/)) return { type: 'clear' };
  if (has(m, /\b(browse|list|show|see|view)\b.{0,12}\b(all |the |your )?(topics?|features|categories|menu|everything)\b|^topics?$|^menu$/)) return { type: 'browse' };
  if (has(m, /\b(who are you|what are you|your name)\b/)) return { type: 'about' };
  return { type: 'ask' };
}

// Questions that mention nothing Loopy-related are declined instead of guessed at.
const DOMAIN_WORDS = ('change look system check health connected work works set make video reel clip widget carousel banner stories story spotlight floating gallery product tag poster thumbnail upload store theme section collection page button cart sales order analytics instagram whatmore loopy token backup size corner round color font embed code shopify draft live publish archive delete schedule mobile desktop tile box card gap width height shape fit crop curve circle pill customize setting login sign admin storage r2 id wgt mp4 media homepage home speed slow fast load compress import export webhook hide show play spinner blank empty cta shoppers customers views watch stats embed schedule');
const DOMAIN = new Set(tokens(DOMAIN_WORDS));
const onTopic = (q) => tokens(q).some((w) => DOMAIN.has(w));

export function answer(msg) {
  if (!onTopic(msg)) return { kind: 'unknown', options: [] };
  const { ranked, tokens: toks } = rank(msg);
  const top = ranked[0];
  if (!top || top.score < 0.3) return { kind: 'unknown', options: ranked.slice(0, 3).map((r) => r.t) };
  const second = ranked[1];
  // two close topics: answer with the best one and offer the other
  const related = ranked.slice(1, 4).filter((r) => r.score >= top.score * 0.75).map((r) => r.t);
  return { kind: 'topic', topic: top.t, related, tokens: toks, confident: !second || top.score >= second.score * 1.25 };
}

// ---- look at the user's own Loopy and report problems, with the page that fixes each one ----
export function diagnose({ videos = [], widgets = [], settings, health }) {
  const issues = [], ok = [];
  const add = (level, text, go) => (level === 'ok' ? ok : issues).push({ level, text, go });
  const live = videos.filter((v) => v.status === 'live' && !v.archived);
  const tagged = live.filter((v) => v.products.length);
  if (!videos.length) add('bad', 'You have no videos yet. Add one on the Videos page (Add Media).', 'videos');
  else add('ok', `${videos.length} video${videos.length === 1 ? '' : 's'} added.`);
  if (videos.length && !live.length) add('bad', 'No video is live yet, so nothing can show on your store. Open a video and set Status to live.', 'videos');
  else if (live.length) add('ok', `${live.length} live video${live.length === 1 ? '' : 's'}.`);
  if (live.length && !tagged.length) add('warn', 'None of your live videos has a product tagged. Widgets set to "all tagged videos" will stay empty. Use Tag Products.', 'videos');
  const heavy = live.filter((v) => v.size > 15 * 1048576);
  if (heavy.length) add('warn', `${heavy.length} live video${heavy.length === 1 ? ' is' : 's are'} over 15 MB, which slows your pages. Shrink ${heavy.length === 1 ? 'it' : 'them'} (see "Make videos load faster").`, 'videos');
  const drafts = videos.filter((v) => v.status === 'draft' && !v.archived);
  if (drafts.length) add('info', `${drafts.length} video${drafts.length === 1 ? ' is' : 's are'} still a draft, so ${drafts.length === 1 ? 'it is' : 'they are'} not on your store.`, 'videos');
  if (!widgets.length) add('bad', 'You have no widgets yet. Create one on Homepage, Product Pages, Collection Pages or Pages.', 'w:home');
  else add('ok', `${widgets.length} widget${widgets.length === 1 ? '' : 's'} created.`);
  for (const w of widgets) {
    const route = 'w:' + w.page;
    if (!w.enabled) add('warn', `Widget "${w.name}" (${w.id}) is switched off.`, route);
    if (w.scope === 'custom' && w.videoIds.length) {
      const liveIds = new Set(live.map((v) => v.id));
      const usable = w.videoIds.filter((id) => liveIds.has(id)).length;
      if (!usable) add('bad', `Widget "${w.name}" (${w.id}) has picked videos, but none of them is live.`, route);
      else if (usable < w.videoIds.length) add('info', `Widget "${w.name}": ${w.videoIds.length - usable} picked video${w.videoIds.length - usable === 1 ? ' is' : 's are'} not live and will be skipped.`, route);
    } else if (w.scope === 'custom') add('bad', `Widget "${w.name}" (${w.id}) is set to Pick videos but none are picked.`, route);
    else if (w.page === 'home' && !live.some((v) => v.placements.includes('home') || !v.placements.length)) add('warn', `Widget "${w.name}" shows homepage videos, but no live video is set to show on the Homepage.`, 'videos');
    if (w.page === 'collection' && !w.collectionHandles.length && w.enabled) add('info', `Widget "${w.name}" is not limited to a collection, so it shows on every collection page.`, route);
  }
  if (health) {
    for (const [name, c] of Object.entries(health.checks || {})) {
      if (c.ok) continue;
      if (name === 'storage') add('bad', 'Loopy storage (R2) is not enabled, so file uploads and Instagram copying cannot work yet.', 'integrations');
      else if (name === 'tables') add('bad', c.note, 'integrations');
      else if (name === 'database' || name === 'store') add('bad', `${name === 'store' ? 'Store products' : 'Database'}: ${c.note}`, 'integrations');
      else add('info', `${name === 'orders' ? 'Sales tracking' : name === 'instagram' ? 'Instagram sync' : name}: ${c.note}`, 'integrations');
    }
  } else add('info', 'I could not read the system check just now.', 'integrations');
  return { issues, ok };
}
