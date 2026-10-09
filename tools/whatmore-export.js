// Run in the browser console while signed in to app.whatmore.live. Read-only: it saves whatmore-export.json to your Downloads.
(async () => {
  const id = prompt('Your Whatmore brand id (the number in Whatmore API calls)');
  if (!id) return;
  const events = await (await fetch(`https://api.whatmore.live/v2/events/${id}/all`, { credentials: 'include' })).json();
  const handleOf = (link) => ((String(link || '').match(/\/products\/([^/?#]+)/) || [])[1] || '');
  const widgets = {};
  const videos = events.map((e) => {
    const ws = (e.storyset || []).filter((s) => s.storyset_status === 'active');
    ws.forEach((s) => { widgets[s.storyset_id] = { id: s.storyset_id, name: s.storyset_name, type: s.widget_type }; });
    return {
      id: e.event_id,
      url: e.original_video_url,
      poster: e.poster_image || e.thumbnail_image || '',
      title: e.title || e.event_title || '',
      sourceHandle: e.source_handle || '',
      products: (e.products || []).map((p) => ({ handle: handleOf(p.product_link), title: p.title })).filter((p) => p.handle),
      widgets: ws.map((s) => ({ id: s.storyset_id, rank: s.storyset_event_rank })),
    };
  });
  const out = { exportedAt: new Date().toISOString(), widgets: Object.values(widgets), videos };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = 'whatmore-export.json';
  a.click();
  console.log(`Exported ${videos.length} videos and ${out.widgets.length} widgets.`);
})();
