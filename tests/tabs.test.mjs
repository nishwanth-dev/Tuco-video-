// Product tabs: what is accepted when saving, and how a product page's rating is read (pure functions, no API).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanContent, parseRating, ContentError } from '../worker/src/tabs.js';

const deps = { okLink: (u) => !u || (typeof u === 'string' && (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u))), HANDLE: /^[^\s/\\?#&%"'<>]{1,255}$/u };
const clean = (c) => cleanContent(c, deps);
const fails = (c, re) => assert.throws(() => clean(c), (e) => e instanceof ContentError && re.test(e.message));

test('tabs content: an empty or minimal widget is accepted and gets sensible defaults', () => {
  const a = clean(undefined); assert.deepEqual(a.tabs, []); assert.equal(a.atcText, 'add to cart'); assert.equal(a.soldOutText, 'sold out');
  const b = clean({ tabs: [{ title: 'Face Wash' }] }); assert.equal(b.tabs[0].limit, 10); assert.equal(b.tabs[0].showRating, true); assert.deepEqual(b.tabs[0].products, []);
});
test('tabs content: a full tab is kept, tidied and limited', () => {
  const t = clean({ heading: ' Our bestsellers ', tabs: [{ title: ' Sunscreen ', collection: 'sun-care', limit: 99, showRating: false, products: ['a', 'b', 'a'], videoId: 'vid-1', overlayHeading: 'Glow', overlaySub: 'Naturally', link: '/pages/x', viewAllText: 'See all', viewAllUrl: 'https://tucokids.com/collections/sun', icon: 'https://cdn.example.com/i.png' }] });
  assert.equal(t.heading, 'Our bestsellers'); const x = t.tabs[0];
  assert.equal(x.title, 'Sunscreen'); assert.equal(x.limit, 25, 'the product limit is capped at 25'); assert.equal(x.showRating, false); assert.deepEqual(x.products, ['a', 'b'], 'no duplicates'); assert.equal(x.videoId, 'vid-1');
});
test('tabs content: every kind of bad input is refused with a plain message', () => {
  fails({ tabs: [{ title: '' }] }, /needs a title/);
  fails({ tabs: [{}] }, /needs a title/);
  fails({ tabs: [{ title: 'x'.repeat(41) }] }, /too long/);
  fails({ tabs: [{ title: '<b>hi</b>' }] }, /cannot contain/);
  fails({ tabs: [{ title: 'ok', overlayHeading: '{{ x }}' }] }, /cannot contain/);
  fails({ tabs: Array.from({ length: 13 }, (_, i) => ({ title: 'T' + i })) }, /at most 12 tabs/);
  fails({ tabs: [{ title: 'ok', collection: 'has space' }] }, /invalid collection/);
  fails({ tabs: [{ title: 'ok', collection: 'a/b' }] }, /invalid collection/);
  fails({ tabs: [{ title: 'ok', products: ['fine', 'not ok'] }] }, /invalid product/);
  fails({ tabs: [{ title: 'ok', products: Array.from({ length: 31 }, (_, i) => 'p' + i) }] }, /at most 30/);
  fails({ tabs: [{ title: 'ok', videoId: 'a b' }] }, /invalid video/);
  fails({ tabs: [{ title: 'ok', link: 'javascript:alert(1)' }] }, /not a valid link/);
  fails({ tabs: [{ title: 'ok', viewAllUrl: '//evil.com' }] }, /not a valid link/);
  fails({ tabs: [{ title: 'ok', limit: 'many' }] }, /must be a number/);
  fails({ tabs: 'nope' }, /tabs are invalid/); fails({ tabs: ['x'] }, /invalid/); fails('text', /invalid/); fails([], /invalid/);
  fails({ heading: 'x'.repeat(121) }, /too long/);
});
test('tabs content: the product limit is kept inside 1 to 25', () => {
  assert.equal(clean({ tabs: [{ title: 'a', limit: 0 }] }).tabs[0].limit, 1); assert.equal(clean({ tabs: [{ title: 'a', limit: -5 }] }).tabs[0].limit, 1); assert.equal(clean({ tabs: [{ title: 'a', limit: '7' }] }).tabs[0].limit, 7); assert.equal(clean({ tabs: [{ title: 'a', limit: 3.6 }] }).tabs[0].limit, 4);
});

const ld = (v, n) => `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"X","aggregateRating":{"@type":"AggregateRating","ratingValue":"${v}","reviewCount":"${n}"}}</script></html>`;
test('rating: the average and the number of reviews are read from the page data', () => {
  assert.deepEqual(parseRating(ld('4.85', '35')), { v: 4.85, n: 35 });
  assert.deepEqual(parseRating(ld(5, 2)), { v: 5, n: 2 });
  assert.deepEqual(parseRating('<x>"aggregateRating": {"ratingValue": 4.2, "ratingCount": 9}</x>'), { v: 4.2, n: 9 });
});
test('rating: no data, no reviews, nonsense or a rating on another product block gives no rating', () => {
  assert.equal(parseRating(''), null); assert.equal(parseRating(null), null); assert.equal(parseRating('<html>nothing</html>'), null);
  assert.equal(parseRating(ld('4.5', '0')), null, 'zero reviews is not a rating'); assert.equal(parseRating(ld('9.9', '12')), null, 'out of range'); assert.equal(parseRating(ld('0', '12')), null);
  assert.equal(parseRating('<b>"ratingValue":"4.0"</b>'), null, 'a rating with no review count is not shown');
});
