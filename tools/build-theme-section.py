#!/usr/bin/env python3
"""Builds the Loopy Video theme section from one settings table, so the editor controls,
the data attributes and the widget's reader (public/widget.js) stay in sync.
Usage: python3 tools/build-theme-section.py <section .liquid> [<app block .liquid> <app embed .liquid>]
The second form also writes the Shopify app extension files (see shopify-app/)."""
import json, sys

D = 'default'
USE = {'value': D, 'label': 'Use the Loopy setting'}
CORNER = [USE, {'value': '0', 'label': 'Square'}, {'value': '8', 'label': 'Slightly rounded'}, {'value': '16', 'label': 'Rounded'}, {'value': '28', 'label': 'Very rounded'}, {'value': '999', 'label': 'Pill / circle'}]
GAP = [USE] + [{'value': str(v), 'label': f'{v} px'} for v in (0, 4, 8, 12, 16, 24, 32)]
MARGIN = [USE] + [{'value': str(v), 'label': f'{v} px'} for v in (0, 8, 16, 24, 40, 64)]
def ratios(vals): return [USE] + [{'value': v, 'label': l} for v, l in vals]
WIDE = ratios([('16/9', 'Wide 16:9'), ('21/9', 'Ultra-wide 21:9'), ('2/1', '2:1'), ('3/1', 'Panorama 3:1'), ('4/3', 'Landscape 4:3'), ('1/1', 'Square')])
TALL = ratios([('9/16', 'Tall 9:16'), ('4/5', 'Portrait 4:5'), ('3/4', 'Portrait 3:4'), ('1/1', 'Square'), ('4/3', 'Landscape 4:3'), ('16/9', 'Wide 16:9')])
TILE_SHAPE = ratios([('9/16', 'Tall 9:16'), ('4/5', 'Portrait 4:5'), ('3/4', 'Portrait 3:4'), ('1/1', 'Square'), ('4/3', 'Landscape 4:3'), ('16/9', 'Wide 16:9')])
FOCUS = [USE, {'value': 'center', 'label': 'Middle'}, {'value': 'top', 'label': 'Top'}, {'value': 'bottom', 'label': 'Bottom'}]
FIT = [USE, {'value': 'cover', 'label': 'Fill (crop to fit)'}, {'value': 'contain', 'label': 'Show whole video'}]

