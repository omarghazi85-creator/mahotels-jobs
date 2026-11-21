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
$editor_nonce = wp_create_nonce('mah_jobs_lite_save');
wp_set_current_user(0);
$_POST = array('mah_jobs_lite_nonce'=>$editor_nonce, 'mah_lite_company'=>'unauthorized');
do_action('save_post_ma_hotel_job', $active);
assert_job(get_post_meta($active, '_ma_job_company', true) === 'فندق اختبار', 'anonymous edit blocked');
$_POST = array();

// Evidence of the remaining duplicate-detection gap: protected legacy metadata
// must not be assumed to be available over REST merely because it exists in WP.
wp_set_current_user($admin->ID);
$request = new WP_REST_Request('GET', '/wp/v2/ma_hotel_job/' . $active);
$request->set_param('context', 'edit');
$response = rest_do_request($request);
assert_job($response->get_status() === 200, 'admin REST read works');
$rest_data = $response->get_data();
assert_job(empty($rest_data['meta']['_ma_job_source_url']), 'legacy source metadata is not exposed in REST');
$lookup = function ($url, $source = 'marriott', $id = 'not-matching') {
    $r = new WP_REST_Request('POST', '/mahotels-jobs/v1/source-exists');
    $r->set_param('source_url', $url);
    $r->set_param('source', $source);
    $r->set_param('original_id', $id);
    return rest_do_request($r);
};
$found = $lookup('https://example.com/apply?x=1&y=2');
assert_job($found->get_status() === 200 && $found->get_data() === array('exists'=>true), 'authorized lookup finds existing source');
$other = $lookup('https://example.com/apply?x=1&y=3');
assert_job($other->get_status() === 200 && $other->get_data() === array('exists'=>false), 'different query remains distinct');
$other_id = wp_insert_post(array('post_type'=>'ma_hotel_job', 'post_status'=>'draft', 'post_title'=>'إعلان آخر'));
update_post_meta($other_id, '_ma_job_source_url', 'https://example.com/apply?x=1&y=3');
assert_job($lookup('https://example.com/apply?x=1&y=3')->get_data() === array('exists'=>true), 'new source is found immediately after a previous miss');
// Simulate a missing metadata table on the disposable database and fail closed.
global $wpdb;
$original_postmeta_table = $wpdb->postmeta;
$wpdb->postmeta = $original_postmeta_table . '_missing_fixture';
$old_suppression = $wpdb->suppress_errors(true);
$failure = $lookup('https://example.com/apply?x=1&y=2');
$wpdb->postmeta = $original_postmeta_table;
$wpdb->suppress_errors($old_suppression);
assert_job($failure->get_status() === 503, 'database failure does not look like a clean duplicate check');
$draft = wp_insert_post(array('post_type'=>'ma_hotel_job', 'post_status'=>'draft', 'post_title'=>'مسودة'));
update_post_meta($draft, '_ma_job_source_url', 'https://example.com/draft?id=10');
assert_job($lookup('https://example.com/draft?id=10')->get_data() === array('exists'=>true), 'draft considered for duplicates');
update_post_meta($draft, '_ma_job_source_id', 'AccorHotel:123456789');
assert_job($lookup('https://example.com/different?utm_source=test', 'accor', '123456789')->get_data() === array('exists'=>true), 'identity finds same job with different URL parameters');
update_post_meta($draft, '_ma_job_source_id', 'Accor:123456789');
assert_job($lookup('https://example.com/elsewhere', 'accor', '123456789')->get_data() === array('exists'=>true), 'Accor legacy alias supported');
wp_trash_post($draft);
assert_job($lookup('https://example.com/elsewhere', 'accor', '123456789')->get_data() === array('exists'=>true), 'trashed jobs also suppress duplicates');
assert_job($lookup('https://example.com/elsewhere', 'unknown', '123456789')->get_status() === 400, 'unknown provider rejected');
assert_job($lookup('javascript:alert(1)')->get_status() === 400, 'invalid scheme rejected');
$subscriber = wp_create_user('unprivileged', 'fixture-password', 'subscriber@example.test');
wp_set_current_user($subscriber);
assert_job($lookup('https://example.com/apply?x=1&y=2')->get_status() === 403, 'subscriber denied');
wp_set_current_user(0);
assert_job($lookup('https://example.com/apply?x=1&y=2')->get_status() === 401, 'anonymous lookup denied');
wp_set_current_user($admin->ID);

