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

test('lite accepts legacy filter links and preview fallbacks',()=>{
  for (const param of ['mh_city','mh_role','mh_month','mh_year','mh_country','mhj_city','mhj_job','mhj_month','mhj_year','mhj_country']) {
    assert.ok(plugin.includes(param),param+' filter missing');
  }
  assert.match(plugin,/array\('per_page'\s*=>\s*20\)/);
  assert.match(plugin,/_ma_job_posted_on/);
  assert.match(plugin,/_ma_job_city/);
  assert.match(plugin,/_ma_job_role/);
  assert.match(plugin,/sanitize_text_field\(wp_unslash/);
  assert.match(plugin,/mah_jobs_lite_active_clause\(\)/);
});

test('legacy details remain escaped and old plugin retains ownership when active',()=>{
  assert.match(plugin,/class_exists\('MA_Hotels_Jobs'\)/);
  assert.match(plugin,/_ma_job_source_url/);
  assert.match(plugin,/esc_url\(\$source, array\('http', 'https'\)\)/);
  assert.match(plugin,/esc_html\(\$value\)/);
  assert.match(plugin,/_ma_job_expires_on/);
});