# (id, attribute, type, label, extra)  type: text | range | select | color ; attribute None = not sent to the widget
S = [
 ('header', 'Banner on desktop'),
 ('banner_height_desktop', 'data-banner-h-desktop', 'range', 'Height', dict(min=0, max=900, step=20, unit='px', default=0, info='0 uses the Loopy setting. A height wins over the shape below.')),
 ('banner_ratio_desktop', 'data-banner-ratio-desktop', 'select', 'Shape (used when height is 0)', dict(options=WIDE)),
 ('banner_radius_desktop', 'data-banner-radius-desktop', 'select', 'Corners', dict(options=CORNER)),
 ('banner_margin_desktop', 'data-banner-margin-desktop', 'select', 'Side margin', dict(options=MARGIN)),
 ('banner_fit_desktop', 'data-banner-fit-desktop', 'select', 'Video fit', dict(options=FIT)),
 ('banner_focus_desktop', 'data-banner-focus-desktop', 'select', 'Part kept when cropping', dict(options=FOCUS)),
 ('banner_max_desktop', 'data-banner-max-desktop', 'range', 'Maximum width', dict(min=0, max=1600, step=20, unit='px', default=0, info='0 = full width.')),
 ('header', 'Banner on mobile'),
 ('banner_height_mobile', 'data-banner-h-mobile', 'range', 'Height', dict(min=0, max=900, step=20, unit='px', default=0, info='0 uses the Loopy setting. A height wins over the shape below.')),
 ('banner_ratio_mobile', 'data-banner-ratio-mobile', 'select', 'Shape (used when height is 0)', dict(options=TALL)),
 ('banner_radius_mobile', 'data-banner-radius-mobile', 'select', 'Corners', dict(options=CORNER)),
 ('banner_margin_mobile', 'data-banner-margin-mobile', 'select', 'Side margin', dict(options=MARGIN)),
 ('banner_fit_mobile', 'data-banner-fit-mobile', 'select', 'Video fit', dict(options=FIT)),
 ('banner_focus_mobile', 'data-banner-focus-mobile', 'select', 'Part kept when cropping', dict(options=FOCUS)),
 ('header', 'Banner on both'),
 ('banner_fit', 'data-banner-fit', 'select', 'Video fit', dict(options=FIT)),
 ('banner_focus', 'data-banner-focus', 'select', 'Part kept when cropping', dict(options=[USE, {'value': 'center', 'label': 'Middle'}, {'value': 'top', 'label': 'Top'}, {'value': 'bottom', 'label': 'Bottom'}])),
 ('header', 'Video tiles on desktop (carousel)'),
 ('tile_width_desktop', 'data-tile-w-desktop', 'range', 'Tile width', dict(min=0, max=500, step=10, unit='px', default=0, info='0 uses the Loopy setting.')),
 ('tile_shape_desktop', 'data-tile-shape-desktop', 'select', 'Tile shape', dict(options=TILE_SHAPE)),
 ('tile_radius_desktop', 'data-tile-radius-desktop', 'select', 'Corners', dict(options=CORNER)),
 ('tile_gap_desktop', 'data-tile-gap-desktop', 'select', 'Space between tiles', dict(options=GAP)),
 ('tile_pad_desktop', 'data-tile-pad-desktop', 'select', 'Side margin', dict(options=MARGIN)),
 ('tile_fit_desktop', 'data-tile-fit-desktop', 'select', 'Video fit', dict(options=FIT)),
 ('header', 'Video tiles on mobile (carousel)'),
 ('tile_width_mobile', 'data-tile-w-mobile', 'range', 'Tile width', dict(min=0, max=400, step=10, unit='px', default=0, info='0 uses the Loopy setting.')),
 ('tile_shape_mobile', 'data-tile-shape-mobile', 'select', 'Tile shape', dict(options=TILE_SHAPE)),
 ('tile_radius_mobile', 'data-tile-radius-mobile', 'select', 'Corners', dict(options=CORNER)),
 ('tile_gap_mobile', 'data-tile-gap-mobile', 'select', 'Space between tiles', dict(options=GAP)),
 ('tile_pad_mobile', 'data-tile-pad-mobile', 'select', 'Side margin', dict(options=MARGIN)),
 ('tile_fit_mobile', 'data-tile-fit-mobile', 'select', 'Video fit', dict(options=FIT)),
 ('header', 'Video tiles on both'),
 ('tile_fit', 'data-tile-fit', 'select', 'Video fit', dict(options=FIT)),
 ('header', 'Stories'),
 ('story_size_desktop', 'data-story-size-desktop', 'range', 'Size on desktop', dict(min=0, max=200, step=4, unit='px', default=0, info='0 uses the Loopy setting.')),
 ('story_size_mobile', 'data-story-size-mobile', 'range', 'Size on mobile', dict(min=0, max=160, step=4, unit='px', default=0, info='0 uses the Loopy setting.')),
 ('story_shape', 'data-story-shape', 'select', 'Shape', dict(options=[USE, {'value': 'circle', 'label': 'Circle'}, {'value': 'rounded', 'label': 'Rounded square'}, {'value': 'square', 'label': 'Square'}])),
 ('story_gap_desktop', 'data-story-gap-desktop', 'select', 'Space between, desktop', dict(options=GAP)),
 ('story_gap_mobile', 'data-story-gap-mobile', 'select', 'Space between, mobile', dict(options=GAP)),
 ('header', 'Spotlight and floating video'),
 ('spot_width_desktop', 'data-spot-w-desktop', 'range', 'Width on desktop', dict(min=0, max=300, step=10, unit='px', default=0, info='0 uses the Loopy setting.')),
 ('spot_width_mobile', 'data-spot-w-mobile', 'range', 'Width on mobile', dict(min=0, max=220, step=10, unit='px', default=0, info='0 uses the Loopy setting.')),
 ('spot_radius_desktop', 'data-spot-radius-desktop', 'select', 'Corners on desktop', dict(options=CORNER)),
 ('spot_radius_mobile', 'data-spot-radius-mobile', 'select', 'Corners on mobile', dict(options=CORNER)),
 ('header', 'Link when the video is clicked'),
 ('click_link', 'data-link', 'text', 'Link', dict(info='Leave empty to keep the normal behaviour. Otherwise people who click the video go to this link, for example /collections/all or https://tucokids.com/pages/4-999')),
 ('click_target', 'data-link-target', 'select', 'Open the link in', dict(options=[USE, {'value': 'same', 'label': 'The same tab'}, {'value': 'new', 'label': 'A new tab'}])),
 ('header', 'Colours, fonts and text'),
 ('brand_color', 'data-brand-color', 'color', 'Button and highlight colour', {}),
 ('font', 'data-font', 'text', 'Font name', dict(info='A font your theme already loads, for example Poppins. Empty uses the Loopy setting.')),
 ('button_text', 'data-button-text', 'text', 'Button text', dict(info='For example Shop now. Empty uses the Loopy setting.')),
 ('heading_color', 'data-heading-color', 'color', 'Heading colour', {}),
 ('heading_font', 'data-heading-font', 'text', 'Heading font', dict(info='Empty uses the font above.')),
 ('text_color', 'data-text-color', 'color', 'Product text colour (info below tiles)', {}),
 ('feed_button_color', 'data-feed-button-color', 'color', 'Feed add-to-cart button colour', {}),
 ('feed_button_text_color', 'data-feed-button-text-color', 'color', 'Feed add-to-cart text colour', {}),
 ('story_ring_color', 'data-story-ring-color', 'color', 'Story ring colour', {}),
 ('story_label_color', 'data-story-label-color', 'color', 'Story label colour', {}),
 ('banner_bg', 'data-banner-bg', 'color', 'Banner bar colour', {}),
]

