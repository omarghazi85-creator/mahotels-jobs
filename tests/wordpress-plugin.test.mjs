import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const plugin=readFileSync(new URL('../wordpress/mahotels-jobs-lite/mahotels-jobs-lite.php',import.meta.url),'utf8');

test('replacement keeps legacy post type, URL prefix and taxonomy identifiers',()=>{
  assert.match(plugin,/register_post_type\('ma_hotel_job'/);
  assert.match(plugin,/'slug'\s*=>\s*'hotel-job'/);
  assert.match(plugin,/'slug'\s*=>\s*'hotel-jobs\/country'/);
  assert.match(plugin,/register_taxonomy\('ma_job_country'/);
  assert.match(plugin,/'rest_base'\s*=>\s*'ma_hotel_job'/);
  assert.match(plugin,/'rest_base'\s*=>\s*'ma_job_country'/);
});

test('existing jobs page shortcode survives the plugin swap',()=>{
  assert.match(plugin,/shortcode_exists\('ma_hotels_jobs'\)/);
  assert.match(plugin,/add_shortcode\('ma_hotels_jobs',\s*'mah_jobs_lite_shortcode'\)/);
  assert.match(plugin,/post_status'\s*=>\s*'publish'/);
});

test('lightweight plugin does not schedule collection, call external providers or delete saved jobs',()=>{
  for(const method of ['wp_schedule_event','wp_remote_get','wp_remote_post','curl_exec','wp_delete_post','delete_posts','DROP TABLE']){
    assert.equal(plugin.includes(method),false,method+' is forbidden in the lightweight bridge');
  }
});

test('safe independent preview is admin-only and keeps the legacy shortcode in charge',()=>{
  assert.match(plugin,/add_shortcode\('ma_hotels_jobs_lite_preview'/);
  assert.match(plugin,/current_user_can\('manage_options'\)/);
  assert.match(plugin,/if \(shortcode_exists\('ma_hotels_jobs'\)\)/);
  assert.match(plugin,/return '';/);
});