// Existing pagination should point to the next page without dropping filters.
$second = wp_insert_post(array('post_type'=>'ma_hotel_job', 'post_status'=>'publish', 'post_title'=>'وظيفة ثانية', 'post_content'=>'الوصف'));
wp_set_object_terms($second, array((int)$term['term_id']), 'ma_job_country');
update_post_meta($second, '_ma_job_city', 'مدينة اختبار');
update_post_meta($second, '_ma_job_role', 'مدير اختبار');
update_post_meta($second, '_ma_job_posted_on', '2026-10-05');
$_SERVER['REQUEST_URI'] = '/hotel-jobs?mh_country=test-country';
$_GET = array('mh_country'=>'test-country');
$first_page = html_entity_decode(mah_jobs_lite_shortcode(array('per_page'=>1)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
assert_job(strpos($first_page, 'mh_page=2') !== false, 'next-page link points to page 2');
assert_job(strpos($first_page, 'mh_country=test-country') !== false, 'next-page link retains country');
$_GET['mh_page'] = '2';
$second_page = mah_jobs_lite_shortcode(array('per_page'=>1));
assert_job(strpos($first_page, 'وظيفة ثانية') !== false || strpos($first_page, 'وظيفة نشطة') !== false, 'first page has a fixture');
assert_job((strpos($first_page, 'وظيفة ثانية') !== false) !== (strpos($second_page, 'وظيفة ثانية') !== false), 'pagination returns different jobs');

// A valid country-only board remains indexable, consistent with the legacy rule.
$board = wp_insert_post(array('post_type'=>'page', 'post_status'=>'publish', 'post_name'=>'hotel-jobs', 'post_title'=>'وظائف'));
$wp_query = new WP_Query(array('page_id'=>$board));
$wp_the_query = $wp_query;
$_GET = array('mh_country'=>'test-country');
$robots = apply_filters('wp_robots', array());
assert_job(empty($robots['noindex']), 'valid country-only board remains indexable');

// Populate a generated draft through the private bridge, never through public meta.
$fresh = wp_insert_post(array('post_type'=>'ma_hotel_job', 'post_status'=>'draft',
    'post_title'=>'موظف استقبال', 'post_name'=>'ma-jobs-' . str_repeat('a', 32)));
$bridge = function ($method, $id, $payload = array()) {
    $r = new WP_REST_Request($method, '/mahotels-jobs/v1/draft-fields/' . $id);
    foreach ($payload as $key=>$value) { $r->set_param($key, $value); }
    return rest_do_request($r);
};
$payload = array('source'=>'marriott', 'original_id'=>'P1-7571916-0',
    'source_url'=>'https://careers.marriott.com/job/P1-7571916-0?ref=A%2BB&x=2',
    'company'=>'فندق اختبار', 'city'=>'الرياض', 'role'=>'موظف استقبال',
    'posted_on'=>'2026-10-04', 'expires_on'=>'2026-12-20');
wp_set_current_user($admin->ID);
$route_options = new WP_REST_Request('OPTIONS', '/mahotels-jobs/v1/draft-fields/1');
$preflight = rest_do_request($route_options);
assert_job($preflight->get_status() === 200 && in_array('GET', $preflight->get_data()['methods'], true) &&
    in_array('POST', $preflight->get_data()['methods'], true), 'draft bridge route can be preflighted before creation');
wp_set_current_user(0);
assert_job($bridge('POST', $fresh, $payload)->get_status() === 401, 'anonymous draft write denied');
assert_job($bridge('GET', $fresh)->get_status() === 401, 'anonymous draft metadata read denied');
wp_set_current_user($subscriber);
assert_job($bridge('POST', $fresh, $payload)->get_status() === 403, 'subscriber draft write denied');
wp_set_current_user($admin->ID);
$bad = $payload;
$bad['expires_on'] = '2026-02-30';
assert_job($bridge('POST', $fresh, $bad)->get_status() === 400, 'bad expiry is rejected');
assert_job(!metadata_exists('post', $fresh, '_ma_job_source_id'), 'bad input writes no metadata');
$written = $bridge('POST', $fresh, $payload);
assert_job($written->get_status() === 200, 'draft fields are written');
$readback = $bridge('GET', $fresh);
$fields = $readback->get_data()['fields'];
assert_job($readback->get_status() === 200 && $fields['source_id'] === 'Marriott:P1-7571916-0', 'legacy source identity stored');
assert_job($fields['source_url'] === $payload['source_url'], 'draft source URL and parameters unchanged');
assert_job($fields['company'] === $payload['company'] && $fields['city'] === $payload['city'] && $fields['role'] === $payload['role'], 'core draft fields retained');
assert_job($fields['posted_on'] === $payload['posted_on'] && $fields['expires_on'] === $payload['expires_on'], 'supplied dates retained');
assert_job($fields['ar_ready'] === '0' && $fields['verified_on'] === '', 'draft remains unverified and not Arabic-ready');
assert_job(get_post_status($fresh) === 'draft', 'bridge does not publish');
assert_job(class_exists('MA_Hotels_Jobs_Lite_SEO') && !MA_Hotels_Jobs_Lite_SEO::eligible($fresh), 'unverified draft remains ineligible for JobPosting');
assert_job($bridge('POST', $fresh, $payload)->get_status() === 409, 'repeat write requires manual review');
assert_job($bridge('POST', $active, $payload)->get_status() === 403, 'published item cannot be modified');
echo "WordPress isolated integration passed\n";