def attr_line(sid, attr, typ, scope='section'):
    if typ in ('color', 'text'):
        # Empty means "use the Loopy setting", so nothing is sent.
        return f'      {{%- if {scope}.settings.{sid} != blank %}} {attr}="{{{{ {scope}.settings.{sid} | escape }}}}"{{% endif -%}}'
    if typ == 'range':
        return f'      {{%- if {scope}.settings.{sid} > 0 %}} {attr}="{{{{ {scope}.settings.{sid} }}}}"{{% endif -%}}'
    return f"      {{%- if {scope}.settings.{sid} != 'default' %}} {attr}=\"{{{{ {scope}.settings.{sid} }}}}\"{{% endif -%}}"

def attrs_for(scope): return '\n'.join(attr_line(s[0], s[1], s[2], scope) for s in S if s[0] != 'header')
attrs = attrs_for('section')

schema_settings = [
  {'type': 'paragraph', 'content': 'Shows a video widget from your Loopy admin. Copy the widget ID from Loopy (widget page, then Get embed code). Every copy of this section can look different, and desktop and mobile are set separately.'},
  {'type': 'text', 'id': 'widget_id', 'label': 'Loopy widget ID', 'info': 'Looks like wgt_ab12cd34'},
  {'type': 'text', 'id': 'heading', 'label': 'Heading (optional)', 'info': 'Shown above carousels.'},
  {'type': 'header', 'content': 'Where it applies'},
  {'type': 'text', 'id': 'product_handle', 'label': 'Product handle (optional)', 'info': 'Leave empty to use the product of the page it is on.'},
  {'type': 'text', 'id': 'collection_handle', 'label': 'Collection handle (optional)', 'info': 'Leave empty to use the collection of the page it is on.'},
  {'type': 'text', 'id': 'page_handle', 'label': 'Page handle (optional)', 'info': 'Leave empty to use the page it is on.'},
]
for s in S:
    if s[0] == 'header': schema_settings.append({'type': 'header', 'content': s[1]}); continue
    sid, attr, typ, label, extra = s
    item = {'type': typ, 'id': sid, 'label': label}
    if typ == 'range':
        item.update({'min': extra['min'], 'max': extra['max'], 'step': extra['step'], 'unit': extra['unit'], 'default': extra['default'], 'info': extra['info']})
    elif typ == 'color':
        pass  # no default: left unset means "use the Loopy setting"
    elif typ == 'text':
        item.update({'info': extra['info']})
    else:
        item.update({'options': extra['options'], 'default': D})
    schema_settings.append(item)
