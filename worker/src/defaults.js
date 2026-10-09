// Default widget look and behaviour. Mirrors the Customizations screen; saved settings merge over these.
export const DEFAULTS = {
  brandColor: '#ffd94a', brandFont: 'Poppins', border: 'round', showViews: false, shopNowText: 'Shop now',
  showAtc: true, showPrice: true, cartAction: 'drawer', tileType: 'overlay',
  carousel: { headingColor: '#4d4747', headingFont: '', headingWeight: '600', ordering: 'none', shuffleBatch: 0, onlyTagged: true, detailsColor: '#4d4747', showAtcBelow: true, showAtcHover: false, feedAtcColor: '#ffd94a', feedAtcTextColor: '#4d4747', overlayImage: '', overlayPlacement: 'bottom-right', overlaySize: 20, tileAspect: '9/16', tileWidthDesktop: 220, tileWidthMobile: 160, tileFit: 'cover' },
  stories: { borderColor: '#ffd94a', titleColor: '#4d4747', sizeFactor: 1, spacing: 1 },
  banner: { clickable: true, fullScreen: false, showCta: true, showDots: true, aspectLandscape: '16/9', aspectPortrait: '9/16', fit: 'cover', focus: 'center', heightMode: 'ratio', desktopHeight: 520, mobileHeight: 480, background: '#f3f3f3' },
  spotlight: { enabled: true, position: 'left', sizeFactor: 1, ultraMinimize: false },
  product: { ultraMinimize: false, showPopup: false, showHomepageVideos: false, recommend: 'none', collectionMode: 'always' },
  oos: { showWhenAllOut: false, showTile: true, soldOutLabel: true },
};

export const mergeSettings = (saved) => {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const k of Object.keys(saved || {})) {
    if (out[k] && typeof out[k] === 'object' && typeof saved[k] === 'object') Object.assign(out[k], saved[k]);
    else out[k] = saved[k];
  }
  return out;
};
