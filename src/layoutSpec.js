// Layout options shared by Customizations (global defaults) and each widget's Appearance panel.
// Each row: [group, key, label, kind, options]. kind: num (px), sel (choices), corner (curve presets).
export const RATIOS = [['9/16', 'Tall 9:16'], ['4/5', 'Portrait 4:5'], ['3/4', 'Portrait 3:4'], ['1/1', 'Square'], ['4/3', 'Landscape 4:3'], ['16/9', 'Wide 16:9'], ['21/9', 'Ultra-wide 21:9']];
export const CORNERS = [[0, 'Square'], [8, 'Slightly rounded'], [16, 'Rounded'], [28, 'Very rounded'], [999, 'Pill / circle']];
const SHAPES = [['circle', 'Circle'], ['rounded', 'Rounded square'], ['square', 'Square']];

export const NEW_LAYOUT = {
  carousel: [
    ['carousel', 'tileAspectDesktop', 'Tile shape, desktop', 'sel', RATIOS], ['carousel', 'tileAspectMobile', 'Tile shape, mobile', 'sel', RATIOS],
    ['carousel', 'tileRadiusDesktop', 'Corners, desktop', 'corner'], ['carousel', 'tileRadiusMobile', 'Corners, mobile', 'corner'],
    ['carousel', 'tileGapDesktop', 'Space between tiles, desktop (px)', 'num'], ['carousel', 'tileGapMobile', 'Space between tiles, mobile (px)', 'num'],
    ['carousel', 'sidePaddingDesktop', 'Side margin, desktop (px)', 'num'], ['carousel', 'sidePaddingMobile', 'Side margin, mobile (px)', 'num'],
  ],
  stories: [
    ['stories', 'sizeDesktop', 'Story size, desktop (px)', 'num'], ['stories', 'sizeMobile', 'Story size, mobile (px)', 'num'],
    ['stories', 'shape', 'Story shape', 'sel', SHAPES],
    ['stories', 'gapDesktop', 'Space between stories, desktop (px)', 'num'], ['stories', 'gapMobile', 'Space between stories, mobile (px)', 'num'],
  ],
  banner: [
    ['banner', 'radiusDesktop', 'Corners, desktop', 'corner'], ['banner', 'radiusMobile', 'Corners, mobile', 'corner'],
    ['banner', 'marginDesktop', 'Side margin, desktop (px)', 'num'], ['banner', 'marginMobile', 'Side margin, mobile (px)', 'num'],
    ['banner', 'maxWidthDesktop', 'Maximum width on desktop (px, 0 = full width)', 'num'],
  ],
  feature: [
    ['feature', 'cornersDesktop', 'Video corners, desktop', 'corner'], ['feature', 'cornersMobile', 'Video corners, mobile', 'corner'],
  ],
  spotlight: [
    ['spotlight', 'widthDesktop', 'Video width, desktop (px, 0 = use size factor)', 'num'], ['spotlight', 'widthMobile', 'Video width, mobile (px, 0 = use size factor)', 'num'],
    ['spotlight', 'radiusDesktop', 'Corners, desktop', 'corner'], ['spotlight', 'radiusMobile', 'Corners, mobile', 'corner'],
  ],
};
