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
    open(sys.argv[2], 'w').write(BLOCK.replace('@@ATTRS@@', attrs_for('block')).replace('@@SCRIPT@@', SCRIPT).replace('@@SCHEMA@@', json.dumps(block_schema, indent=2)))
    # One app block per feature, so the theme editor shows only the options that matter for it.
    import os
    COMMON = ('brand_color', 'font', 'button_text')
    SPECS = [
      ('Loopy Banner', 'loopy-banner', lambda i: i.startswith('banner_') or i in ('button_text', 'brand_color'), False, False,
       'Full-width video banner. Desktop and mobile are set separately.'),
      ('Loopy Carousel', 'loopy-carousel', lambda i: i.startswith(('tile_', 'feed_', 'heading_', 'text_')) or i in COMMON, True, True,
       'Row of video tiles for product pages, collections and pages.'),
      ('Loopy Stories', 'loopy-stories', lambda i: i.startswith('story_') or i in ('brand_color', 'font'), False, False,
       'Round story circles that open a full-screen player.'),
      ('Loopy Spotlight', 'loopy-spotlight', lambda i: i.startswith('spot_') or i in COMMON, False, False,
       'Small floating video in the corner of the page.'),
    ]
    for bname, bhandle, keep, with_heading, with_handles, blurb in SPECS:
        bs, grp = [
          {'type': 'paragraph', 'content': blurb + ' Copy the widget ID from Loopy (widget page, then Get embed code).'},
          {'type': 'text', 'id': 'widget_id', 'label': 'Loopy widget ID', 'info': 'Looks like wgt_ab12cd34'},
        ], ''
        if with_heading: bs.append({'type': 'text', 'id': 'heading', 'label': 'Heading (optional)', 'info': 'Shown above the tiles.'})
        if with_handles: bs += [
          {'type': 'text', 'id': 'product_handle', 'label': 'Product handle (optional)', 'info': 'Leave empty to use the product of the page it is on.'},
          {'type': 'text', 'id': 'collection_handle', 'label': 'Collection handle (optional)', 'info': 'Leave empty to use the collection of the page it is on.'},
          {'type': 'text', 'id': 'page_handle', 'label': 'Page handle (optional)', 'info': 'Leave empty to use the page it is on.'},
        ]
        ids = set()
        for x in S:
            if x[0] == 'header': grp = x[1]; continue
            if not keep(x[0]): continue
            sid, attr, typ, label, extra = x
            item = {'type': typ, 'id': sid, 'label': f"{grp}: {label}" if grp and not grp.startswith('Colours') else label}
            if typ == 'range': item.update({k: extra[k] for k in ('min', 'max', 'step', 'unit', 'default', 'info')})
            elif typ == 'text': item.update({'info': extra['info']})
            elif typ == 'select': item.update({'options': extra['options'], 'default': D})
            bs.append(item); ids.add(sid)
        bs += [
          {'type': 'range', 'id': 'padding_top', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Top padding', 'default': 20},
          {'type': 'range', 'id': 'padding_bottom', 'min': 0, 'max': 100, 'step': 4, 'unit': 'px', 'label': 'Bottom padding', 'default': 20},
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
    print(f'wrote app block ({sum(1 for x in block_settings if x.get("id"))} settings) and app embed')
