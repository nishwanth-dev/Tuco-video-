import { useEffect, useMemo, useRef, useState } from 'react';
import { saveSettings } from './api.js';
import { Field, Toggle } from './ui.jsx';

const SECTIONS = [
  ['brand', 'Brand Theme Settings', 'carousel'], ['tile', 'Product Tile Config', 'carousel'], ['carousel', 'Carousel Configuration', 'carousel'], ['stories', 'Stories Configuration', 'stories'],
  ['product', 'Product Page Configuration', 'gallery'], ['banner', 'Banner Configuration', 'banner'], ['spotlight', 'Spotlight Configuration', 'spotlight'], ['oos', 'Out of Stock Configuration', 'carousel'],
];
const TILES = [['overlay', 'Overlay', 'Title and price over the video'], ['below', 'Info below', 'Name, price and an Add to cart button under the tile'], ['feed', 'Feed', 'Overlay with a button inside the tile'], ['minimal', 'Minimal', 'Just the video with a small price chip']];
const SAMPLE = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

export default function Customizations({ settings, videos, loadSettings, setError }) {
  const [s, setS] = useState(settings);
  const [sec, setSec] = useState('brand');
  const [device, setDevice] = useState('mobile');
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const set = (k, v) => setS((o) => ({ ...o, [k]: v }));
  const setIn = (g, k, v) => setS((o) => ({ ...o, [g]: { ...o[g], [k]: v } }));
  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async () => { setSaving(true); try { await saveSettings(s); await loadSettings(); } catch (e) { setError(e.message); } setSaving(false); };

  const previewType = SECTIONS.find((x) => x[0] === sec)[2];
  const previewVideos = useMemo(() => {
    const live = videos.filter((v) => v.status === 'live' && !v.archived).slice(0, 6);
    const base = live.length ? live : [1, 2, 3].map((i) => ({ id: 'sample' + i, title: 'Sample reel ' + i, url: SAMPLE, poster: '', products: [{ handle: 'sample', title: 'Kids Face Wash', price: '₹249', image: '' }], views: 1200 * i }));
    return base.map((v) => ({ ...v, products: v.products.length ? v.products : [{ handle: 'sample', title: 'Sample product', price: '₹249', image: '' }] }));
  }, [videos]);

  return (
    <div className="cust">
      <div className="cmenu">
        <h1>Customizations</h1><p className="sub">Control the look and feel of your shoppable videos</p>
        {SECTIONS.map(([id, label]) => <button key={id} className={'cnav' + (id === sec ? ' on' : '')} onClick={() => setSec(id)}>{label}</button>)}
      </div>
      <div className="cform">
        <div className="chead"><h2>{SECTIONS.find((x) => x[0] === sec)[1]}</h2><div className="row">{dirty && <span className="unsaved">Unsaved changes</span>}<button className="btn" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}</button></div></div>
        {sec === 'brand' && <>
          <Field label="Brand Theme Color" hint="Sets the color of buttons and highlights"><Color v={s.brandColor} on={(v) => set('brandColor', v)} /></Field>
          <Field label="Brand Theme Font" hint="Use a font your theme already loads"><input value={s.brandFont} onChange={(e) => set('brandFont', e.target.value)} /></Field>
          <Field label="Theme border" hint="Rounded or squared corners"><Sel v={s.border} on={(v) => set('border', v)} opts={['round', 'square']} /></Field>
          <Field label="Show Video View Count" hint="Displays view count as an overlay"><Toggle on={s.showViews} onChange={(v) => set('showViews', v)} /></Field>
          <Field label="Shop Now button text"><input value={s.shopNowText} onChange={(e) => set('shopNowText', e.target.value)} /></Field>
          <Field label="Add To Cart button" hint="Show Add to cart on tiles and in the player"><Toggle on={s.showAtc} onChange={(v) => set('showAtc', v)} /></Field>
          <Field label="Show Product Price" hint="Under tiles and in the full video view"><Toggle on={s.showPrice} onChange={(v) => set('showPrice', v)} /></Field>
        </>}
        {sec === 'tile' && <>
          <Field label="Cart Icon Click Action" hint="Open the cart drawer, or go to the cart page"><Sel v={s.cartAction} on={(v) => set('cartAction', v)} opts={[['drawer', 'Open Cart Slider'], ['cart_page', 'Go to cart page']]} /></Field>
          <Field label="Product Tile Type" hint="Choose the tile you want to use"><div className="tiles">{TILES.map(([k, l, d]) => <button key={k} className={'tilepick' + (s.tileType === k ? ' on' : '')} onClick={() => set('tileType', k)}><b>{l}</b><span>{d}</span></button>)}</div></Field>
        </>}
        {sec === 'carousel' && <>
          <Field label="Brand Heading Color"><Color v={s.carousel.headingColor} on={(v) => setIn('carousel', 'headingColor', v)} /></Field>
          <Field label="Heading Font Name"><input value={s.carousel.headingFont} placeholder="Same as brand font" onChange={(e) => setIn('carousel', 'headingFont', e.target.value)} /></Field>
          <Field label="Carousel Title Font Weight"><Sel v={s.carousel.headingWeight} on={(v) => setIn('carousel', 'headingWeight', v)} opts={['400', '500', '600', '700', '800']} /></Field>
          <Field label="Video Ordering Format" hint="Order of the carousel videos"><Sel v={s.carousel.ordering} on={(v) => setIn('carousel', 'ordering', v)} opts={[['none', 'none'], ['newest', 'newest first'], ['shuffle', 'shuffle']]} /></Field>
          <Field label="Shuffle Batch Size" hint="Shuffles in batches of this many videos (0 = all)"><input type="number" min="0" value={s.carousel.shuffleBatch} onChange={(e) => setIn('carousel', 'shuffleBatch', Number(e.target.value))} /></Field>
          <Field label="Show Only Tagged Videos" hint="Only videos tagged with products"><Toggle on={s.carousel.onlyTagged} onChange={(v) => setIn('carousel', 'onlyTagged', v)} /></Field>
          <Field label="Product details text color" hint="Title and price below the tile"><Color v={s.carousel.detailsColor} on={(v) => setIn('carousel', 'detailsColor', v)} /></Field>
          <Field label="Show Add to Cart Button (below the tile)" hint='For the "Info below" tile'><Toggle on={s.carousel.showAtcBelow} onChange={(v) => setIn('carousel', 'showAtcBelow', v)} /></Field>
          <Field label="Show Add to Cart Button On Hover" hint='For the "Info below" tile'><Toggle on={s.carousel.showAtcHover} onChange={(v) => setIn('carousel', 'showAtcHover', v)} /></Field>
          <Field label="Feed tile button color"><Color v={s.carousel.feedAtcColor} on={(v) => setIn('carousel', 'feedAtcColor', v)} /></Field>
          <Field label="Feed tile button text color"><Color v={s.carousel.feedAtcTextColor} on={(v) => setIn('carousel', 'feedAtcTextColor', v)} /></Field>
          <Field label="Tile shape" hint="Shape of each video tile"><Sel v={s.carousel.tileAspect || '9/16'} on={(v) => setIn('carousel', 'tileAspect', v)} opts={[['9/16', 'Tall 9:16'], ['4/5', 'Portrait 4:5'], ['3/4', 'Portrait 3:4'], ['1/1', 'Square 1:1'], ['4/3', 'Landscape 4:3'], ['16/9', 'Wide 16:9']]} /></Field>
          <Field label="Tile width on desktop" hint="In pixels"><input type="number" min="100" max="600" value={s.carousel.tileWidthDesktop ?? 220} onChange={(e) => setIn('carousel', 'tileWidthDesktop', Number(e.target.value))} /></Field>
          <Field label="Tile width on mobile" hint="In pixels"><input type="number" min="80" max="400" value={s.carousel.tileWidthMobile ?? 160} onChange={(e) => setIn('carousel', 'tileWidthMobile', Number(e.target.value))} /></Field>
          <Field label="Video fit in tile" hint="Fill the tile (crops edges) or show the whole video"><Sel v={s.carousel.tileFit || 'cover'} on={(v) => setIn('carousel', 'tileFit', v)} opts={[['cover', 'Fill (crop to fit)'], ['contain', 'Show whole video']]} /></Field>
          <Field label="Thumbnail overlay image URL" hint="PNG/JPG shown on top of every thumbnail"><input value={s.carousel.overlayImage} placeholder="https://..." onChange={(e) => setIn('carousel', 'overlayImage', e.target.value)} /></Field>
          <Field label="Thumbnail overlay placement"><Sel v={s.carousel.overlayPlacement} on={(v) => setIn('carousel', 'overlayPlacement', v)} opts={['bottom-right', 'bottom-left', 'top-right', 'top-left']} /></Field>
          <Field label="Thumbnail overlay size (% of width)"><input type="number" min="1" max="100" value={s.carousel.overlaySize} onChange={(e) => setIn('carousel', 'overlaySize', Number(e.target.value))} /></Field>
        </>}
        {sec === 'stories' && <>
          <Field label="Stories Border Colors"><Color v={s.stories.borderColor} on={(v) => setIn('stories', 'borderColor', v)} /></Field>
          <Field label="Stories Title Font Color"><Color v={s.stories.titleColor} on={(v) => setIn('stories', 'titleColor', v)} /></Field>
          <Field label="Story Tile Size Factor" hint="1 = default size"><Num v={s.stories.sizeFactor} on={(v) => setIn('stories', 'sizeFactor', v)} /></Field>
          <Field label="Story Tiles Spacing Factor"><Num v={s.stories.spacing} on={(v) => setIn('stories', 'spacing', v)} /></Field>
        </>}
        {sec === 'product' && <>
          <Field label="Ultra Minimize on Scroll" hint="Shrinks the floating video when the shopper scrolls"><Toggle on={s.product.ultraMinimize} onChange={(v) => setIn('product', 'ultraMinimize', v)} /></Field>
          <Field label="Show homepage videos in product page" hint="Used when the product has no tagged videos"><Toggle on={s.product.showHomepageVideos} onChange={(v) => setIn('product', 'showHomepageVideos', v)} /></Field>
        </>}
        {sec === 'banner' && <>
          <Field label="Is Banner Clickable" hint="Tapping opens the fullscreen player"><Toggle on={s.banner.clickable} onChange={(v) => setIn('banner', 'clickable', v)} /></Field>
          <Field label="Is Full Screen" hint="Banner fills the screen height"><Toggle on={s.banner.fullScreen} onChange={(v) => setIn('banner', 'fullScreen', v)} /></Field>
          <Field label="Show Call to Action"><Toggle on={s.banner.showCta} onChange={(v) => setIn('banner', 'showCta', v)} /></Field>
          <Field label="Show Navigation Dots"><Toggle on={s.banner.showDots} onChange={(v) => setIn('banner', 'showDots', v)} /></Field>
          <Field label="Banner height" hint="Follow a shape, or set an exact height in pixels"><Sel v={s.banner.heightMode || 'ratio'} on={(v) => setIn('banner', 'heightMode', v)} opts={[['ratio', 'By aspect ratio'], ['fixed', 'Fixed height']]} /></Field>
          {(s.banner.heightMode || 'ratio') === 'ratio' ? <>
            <Field label="Desktop aspect ratio" hint="Used on wide screens"><Sel v={s.banner.aspectLandscape} on={(v) => setIn('banner', 'aspectLandscape', v)} opts={['16/9', '21/9', '2/1', '3/1', '4/3', '1/1']} /></Field>
            <Field label="Mobile aspect ratio" hint="Used on phones"><Sel v={s.banner.aspectPortrait} on={(v) => setIn('banner', 'aspectPortrait', v)} opts={['9/16', '4/5', '3/4', '1/1', '4/3', '16/9']} /></Field>
          </> : <>
            <Field label="Desktop height" hint="In pixels"><input type="number" min="120" max="1200" value={s.banner.desktopHeight ?? 520} onChange={(e) => setIn('banner', 'desktopHeight', Number(e.target.value))} /></Field>
            <Field label="Mobile height" hint="In pixels"><input type="number" min="120" max="1000" value={s.banner.mobileHeight ?? 480} onChange={(e) => setIn('banner', 'mobileHeight', Number(e.target.value))} /></Field>
          </>}
          <Field label="Video fit" hint="Fill the banner (crops edges) or show the whole video with bars"><Sel v={s.banner.fit || 'cover'} on={(v) => setIn('banner', 'fit', v)} opts={[['cover', 'Fill (crop to fit)'], ['contain', 'Show whole video']]} /></Field>
          <Field label="Which part to keep when cropping" hint="Only matters when the video is cropped"><Sel v={s.banner.focus || 'center'} on={(v) => setIn('banner', 'focus', v)} opts={[['center', 'Middle'], ['top', 'Top'], ['bottom', 'Bottom']]} /></Field>
          <Field label="Bar colour" hint="Shown when the whole video is visible"><Color v={s.banner.background || '#f3f3f3'} on={(v) => setIn('banner', 'background', v)} /></Field>
        </>}
        {sec === 'spotlight' && <>
          <Field label="Enable Spotlight videos" hint="Founder intros, sale announcements, moment marketing"><Toggle on={s.spotlight.enabled} onChange={(v) => setIn('spotlight', 'enabled', v)} /></Field>
          <Field label="Ultraminimize on Scroll"><Toggle on={s.spotlight.ultraMinimize} onChange={(v) => setIn('spotlight', 'ultraMinimize', v)} /></Field>
          <Field label="Position" hint="Which corner of the screen"><Sel v={s.spotlight.position} on={(v) => setIn('spotlight', 'position', v)} opts={['left', 'right']} /></Field>
          <Field label="Size Factor"><Num v={s.spotlight.sizeFactor} on={(v) => setIn('spotlight', 'sizeFactor', v)} /></Field>
        </>}
        {sec === 'oos' && <>
          <Field label="Show Videos When All Products Are Out of Stock" hint="Display videos for out-of-stock products"><Toggle on={s.oos.showWhenAllOut} onChange={(v) => setIn('oos', 'showWhenAllOut', v)} /></Field>
          <Field label="Show Product Tile For Out of Stock Products"><Toggle on={s.oos.showTile} onChange={(v) => setIn('oos', 'showTile', v)} /></Field>
          <Field label="Show Sold Out Label" hint="Shows a 'Sold out' label on out-of-stock videos"><Toggle on={s.oos.soldOutLabel} onChange={(v) => setIn('oos', 'soldOutLabel', v)} /></Field>
        </>}
      </div>
      <div className="cprev">
        <div className="phead"><b>Widget Preview</b><div className="seg"><button className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>Mobile</button><button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>Desktop</button></div></div>
        <div className={'frame ' + device}><Preview type={previewType} settings={s} videos={previewVideos} device={device} /></div>
      </div>
    </div>
  );
}

// Renders the real store widget with the unsaved settings so the preview matches the store.
function Preview({ type, settings, videos, device }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.TucoVideo) return;
    window.TucoVideo.render(el, { settings, widget: { id: 'preview', type, heading: 'Watch & shop' }, videos }, { preview: true, device });
  }, [type, settings, videos, device]);
  return <div ref={ref} />;
}

const Sel = ({ v, on, opts }) => <select value={v} onChange={(e) => on(e.target.value)}>{opts.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}</select>;
const Num = ({ v, on }) => <input type="number" step="0.1" min="0.4" max="3" value={v} onChange={(e) => on(Number(e.target.value))} />;
const Color = ({ v, on }) => <div className="colr"><input value={v} onChange={(e) => on(e.target.value)} /><input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'} onChange={(e) => on(e.target.value)} /></div>;
