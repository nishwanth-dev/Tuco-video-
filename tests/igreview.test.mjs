// Product matching for new Instagram reels (pure function, no API needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestProducts } from '../worker/src/igreview.js';

const list = [
  { handle: 'kumkumadi-face-cream', title: 'Kumkumadi Face Cream for Kids 50g', price: '₹399' },
  { handle: 'tulsi-body-wash', title: 'Tulsi Body Wash 300ml', price: '₹349' },
  { handle: 'whipped-body-wash', title: 'Whipped Body Wash', price: '₹299' },
  { handle: 'nail-paint-pens', title: 'Nail Paint Brush Pens Set of 4', price: '₹499' },
  { handle: 'champi-kit', title: 'Ultimate Champi Kit', price: '₹799' },
];
const top = (c) => suggestProducts(c, list).map((x) => x.handle);

test('instagram match: a caption naming the product finds it, best first', () => {
  assert.equal(top('Our Tulsi body wash is harsh on germs, gentle on skin #tuco')[0], 'tulsi-body-wash');
  assert.equal(top('Meet the Kumkumadi face cream')[0], 'kumkumadi-face-cream');
});
test('instagram match: plural words, capitals and hashtags still match', () => {
  assert.equal(top('NAIL PAINT PENS for kids #nailpaint')[0], 'nail-paint-pens');
  assert.equal(top('#champi #kit for hair')[0], 'champi-kit');
});
test('instagram match: words every product shares (kids, natural, tuco) never create a match on their own', () => {
  assert.deepEqual(top('Tuco Kids natural products for kids'), []);
  assert.deepEqual(suggestProducts('', list), []);
  assert.deepEqual(suggestProducts(null, list), []);
  assert.deepEqual(suggestProducts('tulsi body wash', []), []);
});
test('instagram match: two close products are both offered, at most three, with a score', () => {
  const r = suggestProducts('body wash time: tulsi body wash and whipped body wash', list);
  assert.ok(r.length >= 2 && r.length <= 3); assert.ok(r.every((x) => x.score > 0 && x.score <= 100 && x.handle && x.title));
  assert.ok(r[0].score >= r[r.length - 1].score, 'sorted best first');
});
test('instagram match: one weak word out of many is not enough', () => {
  assert.deepEqual(top('We love a good cream'), [], 'a single shared word of a longer name is not a match');
});
