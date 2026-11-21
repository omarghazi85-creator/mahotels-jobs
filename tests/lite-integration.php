<?php
/** Runs only against a disposable WordPress database inside CI. */
function assert_job($condition, $message) {
    if (!$condition) { fwrite(STDERR, "FAIL: $message\n"); exit(1); }
}
$term = wp_insert_term('بلد تجريبي', 'ma_job_country', array('slug' => 'test-country'));
assert_job(!is_wp_error($term), 'create country');
$active = wp_insert_post(array('post_type'=>'ma_hotel_job', 'post_status'=>'publish', 'post_title'=>'وظيفة نشطة', 'post_content'=>'الوصف'));
$expired = wp_insert_post(array('post_type'=>'ma_hotel_job', 'post_status'=>'publish', 'post_title'=>'وظيفة منتهية', 'post_content'=>'الوصف'));
assert_job($active && $expired, 'create fixtures');
foreach (array($active, $expired) as $id) {
    wp_set_object_terms($id, array((int)$term['term_id']), 'ma_job_country');
    update_post_meta($id, '_ma_job_city', 'مدينة اختبار');
    update_post_meta($id, '_ma_job_role', 'مدير اختبار');
    update_post_meta($id, '_ma_job_posted_on', '2026-10-04');
}
update_post_meta($active, '_ma_job_company', 'فندق اختبار');
update_post_meta($active, '_ma_job_source_url', 'https://example.com/apply?x=1&y=2');
update_post_meta($expired, '_ma_job_expires_on', '2000-01-01');
$_GET = array('mh_country'=>'test-country', 'mh_city'=>'مدينة اختبار', 'mh_role'=>'مدير اختبار', 'mh_month'=>'10', 'mh_year'=>'2026');
$html = mah_jobs_lite_shortcode();
assert_job(strpos($html, 'وظيفة نشطة') !== false, 'matching active job visible');
assert_job(strpos($html, 'وظيفة منتهية') === false, 'expired job excluded');
$_GET['mh_city'] = 'مدينة مختلفة';
assert_job(strpos(mah_jobs_lite_shortcode(), 'وظيفة نشطة') === false, 'city filter excludes mismatch');
$_GET = array('mh_country'=>'missing-country');
assert_job(strpos(mah_jobs_lite_shortcode(), 'وظيفة نشطة') === false, 'unknown country excludes matches');
// Exercise the actual main WordPress query and the_content filter.
global $wp_query, $wp_the_query, $post;
$wp_query = new WP_Query(array('post_type'=>'ma_hotel_job', 'p'=>$active));
$wp_the_query = $wp_query;
assert_job($wp_query->have_posts(), 'single fixture loaded');
$wp_query->the_post();
$content = apply_filters('the_content', get_the_content());
assert_job(strpos($content, 'فندق اختبار') !== false, 'company displayed');
$decoded = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');
assert_job(strpos($decoded, 'https://example.com/apply?x=1&y=2') !== false, 'source URL and query retained');
wp_reset_postdata();
// Verify editing preserves existing metadata on malformed dates and rejects writes without a nonce.
$admin = get_user_by('login', 'fixture_admin');
wp_set_current_user($admin->ID);
$_POST = array('mah_lite_expires_on'=>'2030-02-30');
do_action('save_post_ma_hotel_job', $active);
assert_job(get_post_meta($active, '_ma_job_expires_on', true) === '', 'missing nonce blocks writes');
$_POST['mah_jobs_lite_nonce'] = wp_create_nonce('mah_jobs_lite_save');
do_action('save_post_ma_hotel_job', $active);
assert_job(get_post_meta($active, '_ma_job_expires_on', true) === '', 'invalid date is rejected');
$_POST['mah_lite_expires_on'] = '2030-02-28';
do_action('save_post_ma_hotel_job', $active);
assert_job(get_post_meta($active, '_ma_job_expires_on', true) === '2030-02-28', 'valid date is stored');
$_POST = array();
echo "WordPress isolated integration passed\n";
