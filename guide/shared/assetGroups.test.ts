import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_GROUPS, tabToGroup, groupDef } from '../web/src/types/library.js';
import type { AssetHubTab, AssetGroup } from '../web/src/types/library.js';

const ALL_TABS: AssetHubTab[] = ['digital_human', 'template', 'brand', 'look_preset', 'voice', 'script', 'knowledge', 'media'];

describe('asset groups', () => {
  it('defines exactly 4 groups', () => {
    assert.equal(ASSET_GROUPS.length, 4);
    const ids = ASSET_GROUPS.map((g) => g.id);
    assert.deepEqual(ids.sort(), ['brand_role', 'product_scene', 'script_audio', 'template_motion'].sort());
  });

  it('every old tab maps to exactly one group', () => {
    const owners = new Map<AssetHubTab, AssetGroup>();
    for (const grp of ASSET_GROUPS) {
      for (const t of grp.tabs) {
        assert.ok(!owners.has(t), `tab ${t} appears in two groups`);
        owners.set(t, grp.id);
      }
    }
    for (const t of ALL_TABS) {
      assert.ok(owners.has(t), `tab ${t} is not covered by any group`);
    }
  });

  it('tabToGroup maps known tabs correctly', () => {
    assert.equal(tabToGroup('brand'), 'brand_role');
    assert.equal(tabToGroup('digital_human'), 'brand_role');
    assert.equal(tabToGroup('voice'), 'brand_role');
    assert.equal(tabToGroup('media'), 'product_scene');
    assert.equal(tabToGroup('script'), 'script_audio');
    assert.equal(tabToGroup('knowledge'), 'script_audio');
    assert.equal(tabToGroup('template'), 'template_motion');
    assert.equal(tabToGroup('look_preset'), 'template_motion');
  });

  it('groupDef returns the matching group def', () => {
    assert.equal(groupDef('product_scene').defaultTab, 'media');
    assert.equal(groupDef('template_motion').defaultTab, 'template');
  });
});