schema_settings += [
  {'type': 'header', 'content': 'Spacing'},
  {'type': 'checkbox', 'id': 'full_width', 'label': 'Full width', 'default': True, 'info': 'Turn off to keep it inside the page margins.'},
  {'type': 'range', 'id': 'padding_top', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Top padding', 'default': 20},
  {'type': 'range', 'id': 'padding_bottom', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Bottom padding', 'default': 20},
]
schema = {'name': 'Loopy Video', 'tag': 'section', 'class': 'section', 'settings': schema_settings, 'presets': [{'name': 'Loopy Video', 'category': 'Video'}]}

TEMPLATE = '''{%- comment -%}
  Loopy Video: shows a Loopy widget. Paste the widget ID from the Loopy admin (Get embed code).
  Every copy of this section keeps its own settings, and desktop and mobile are set separately.
  Generated by tools/build-theme-section.py in the Loopy repo; edit the table there.
{%- endcomment -%}

{%- liquid
  assign wid = section.settings.widget_id | strip
  assign pad = section.settings.padding_top
  assign pad_b = section.settings.padding_bottom
-%}

{%- style -%}
  #shopify-section-{{ section.id }} .loopy-wrap {
    padding-top: calc({{ pad }}px * 0.75);
    padding-bottom: calc({{ pad_b }}px * 0.75);
  }
  @media screen and (min-width: 750px) {
    #shopify-section-{{ section.id }} .loopy-wrap {
      padding-top: {{ pad }}px;
      padding-bottom: {{ pad_b }}px;
    }
  }
{%- endstyle -%}

<div class="loopy-wrap{% unless section.settings.full_width %} page-width{% endunless %}">
  {%- if wid != blank -%}
    <div
      data-tuco-video
      data-widget="{{ wid | escape }}"
      {%- if section.settings.heading != blank %} data-heading="{{ section.settings.heading | strip | escape }}"{% endif -%}
      {%- if section.settings.product_handle != blank %} data-product="{{ section.settings.product_handle | strip | escape }}"{% endif -%}
      {%- if section.settings.collection_handle != blank %} data-collection="{{ section.settings.collection_handle | strip | escape }}"{% endif -%}
      {%- if section.settings.page_handle != blank %} data-page="{{ section.settings.page_handle | strip | escape }}"{% endif -%}
@@ATTRS@@
    ></div>
  {%- elsif request.design_mode -%}
    <p style="margin:0;padding:12px 16px;border:1px dashed #b0b0b0;border-radius:8px;font:13px/1.4 sans-serif;color:#555;text-align:center">
      Loopy Video: enter a widget ID in this section's settings (copy it from the Loopy admin, under Get embed code).
    </p>
  {%- endif -%}
</div>

{%- comment -%} Loads the Loopy script once per page, even with several of these sections. {%- endcomment -%}
<script>
  (function () {
    if (window.__tucoLoaded || document.querySelector('script[data-loopy]')) return;
    var s = document.createElement('script');
    s.src = 'https://loopy.tucokids.workers.dev/widget.js';
    s.defer = true;
    s.setAttribute('data-loopy', '');
    s.setAttribute('data-api', 'https://tuco-video-api.tucokids.workers.dev');
    document.head.appendChild(s);
  })();
</script>

{% schema %}
@@SCHEMA@@
{% endschema %}
'''
out = TEMPLATE.replace('@@ATTRS@@', attrs).replace('@@SCHEMA@@', json.dumps(schema, indent=2))
open(sys.argv[1], 'w').write(out)
print(f'wrote {sys.argv[1]}: {sum(1 for x in schema_settings if x.get("id"))} settings')

# ---------------- Shopify app extension (app block + app embed) ----------------
if len(sys.argv) >= 4:
    SCRIPT = """<script>
  (function () {
    if (window.__tucoLoaded || document.querySelector('script[data-loopy]')) return;
    var s = document.createElement('script');
    s.src = 'https://loopy.tucokids.workers.dev/widget.js';
    s.defer = true;
    s.setAttribute('data-loopy', '');
    s.setAttribute('data-api', 'https://tuco-video-api.tucokids.workers.dev');
    document.head.appendChild(s);
  })();
</script>"""
    # Shopify allows at most 6 header/paragraph lines in an app block, so the section headers become name prefixes instead.
    block_settings, group = [], ''
    for x in schema_settings:
        if x.get('type') == 'header':
            group = '' if x.get('content') in ('Spacing',) else x['content']
            continue
        if x.get('id') in ('padding_top', 'padding_bottom', 'full_width'): continue
        y = dict(x)
        if group and y.get('id') and y.get('label'): y['label'] = f"{group}: {y['label']}"
        block_settings.append(y)
    block_settings += [
      {'type': 'range', 'id': 'padding_top', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Top padding', 'default': 20},
      {'type': 'range', 'id': 'padding_bottom', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Bottom padding', 'default': 20},
    ]
    block_schema = {'name': 'Loopy Video (all options)', 'target': 'section', 'settings': block_settings}
    BLOCK = """{%- comment -%}
  Loopy Video app block: shows a Loopy widget. Paste the widget ID from the Loopy admin (Get embed code).
  Generated by tools/build-theme-section.py in the Loopy repo; edit the table there.
{%- endcomment -%}

{%- assign wid = block.settings.widget_id | strip -%}

<style>
  #loopy-block-{{ block.id }} { padding-top: calc({{ block.settings.padding_top }}px * 0.75); padding-bottom: calc({{ block.settings.padding_bottom }}px * 0.75); }
  @media screen and (min-width: 750px) { #loopy-block-{{ block.id }} { padding-top: {{ block.settings.padding_top }}px; padding-bottom: {{ block.settings.padding_bottom }}px; } }
</style>

<div id="loopy-block-{{ block.id }}" {{ block.shopify_attributes }}>
  {%- if wid != blank -%}
    <div
      data-tuco-video
      data-widget="{{ wid | escape }}"
      {%- if block.settings.heading != blank %} data-heading="{{ block.settings.heading | strip | escape }}"{% endif -%}
      {%- if block.settings.product_handle != blank %} data-product="{{ block.settings.product_handle | strip | escape }}"{% endif -%}
      {%- if block.settings.collection_handle != blank %} data-collection="{{ block.settings.collection_handle | strip | escape }}"{% endif -%}
      {%- if block.settings.page_handle != blank %} data-page="{{ block.settings.page_handle | strip | escape }}"{% endif -%}
@@ATTRS@@
    ></div>
  {%- elsif request.design_mode -%}
    <p style="margin:0;padding:12px 16px;border:1px dashed #b0b0b0;border-radius:8px;font:13px/1.4 sans-serif;color:#555;text-align:center">
      Loopy Video: enter a widget ID in this block's settings (copy it from the Loopy admin, under Get embed code).
    </p>
  {%- endif -%}
</div>

@@SCRIPT@@

{% schema %}
@@SCHEMA@@
{% endschema %}
"""
    # The all-in-one app block was retired: each feature has its own block below (the file path given is only used to find the blocks folder).
    # One app block per feature, so the theme editor shows only the options that matter for it.
    import os
    # Plain words for the per-feature blocks, so people who do not write code can follow them.
    def plain_opts(opts):
        names = {'Use the Loopy setting': 'Default (set in Loopy)', 'Fill (crop to fit)': 'Fill the space (edges may be trimmed)', 'Show whole video': 'Show the whole video'}
        return [{'value': o['value'], 'label': names.get(o['label'], o['label'])} for o in opts]
    PLAIN = {  # id suffix after the device -> (label, help)
      'height': ('Fixed height', 'Leave at 0 to size automatically from the shape below.'),
      'ratio': ('Shape', 'Used when the fixed height is 0.'),
      'radius': ('Corner roundness', ''), 'margin': ('Space on the left and right', ''), 'pad': ('Space on the left and right', ''),
      'fit': ('If the video is a different shape', 'Fill the space looks best; the whole video may show empty bars.'),
      'focus': ('Part to keep when trimmed', 'Which part of the video stays visible when its edges are trimmed.'),
      'max': ('Maximum width', 'Leave at 0 for the full width.'), 'width': ('Width', 'Leave at 0 to use the default.'),
      'shape': ('Shape', ''), 'gap': ('Space between', ''), 'size': ('Size', 'Leave at 0 to use the default.'),
    }
    EXACT = {
      'click_link': ('Link when the video is clicked (optional)', 'Leave empty for the normal behaviour. Example: /collections/all or https://tucokids.com/pages/4-999'),
      'click_target': ('Open the link in', ''),
      'brand_color': ('Button and highlight colour', 'Leave empty to use the colour set in Loopy.'),
      'font': ('Text font (optional)', 'A font name your theme already uses, for example Poppins. Leave empty for the default.'),
      'button_text': ('Button text (optional)', 'For example: Shop now. Leave empty for the default.'),
      'heading_color': ('Heading colour', ''), 'heading_font': ('Heading font (optional)', 'Leave empty to use the text font.'),
      'text_color': ('Product text colour', 'The text under each video.'), 'feed_button_color': ('Add-to-cart button colour', ''),
      'feed_button_text_color': ('Add-to-cart button text colour', ''), 'story_ring_color': ('Circle border colour', ''),
      'story_label_color': ('Name colour under the circle', ''), 'banner_bg': ('Background behind the banner', 'Shows if the video does not fill the banner.'),
    }
    def plain(sid, label, info):
        if sid in EXACT: return EXACT[sid]
        dev = 'Desktop' if sid.endswith('_desktop') else 'Mobile' if sid.endswith('_mobile') else ''
        key = sid.rsplit('_', 1)[0] if sid.endswith(('_desktop', '_mobile')) else sid
        key = key.split('_')[-1]
        if key in PLAIN: return (f'{dev}: ' if dev else '') + PLAIN[key][0], PLAIN[key][1] or info
        return (f'{dev}: ' if dev else '') + label, info
    COMMON = ('brand_color', 'font', 'button_text')
    SPECS = [
      ('Loopy Banner', 'loopy-banner', lambda i: i.startswith('banner_') or i in ('button_text', 'brand_color', 'click_link', 'click_target'), False, False,
       'Full-width video banner. Desktop and mobile are set separately.'),
      ('Loopy Carousel', 'loopy-carousel', lambda i: i.startswith(('tile_', 'feed_', 'heading_', 'text_')) or i in COMMON or i in ('click_link', 'click_target'), True, True,
       'Row of video tiles for product pages, collections and pages.'),
      ('Loopy Stories', 'loopy-stories', lambda i: i.startswith('story_') or i in ('brand_color', 'font', 'click_link', 'click_target'), False, False,
       'Round story circles that open a full-screen player.'),
      ('Loopy Section', 'loopy-section', lambda i: i in ('click_link', 'click_target'), False, False,
       'A heading beside one video (stacked on phones). The heading, colours and layout are all set in Loopy.'),
      ('Loopy Spotlight', 'loopy-spotlight', lambda i: i.startswith('spot_') or i in COMMON or i in ('click_link', 'click_target'), False, False,
       'Small floating video in the corner of the page.'),
    ]
    for bname, bhandle, keep, with_heading, with_handles, blurb in SPECS:
        bs, grp = [
          {'type': 'paragraph', 'content': blurb + ' Everything below is optional except the widget ID. Leave a setting on Default to use what you set in Loopy.'},
          {'type': 'text', 'id': 'widget_id', 'label': 'Loopy widget ID', 'info': 'In Loopy open Widgets, pick your widget and copy its ID. It starts with wgt_'},
        ], ''
        if with_heading: bs.append({'type': 'text', 'id': 'heading', 'label': 'Heading above the videos (optional)', 'info': 'For example: Real moms, real results.'})
        if with_handles: bs += [
          {'type': 'text', 'id': 'product_handle', 'label': 'Show a specific product (optional)', 'info': 'Leave empty on a product page. Otherwise type the last part of the product link, for example hair-oil-for-kids.'},
          {'type': 'text', 'id': 'collection_handle', 'label': 'Show a specific collection (optional)', 'info': 'Leave empty on a collection page. Otherwise type the last part of the collection link.'},
          {'type': 'text', 'id': 'page_handle', 'label': 'Show a specific page (optional)', 'info': 'Leave empty on a normal page. Otherwise type the last part of the page link.'},
        ]
        ids = set()
        for x in S:
            if x[0] == 'header': grp = x[1]; continue
            if not keep(x[0]) or x[0] in ('banner_fit', 'banner_focus', 'tile_fit'): continue
            sid, attr, typ, label, extra = x
            lab, hint = plain(sid, label, extra.get('info', ''))
            item = {'type': typ, 'id': sid, 'label': lab}
            if typ == 'range': item.update({k: extra[k] for k in ('min', 'max', 'step', 'unit', 'default')}); item['info'] = hint or 'Leave at 0 to use the default.'
            elif typ == 'text': item.update({'info': hint})
            elif typ == 'color': item['info'] = hint
            elif typ == 'select': item.update({'options': plain_opts(extra['options']), 'default': D}); item['info'] = hint
            if not item.get('info'): item.pop('info', None)
            bs.append(item); ids.add(sid)
        bs += [
          {'type': 'range', 'id': 'padding_top', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Space above', 'default': 20},
          {'type': 'range', 'id': 'padding_bottom', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Space below', 'default': 20},
        ]
        attrs_b = '\n'.join(attr_line(x[0], x[1], x[2], 'block') for x in S if x[0] != 'header' and x[0] in ids)
        txt = BLOCK.replace('Loopy Video app block', bname + ' app block').replace("Loopy Video: enter", bname + ": enter")
        txt = txt.replace('@@ATTRS@@', attrs_b).replace('@@SCRIPT@@', SCRIPT).replace('@@SCHEMA@@', json.dumps({'name': bname, 'target': 'section', 'settings': bs}, indent=2))
        open(os.path.join(os.path.dirname(sys.argv[2]), bhandle + '.liquid'), 'w').write(txt)
        print(f'wrote {bhandle}: {sum(1 for y in bs if y.get("id"))} settings')
    embed_schema = {'name': 'Loopy floating video', 'target': 'body', 'settings': [
      {'type': 'paragraph', 'content': 'Shows one Loopy floating or spotlight widget on every page. Create it in Loopy and paste its widget ID.'},
      {'type': 'text', 'id': 'widget_id', 'label': 'Loopy widget ID', 'info': 'Looks like wgt_ab12cd34'},
      {'type': 'text', 'id': 'product_handle', 'label': 'Product handle (optional)', 'info': 'Leave empty to use the product of the page it is on.'},
    ]}
    EMBED = """{%- comment -%}
  Loopy app embed: loads the Loopy script on every page and, optionally, shows one floating or spotlight widget.
{%- endcomment -%}
{%- assign wid = app.metafields.loopy.widget | default: block.settings.widget_id | strip -%}
{%- if wid != blank -%}
  <div data-tuco-video data-widget="{{ wid | escape }}"{% if block.settings.product_handle != blank %} data-product="{{ block.settings.product_handle | strip | escape }}"{% endif %}></div>
{%- endif -%}

@@SCRIPT@@

{% schema %}
@@SCHEMA@@
{% endschema %}
"""
    open(sys.argv[3], 'w').write(EMBED.replace('@@SCRIPT@@', SCRIPT).replace('@@SCHEMA@@', json.dumps(embed_schema, indent=2)))
    print('wrote the feature blocks and app embed')
